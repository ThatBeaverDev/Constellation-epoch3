import { Environment } from "@/types/worker";
import { Package, PackagesJson } from "../types";

export default async function* repos(
	env: Environment,
	packages: PackagesJson,
	[_, subcommand, ...subcommandParams]: Partial<string[]>
) {
	function* addRepos() {
		if (!subcommandParams?.[0]) {
			env.print([
				{
					text: "You must specify a repository URL to add",
					colour: "#ff0000"
				}
			]);
			return;
		}

		for (const url of subcommandParams) {
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
	}

	function* listRepos() {
		env.print([
			{
				text: `${packages.repositories.length} repositories:\n`,
				colour: "#29dee8"
			},
			...packages.repositories.map((item) => ({
				text: `${item.url} (${Object.keys(item.packages).length} packages)\n`
			}))
		]);
	}

	function* removeRepos() {
		if (!subcommandParams?.[0]) {
			env.print([
				{
					text: "You must specify a repository URL to remove",
					colour: "#ff0000"
				}
			]);
			return;
		}

		for (const name of subcommandParams) {
			if (!name) continue;

			let orphanedPackages: [string, Package | undefined][] = [];
			packages.repositories = packages.repositories.filter((repo) => {
				const remove = repo.url == name;

				if (remove) {
					orphanedPackages.push(...Object.entries(repo.packages));
				}

				return !remove;
			});

			env.print([
				{
					text: `Repositories of URL ${name} removed. ${orphanedPackages.length > 0 ? `${orphanedPackages.length} packages are now orphaned.` : ""}`
				}
			]);
		}
	}

	switch (subcommand) {
		case "add":
			yield* addRepos();
			break;

		case "list":
			yield* listRepos();
			break;

		case "remove":
			yield* removeRepos();
			break;

		default:
			if (subcommandParams?.[0])
				env.print([
					{
						text: `Unknown subcommand: ${subcommandParams[0]}`,
						colour: "#ff0000"
					}
				]);

			env.print([
				{
					text: "Commands:\npkg [add|install]\npkg [remove|uninstall]\npkg list [Local|remote]\npkg [repo|repos] [add|list|remove|listpkgs]"
				}
			]);
	}
}
