import { Environment } from "@/types/worker";
import { PackagesJson } from "../types";
import getNetworking from "../network";
import { getMainPath } from "../fs";

export default async function* update(
	env: Environment,
	packages: PackagesJson,
	[_, subcommand, ...finalParams]: Partial<string[]>
) {
	const { fetch, resolvePackageFromRepos } = getNetworking(env, packages);

	const targets = [subcommand, ...finalParams].filter(Boolean);
	const updateAll = targets.length === 0;
	const installedPackages = Object.keys(packages.packages);
	const toUpdate = updateAll ? installedPackages : targets;

	if (toUpdate.length === 0) {
		env.print([
			{
				text: "No packages to update.",
				colour: "#ff0000"
			}
		]);
		return;
	}

	let totalUpdated = 0;

	for (const packageName of toUpdate) {
		if (!packageName) continue;

		const localPkg = packages.packages[packageName];
		if (!localPkg) {
			env.print([
				{
					text: `Package ${packageName} is not installed.`,
					colour: "#ff0000"
				}
			]);
			continue;
		}

		const resolved = await resolvePackageFromRepos(packageName);

		if (!resolved) {
			env.print([
				{
					text: `No repository contains ${packageName}.`,
					colour: "#ff0000"
				}
			]);
			continue;
		}

		const { repo, meta } = resolved;

		if (
			localPkg.published &&
			meta.published &&
			meta.published <= localPkg.published
		) {
			// silently skip
			continue;
		}
		totalUpdated++;

		let sourceRequest = await fetch(
			repo.url + `/packages/${packageName}/${packageName}.js`
		);

		if (!sourceRequest.isOk) {
			sourceRequest = await fetch(
				repo.url + `/packages/${packageName}/package.js`
			);

			if (!sourceRequest.isOk) {
				throw new Error(
					`Source code for package ${packageName} could not be found.`
				);
			}
		}

		const source = sourceRequest.response;

		if (!source) {
			env.print([
				{
					text: `Failed to fetch update for ${packageName}.`,
					colour: "#ff0000"
				}
			]);
			continue;
		}

		const binpath = getMainPath(packageName);

		await env.fs.writeFile(binpath, source);

		packages.packages[packageName] = {
			...meta,
			files: [binpath]
		};

		env.print([
			{
				text: `Updated ${packageName}.`,
				colour: "#00ff00"
			}
		]);
	}

	if (totalUpdated == 0) {
		env.print([
			{
				text: "All packages are already up to date.",
				colour: "#00ff00"
			}
		]);
	}
}
