import { type Environment } from "../types/worker.js";
import { objectFallback } from "../usrlib/object.js";

interface Service {
	running: boolean;
	restartPolicy: "always" | "once" | "never";

	failed: false | Error;

	directory: string;
	args: string[];
	display: boolean;
}

interface ServiceJSON {
	/**
	 * Path to the file to execute.
	 */
	directory: string;

	/**
	 * Always will always try to restart if it exits. Once onle starts it on boot. Both give up if an error is thrown.
	 */
	restart: "always" | "once";

	/**
	 * String arguments to pass to the program
	 */
	args?: string[];

	/**
	 * Whether to pass display control
	 */
	display?: boolean;
}

export default async function* initSystem(env: Environment) {
	async function startServices(services: Service[]) {
		for (const service of services) {
			if (
				service.running == true ||
				service.failed instanceof Error ||
				service.restartPolicy == "never"
			)
				continue;

			try {
				const exec = await env.execute(
					service.directory,
					service.args,
					{ handOverDisplay: service.display }
				);
				service.running = true;
				if (service.restartPolicy == "once") {
					service.restartPolicy = "never";
				}

				exec.onExit.then(() => (service.running = false));
			} catch (e) {
				service.failed = e instanceof Error ? e : false;
				env.warn(
					`Service from ${service.directory} has failed to start: ${String(e)}`
				);
			}
		}
	}

	async function findServices(): Promise<Service[]> {
		const services: Service[] = [];

		// insure dir exists
		await env.fs.mkdir("/config/init");
		await env.fs.mkdir("/config/init/services");

		const files = await env.fs.readdir("/config/init/services");
		for (const filename of files) {
			if (!filename.endsWith(".json")) continue;

			const path = "/config/init/services/" + filename;
			const json = await env.fs.readFile<ServiceJSON>(path, "json");
			if (!json) continue;
			if (!json.directory)
				env.warn(`Service file ${path} declares no directory.`);

			const serviceJSON = objectFallback<ServiceJSON>(json, {
				directory: "/bin/yes.js",
				restart: "always"
			});

			const service: Service = {
				directory: serviceJSON.directory,

				running: false,
				failed: false,

				restartPolicy: serviceJSON.restart,
				args: serviceJSON.args ?? [],
				display: serviceJSON.display ?? false
			};

			services.push(service);
		}

		return services;
	}

	// Runs installer to make sure that init isn't lonely
	const result = await env.execute("/bin/installd.js");
	await result.onExit;

	env.print("Installer has exited. Finding services...");
	const services = await findServices();

	yield;
	env.print("Starting services.");

	//let startedShell = false;
	while (true) {
		startServices(services);

		//if (!startedShell) {
		//	await env.execute("/bin/shell.js", [], { handOverDisplay: true });
		//
		//	startedShell = true;
		//}
		yield;
	}
}
