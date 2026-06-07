import { Environment, NetworkDataResponse } from "../../../util/types/worker";
import { objectFallback } from "../../../util/lib/object";

// remote

export interface RemotePackagesJson {
	packages: Partial<Record<string, RemotePackage>>;
}

export interface RemotePackage {
	author?: string;
	dependencies?: string[];
	published?: number;
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

	let packages = await readPackages();
	async function readPackages() {
		return objectFallback<PackagesJson>(
			await env.fs.readFile(packageFile, "json"),
			{
				packages: {},
				repositories: [
					{
						url: "/dist/pkgs",
						packages: {}
					},
					{
						url: "https://git.rotur.dev/Constellation/packages/raw/main",
						packages: {}
					}
				]
			}
		);
	}

	async function writePackages(packages: PackagesJson) {
		await env.fs.writeFile(packageFile, JSON.stringify(packages, null, 4));
	}

	async function fetch(
		url: string,
		json?: false
	): Promise<NetworkDataResponse<string>>;
	async function fetch<T extends Object = Object>(
		url: string,
		json: true
	): Promise<NetworkDataResponse<T>>;
	async function fetch<T extends Object = Object>(
		url: string,
		json: boolean = false
	) {
		async function corsRequest() {
			const corsURL = `https://proxy.mistium.com/?url=${encodeURIComponent(url)}`;

			const corsRequest = await env.network.request<T>(
				"get",
				corsURL,
				json ? "json" : "text",
				undefined,
				undefined,
				{ cache: false }
			);

			return corsRequest;
		}

		try {
			const standardRequest = await env.network.request<T>(
				"get",
				url,
				json ? "json" : "text",
				undefined,
				undefined,
				{ cache: false }
			);

			if (!standardRequest.isOk) return corsRequest();

			return standardRequest;
		} catch (e) {
			return corsRequest();
		}
	}

	async function resolvePackageFromRepos(packageName: string) {
		for (const repo of packages.repositories) {
			const jsonRequest = await fetch<RemotePackagesJson>(
				repo.url + "/packages.json",
				true
			);

			if (!jsonRequest.isOk) {
				env.warn(
					`Repository at ${repo.url} did not respond with a package.json.`
				);
				continue;
			}

			const repoJson = jsonRequest.response;

			const pkg = repoJson?.packages?.[packageName];
			if (!pkg) continue;

			return {
				repo,
				meta: pkg
			};
		}
		return null;
	}

	switch (command) {
		case "install":
		case "add": {
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

					if (!repoJsons[url]) {
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

						repoJsons[url] = repoJsonRequest.response;
					}

					const repoPackageJson = repoJsons[url];

					const packageInfo =
						repoPackageJson?.packages?.[packageName];
					if (!packageInfo) continue;

					env.print(
						`Match for ${packageName} found in repository ${url}`
					);

					let sourceRequest = await fetch(
						url + `/packages/${packageName}/${packageName}.js`
					);

					if (!sourceRequest.isOk) {
						sourceRequest = await fetch(
							url + `/packages/${packageName}/package.js`
						);

						if (!sourceRequest.isOk) {
							throw new Error(
								`Source code for package ${packageName} could not be found.`
							);
						}
					}

					const source = sourceRequest.response;

					if (!source) continue;
					env.print(`Match has source, installing`);

					const binpath = `/bin/${packageName}.js`;
					const pkg: Package = {
						...packageInfo,
						files: [binpath]
					};

					packages.packages[packageName] = pkg;
					repo.packages[packageName] = pkg;

					await env.fs.writeFile(binpath, source);

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

			break;
		}

		case "uninstall":
		case "remove": {
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
		}

		case "list": {
			const names: string[] = [];

			if (subcommand == "remote") {
				for (const repo of packages.repositories) {
					const repoPackageJsonRequest =
						await fetch<RemotePackagesJson>(
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

			break;
		}

		case "repo":
		case "repos": {
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

						packages.repositories.push({
							url,
							packages: {}
						});

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
						...packages.repositories.map((item) => ({
							text: `${item.url} (${Object.keys(item.packages).length} packages)\n`
						}))
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
							{
								text: `Unknown subcommand: ${finalParams[0]}`,
								colour: "#ff0000"
							}
						]);

					env.print([
						{
							text: "Commands:\npkg [add|install]\npkg [remove|uninstall]\npkg list [Local|remote]\npkg [repo|repos] [add|list|remove|listpkgs]"
						}
					]);
			}

			break;
		}

		case "update": {
			// what the user asked for
			const targets = [subcommand, ...finalParams].filter(Boolean);

			// whether the user asked for none, and so wants to update all
			const updateAll = targets.length === 0;

			// installed package names
			const installed = Object.keys(packages.packages);

			// what to update
			const toUpdate = updateAll ? installed : targets;

			if (toUpdate.length === 0) {
				env.print([
					{
						text: "No packages to update.",
						colour: "#ff0000"
					}
				]);
				break;
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

				const binpath = `/bin/${packageName}.js`;

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

			break;
		}

		default:
			if (command)
				env.print([
					{ text: `Unknown command: ${command}`, colour: "#ff0000" }
				]);

			env.print([
				{
					text: "Commands:\npkg [add|install]\npkg [remove|uninstall]\npkg list [local|remote]\npkg [repo|repos] [add|list|remove]\npkg update [name]"
				}
			]);
	}

	await writePackages(packages);
}
