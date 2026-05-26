import { Environment } from "../util/types/worker";
import { objectFallback } from "../util/lib/object";

// remote

export interface RemotePackagesJson {
	packages: Partial<Record<string, RemotePackage>>;
}

export interface RemotePackage {
	author: string;
	dependencies?: string[];
}

// local

export interface Repository {
	url: string;
	packages: Partial<Record<string, Package>>;
}

export interface PackagesJson extends RemotePackagesJson {
	packages: Partial<Record<string, Package>>;
	repositories: Repository[];
}

export interface Package extends RemotePackage {
	files: string[];
}

export default async function* packageInstall(
	env: Environment,
	[command, subcommand, ...finalParams]: Partial<string[]>
): AsyncGenerator<never, void, unknown> {
	const dataDirectory = "/data/pkgs";
	const packageFile = env.path.join(dataDirectory, "packages.json");

	await env.fs.mkdir(dataDirectory);

	const packages = objectFallback<PackagesJson>(
		await env.fs.readFile(packageFile, "json"),
		{
			packages: {},
			repositories: [
				{
					url: "https://git.rotur.dev/Constellation/packages/raw/main",
					packages: {}
				}
			]
		}
	);

	async function fetch(url: string, json?: false): Promise<string>;
	async function fetch<T extends Object = Object>(
		url: string,
		json: true
	): Promise<T>;
	async function fetch<T extends Object = Object>(
		url: string,
		json: boolean = false
	) {
		const corsURL = `https://proxy.mistium.com/?url=${url}`;

		return await env.network.request<T>(
			"get",
			corsURL,
			json ? "json" : "text"
		);
	}

	switch (command) {
		case "install":
		case "add":
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
				break;
			}

			const repoJsons: Partial<Record<string, RemotePackagesJson>> = {};

			for (const packageName of toInstall) {
				if (packages.packages[packageName]) {
					env.print([
						{
							text: `Package '${packageName}' is already installed.`,
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

					const repoPackageJson =
						repoJsons[url] ??
						(await fetch<RemotePackagesJson>(
							url + "/packages.json",
							true
						));
					repoJsons[url] = repoPackageJson;

					const packageInfo =
						repoPackageJson?.packages?.[packageName];
					if (!packageInfo) continue;

					env.print(
						`Match for ${packageName} found in repository ${url}`
					);

					const source = await fetch(
						url + `/packages/${packageName}/package.js`
					);

					if (!source) continue;
					env.print(`Match has source, installing`);

					const binpath = `/bin/${packageName}.js`;
					const pkg: Package = {
						...packageInfo,
						files: [binpath]
					};

					packages.packages[packageName] = pkg;
					repo.packages[packageName] = pkg;

					if (packageInfo.dependencies) {
						env.print(
							`Installing ${packageInfo.dependencies?.length} dependencies...`
						);
						for (const name of packageInfo.dependencies) {
							yield* packageInstall(env, ["install", name]);
						}
					}

					await env.fs.writeFile(binpath, source);
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

			break;

		case "uninstall":
		case "remove":
			const toUninstall = [subcommand, ...finalParams].filter(
				(item) => item !== undefined
			);

			if (toUninstall.length == 0) {
				env.print("You must specify a package name to uninstall.");
				break;
			}

			for (const target of toUninstall) {
				const isInstalled = packages.packages[target] !== undefined;
				if (!isInstalled) {
					env.print("Package not installed.");
					continue;
				}

				await env.fs.rm(`/bin/${target}.js`);

				for (const repo of packages.repositories) {
					if (repo.packages[target]) {
						delete repo.packages[target];
					}
				}

				delete packages.packages[target];
			}

			break;

		case "list":
			const names: string[] = [];

			if (subcommand == "remote") {
				for (const repo of packages.repositories) {
					const url = repo.url;

					const repoPackageJson = await fetch<RemotePackagesJson>(
						url + "/packages.json",
						true
					);

					for (const name in repoPackageJson.packages)
						names.push(`${url} - ${name}`);
				}
			} else {
				for (const name in packages.packages) names.push(name);
			}

			env.print([
				{ text: `${names.length} package(s):\n`, colour: "#29dee8" },
				...names.map((item) => {
					return { text: item + "\n" };
				})
			]);

			break;

		case "repo":
		case "repos":
			switch (subcommand) {
				case "add":
					if (!finalParams?.[0]) {
						env.print([
							{
								text: "You must specify a repository URL to add",
								colour: "#ff0000"
							}
						]);
						break;
					}

					for (const url of finalParams) {
						if (!url) continue;

						const repository: Repository = {
							url,
							packages: {}
						};
						packages.repositories.push(repository);

						env.print([
							{
								text: `Repository successfully added.`,
								colour: "#00ff00"
							}
						]);
					}

					break;

				case "list":
					env.print([
						{
							text: `${packages.repositories.length} repositories:\n`,
							colour: "#29dee8"
						},
						...packages.repositories.map((item) => {
							return {
								text: `${item.url} (${Object.keys(item.packages).length} packages)\n`
							};
						})
					]);

					break;

				case "remove":
					if (!finalParams?.[0]) {
						env.print([
							{
								text: "You must specify a repository URL to remove",
								colour: "#ff0000"
							}
						]);
						break;
					}

					for (const name of finalParams) {
						if (!name) continue;

						let orphanedPackages: [string, Package | undefined][] =
							[];
						packages.repositories = packages.repositories.filter(
							(repo) => {
								const remove = repo.url == name;

								if (remove) {
									orphanedPackages.push(
										...Object.entries(repo.packages)
									);
								}

								return !remove;
							}
						);

						env.print([
							{
								text: `Repositories of URL ${name} removed. ${orphanedPackages.length > 0 ? `${orphanedPackages.length} packages are now orphaned.` : ""}`
							}
						]);
					}

					break;

				default:
					if (finalParams?.[0])
						env.print([
							{ text: `Unknown subcommand: ${finalParams[0]}` }
						]);

					env.print([
						{
							text: "Commands:\npkg [add|install]\npkg [remove|uninstall]\npkg list [Local|remote]\npkg [repo|repos] [add|list|remove|listpkgs]"
						}
					]);
			}

			break;

		default:
			if (command) env.print([{ text: `Unknown command: ${command}` }]);

			env.print([
				{
					text: "Commands:\npkg [add|install]\npkg [remove|uninstall]\npkg list [Local|remote]\npkg [repo|repos] [add|list|remove|listpkgs]"
				}
			]);
	}

	await env.fs.writeFile(packageFile, JSON.stringify(packages, null, 4));
}
