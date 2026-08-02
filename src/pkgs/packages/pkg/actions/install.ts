import { Environment } from "@/types/worker";
import {
	Package,
	PackagesJson,
	RemotePackage,
	RemotePackagesJson
} from "../types";
import getNetworking from "../network";
import packageInstall from "../pkg";
import getFs, { getMainPath } from "../fs";

export default async function* install(
	env: Environment,
	packages: PackagesJson,
	[_, subcommand, ...finalParams]: Partial<string[]>
) {
	const { fetch } = getNetworking(env, packages);
	const { writePackages, readPackages } = getFs(env);

	const toInstall = [subcommand, ...finalParams].filter(
		(item) => item !== undefined
	);

	if (toInstall.length == 0) {
		env.print([
			{
				text: "You must specify a package name to install.",
				colour: "#ff0000"
			}
		]);
		return;
	}

	const repositoryPackagesJsons: Map<string, RemotePackagesJson> = new Map();

	for (const packageName of toInstall) {
		if (packages.packages[packageName]) {
			env.print([
				{
					text: `Package ${packageName} is already installed.`,
					colour: "#00ff00"
				}
			]);
			continue;
		}

		if (packages.repositories.length == 0) {
			env.print([
				{
					text: "You must add a repository to install from",
					colour: "#ff0000"
				}
			]);
			break;
		}

		let found = false;
		for (const repo of packages.repositories) {
			const url = repo.url;

			if (!repositoryPackagesJsons.has(url)) {
				const repoJsonRequest = await fetch<RemotePackagesJson>(
					url + "/packages.json",
					true
				);

				if (!repoJsonRequest.isOk) {
					env.warn(
						`Repository at ${repo.url} did not respond with a package.json.`
					);

					continue;
				}

				repositoryPackagesJsons.set(url, repoJsonRequest.response);
			}

			const repoPackageJson = repositoryPackagesJsons.get(url)!;

			const packageInfo: RemotePackage | undefined =
				repoPackageJson?.packages?.[packageName];
			if (!packageInfo) continue;

			env.print(`Match for ${packageName} found in repository ${url}`);

			const main = packageInfo.main ?? true;
			const binpath = getMainPath(packageName);
			if (main) {
				try {
					const sourceRequest = await fetch([
						url + `/packages/${packageName}.js`,
						url + `/packages/${packageName}/${packageName}.js`,
						url + `/packages/${packageName}/package.js`
					]);

					if (!sourceRequest.isOk) {
						throw new Error(
							`Source code for package ${packageName} could not be found.`
						);
					}

					const source = sourceRequest.response;

					if (!source) continue;
					env.print(`Match has source, installing`);

					await env.fs.writeFile(binpath, source);
				} catch (e) {
					throw new Error(
						`Source code for package ${packageName} could not be found.`
					);
				}
			}

			if (packageInfo.directories) {
				env.print(
					`Creating ${packageInfo.directories.length} directories...`
				);
				for (const dir of packageInfo.directories) {
					await env.fs.mkdir(dir);
				}
			}

			const pkg: Package = {
				...packageInfo,
				files: [main ? binpath : undefined].filter(
					(item) => item !== undefined
				),
				directories: packageInfo.directories
			};

			packages.packages[packageName] = pkg;
			repo.packages[packageName] = pkg;

			if (packageInfo.dependencies) {
				env.print(
					`Installing ${packageInfo.dependencies?.length} dependencies...`
				);

				// need to refresh `packages` for this.
				await writePackages(packages);

				for (const name of packageInfo.dependencies) {
					yield* packageInstall(env, ["install", name]);
				}

				packages = await readPackages();
			}

			env.print([
				{
					text: `Package ${packageName} successfully installed.`,
					colour: "#00ff00"
				}
			]);

			found = true;
			break;
		}

		if (!found)
			env.print([
				{
					text: `Package ${packageName} was not found in any repositories.`,
					colour: "#ff0000"
				}
			]);
	}
}
