import { Environment } from "@/types/worker";
import { PackagesJson } from "../types";

export default async function* uninstall(
	env: Environment,
	packages: PackagesJson,
	[_, subcommand, ...finalParams]: Partial<string[]>
) {
	const toUninstall = [subcommand, ...finalParams].filter(
		(item) => item !== undefined
	);

	if (toUninstall.length == 0) {
		env.print("You must specify a package name to uninstall.");
		return;
	}

	for (const target of toUninstall) {
		const removingPackage = packages.packages[target];
		if (!removingPackage) {
			env.print("Package not installed.");
			continue;
		}

		for (const filepath of removingPackage.files) await env.fs.rm(filepath);

		for (const repo of packages.repositories) {
			if (repo.packages[target]) {
				delete repo.packages[target];
			}
		}

		delete packages.packages[target];
	}
}
