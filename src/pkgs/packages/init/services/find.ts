import { Environment } from "@/types/worker";
import { Service, ServiceJSON } from "../types";
import { objectFallback } from "@/lib/object";

export async function findServices(env: Environment): Promise<Service[]> {
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
			fallback: serviceJSON.fallback,

			running: false,
			failed: false,

			restartPolicy: serviceJSON.restart,
			args: serviceJSON.args ?? [],
			display: serviceJSON.display ?? false,
			askForUser: serviceJSON.askForUser ?? false
		};

		services.push(service);
	}

	return services;
}
