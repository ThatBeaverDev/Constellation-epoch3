import { Environment } from "@/types/worker";
import { PackagesJson } from "./types";
import { PKG_PACKAGE_FILE } from "./pkg";
import { objectFallback } from "@/lib/object";

export function getMainPath(name: string) {
	if (name.startsWith("lib-")) {
		return `/lib/${name}.js`;
	}

	return `/bin/${name}.js`;
}

export default function getFs(env: Environment) {
	async function writePackages(packages: PackagesJson) {
		await env.fs.writeFile(
			PKG_PACKAGE_FILE,
			JSON.stringify(packages, null, 4)
		);
	}

	async function readPackages() {
		return objectFallback<PackagesJson>(
			await env.fs.readFile(PKG_PACKAGE_FILE, "json"),
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

	return { writePackages, readPackages };
}
