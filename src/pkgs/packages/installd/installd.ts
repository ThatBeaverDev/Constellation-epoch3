import { Environment } from "../../../util/types/worker";
import { objectFallback } from "../../../util/lib/object";

interface InstallerData {
	installed: boolean;
	shipNum?: number;

	files?: string[];
	directories?: string[];
}

const installerDataFallback: InstallerData = {
	installed: false
};

interface InstallationDataFile {
	files: Record<string, string>;
	directories: string[];
	packages?: string[];
}

export default async function* install(env: Environment) {
	const installerData = objectFallback<InstallerData>(
		await env.fs.readFile("/data/installd/run.json", "json"),
		installerDataFallback
	);

	if (!installerData.installed) {
		env.print("Installing system...");

		// basic directories
		await env.fs.mkdir("/bin");

		await env.fs.mkdir("/data");
		await env.fs.mkdir("/config");

		await env.fs.mkdir("/user");
		await env.fs.mkdir("/users");

		let installerJSON: InstallationDataFile;
		try {
			installerJSON = await env.network.request<InstallationDataFile>(
				"get",
				"/build/data.json",
				"json"
			);
		} catch (e) {
			throw new Error("Failed to retrieve installation data file: " + e);
		}

		installerData.files = [];
		installerData.directories = [
			"/bin",
			"/data",
			"/config",
			"/user",
			"/users"
		];

		env.print("Creating directories...");
		for (const directory of installerJSON.directories) {
			await env.fs.mkdir(directory);
		}

		env.print("Writing files...");
		for (const filename in installerJSON.files) {
			const contents = installerJSON.files[filename];

			await env.fs.writeFile(filename, contents);
			installerData.files.push(filename);
		}

		env.print("Installing packages...");
		// download pkg first
		const pkgSrc = await env.network.request(
			"get",
			"/dist/pkgs/packages/pkg/pkg.js"
		);
		await env.fs.writeFile("/bin/pkg.js", pkgSrc);

		if (installerJSON.packages) {
			const pkgExec = await env.execute("/bin/pkg.js", [
				"install",
				...installerJSON.packages
			]);

			// don't care about result
			await pkgExec.onExit;
		}

		installerData.installed = true;
		installerData.shipNum = 1;

		env.print("Installation complete.");
	} else {
		env.print("Updating packages...");

		// update system
		const pkgExec = await env.execute("/bin/pkg.js", ["update"]);

		// wait for it to finish
		await pkgExec.onExit;
	}

	await env.fs.mkdir("/data/installd");
	await env.fs.writeFile(
		"/data/installd/run.json",
		JSON.stringify(installerData, null, 4)
	);
}
