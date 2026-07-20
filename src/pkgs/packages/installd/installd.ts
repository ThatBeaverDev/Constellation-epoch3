import { Environment } from "../../../util/types/worker";
import { objectFallback } from "../../../util/lib/object";
import { USER_FOLDERS } from "../../../constants";

interface InstallerData {
	installed: number | boolean;
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
		for (const name of USER_FOLDERS) {
			await env.fs.mkdir(`/${name}`);
		}
		await env.fs.mkdir("/users");
		await env.fs.createAlias("/sbin", "/bin");

		let installerJSON: InstallationDataFile;
		try {
			const jsonRequest = await env.network.request<InstallationDataFile>(
				"get",
				"/build/data.json",
				"json"
			);

			if (!jsonRequest.isOk) {
				throw new Error(
					`Failed to fetch installation JSON (HTTP error code ${jsonRequest.statusCode} (${jsonRequest.statusText})`
				);
			}

			installerJSON = jsonRequest.response;
		} catch (e) {
			throw new Error("Failed to retrieve installation data file: " + e);
		}

		installerData.files = [];
		// already created standard USER_FOLDERS for root.
		installerData.directories = [...USER_FOLDERS, "/users"];

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
		const sourceRequest = await env.network.request(
			"get",
			"/dist/pkgs/packages/pkg/pkg.js"
		);

		if (!sourceRequest.isOk) {
			throw new Error(
				"Source code for `pkg` does not exist, so installation may not proceed."
			);
		}

		const pkgSrc = sourceRequest.response;

		await env.fs.writeFile("/bin/pkg.js", pkgSrc);

		if (installerJSON.packages) {
			const pkgExec = await env.execute("/sbin/pkg.js", [
				"install",
				...installerJSON.packages
			]);

			// don't care about result
			await pkgExec.onExit;
		}

		// setup user
		env.print(" ");
		env.print("User Setup");
		const username = await env.input("Username: ");
		async function getPassword(): Promise<string> {
			const pass1 = await env.input("Password: ", {
				hideTyping: true,
				leaveInputOnCompletion: false
			});
			const pass2 = await env.input("Repeat password: ", {
				hideTyping: true,
				leaveInputOnCompletion: false
			});

			if (pass1 !== pass2) {
				return getPassword();
			}

			return pass1;
		}

		const exec = await env.execute("/sbin/useradd.js", [
			username,
			await getPassword()
		]);

		await exec.onExit;

		installerData.installed = Date.now();
		installerData.shipNum = 1;

		env.print("Installation complete.");
	} else {
		env.print("Updating packages...");

		// update system
		const pkgExec = await env.execute("/sbin/pkg.js", ["update"]);

		// wait for it to finish
		await pkgExec.onExit;
	}

	await env.fs.mkdir("/data/installd");
	await env.fs.writeFile(
		"/data/installd/run.json",
		JSON.stringify(installerData, null, 4)
	);
}
