import { Environment } from "../types/worker";
import { objectFallback } from "../usrlib/object";

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
}

export default async function* install(env: Environment) {
	const installerData = objectFallback<InstallerData>(
		await env.fs.readFile("/data/installd/run.json", "json"),
		installerDataFallback
	);

	if (!installerData.installed) {
		env.print("Installing system...");

		// basic directories
		yield env.fs.mkdir("/bin");

		yield env.fs.mkdir("/data");
		yield env.fs.mkdir("/config");

		yield env.fs.mkdir("/user");
		yield env.fs.mkdir("/users");

		const installerJSON = await env.network.request<InstallationDataFile>(
			"get",
			"/build/data.json",
			"json"
		);

		installerData.files = [];
		installerData.directories = ["/bin", "/data", "/config", "/user"];

		env.print("Creating directories...");
		for (const directory of installerJSON.directories) {
			yield env.fs.mkdir(directory);
		}

		env.print("Writing files...");
		for (const filename in installerJSON.files) {
			const contents = installerJSON.files[filename];

			yield env.fs.writeFile(filename, contents);
			installerData.files.push(filename);
		}

		installerData.installed = true;
		installerData.shipNum = 1;

		env.print("Installation complete.");
	}

	yield env.fs.mkdir("/data/installd");
	yield env.fs.writeFile(
		"/data/installd/run.json",
		JSON.stringify(installerData)
	);
}
