import { Environment } from "@/types/worker";
import install from "./actions/install";
import getFs from "./fs";
import uninstall from "./actions/uninstall";
import list from "./actions/list";
import repos from "./actions/repos";
import update from "./actions/update";

export const PKG_DATA_DIRECTORY = "/data/pkgs";
export const PKG_PACKAGE_FILE = `${PKG_DATA_DIRECTORY}/packages.json`;

export default async function* packageInstall(
	env: Environment,
	[command, subcommand, ...finalParams]: Partial<string[]>
): AsyncGenerator<never, void, unknown> {
	const args = [command, subcommand, ...finalParams];

	await env.fs.mkdir(PKG_DATA_DIRECTORY);

	const { readPackages, writePackages } = getFs(env);
	let packages = await readPackages();

	switch (command) {
		case "install":
		case "add": {
			yield* install(env, packages, args);
			break;
		}

		case "uninstall":
		case "remove": {
			yield* uninstall(env, packages, args);

			break;
		}

		case "list": {
			yield* list(env, packages, args);
			break;
		}

		case "repo":
		case "repos": {
			yield* repos(env, packages, args);

			break;
		}

		case "update": {
			yield* update(env, packages, args);

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
