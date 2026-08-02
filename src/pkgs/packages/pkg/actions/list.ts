import { Environment } from "@/types/worker";
import { PackagesJson, RemotePackagesJson } from "../types";
import getNetworking from "../network";

export default async function* list(
	env: Environment,
	packages: PackagesJson,
	[_, subcommand]: Partial<string[]>
) {
	const { fetch } = getNetworking(env, packages);

	const names: string[] = [];

	if (subcommand == "remote") {
		for (const repo of packages.repositories) {
			const repoPackageJsonRequest = await fetch<RemotePackagesJson>(
				repo.url + "/packages.json",
				true
			);

			if (!repoPackageJsonRequest.isOk) {
				env.warn(
					`Repository at ${repo.url} did not respond with a package.json.`
				);
				continue;
			}

			const repoPackageJson = repoPackageJsonRequest.response;

			for (const name in repoPackageJson.packages)
				names.push(`${name} (${repo.url})`);
		}
	} else {
		for (const name in packages.packages) names.push(name);
	}

	env.print([
		{ text: `${names.length} package(s):\n`, colour: "#29dee8" },
		...names.map((item) => ({ text: item + "\n" }))
	]);
}
