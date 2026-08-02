import { Environment } from "@/types/worker";
import { passthroughOutputProxy } from "@/lib/io.js";
import { findServices } from "./services/find.js";
import { startServices } from "./services/start.js";

export default async function* initSystem(
	env: Environment,
	[devModeString]: [string | undefined]
) {
	const devMode = devModeString == "true";

	// Runs installer to make sure that init isn't lonely
	const result = await env.execute("/bin/installd.js", [`${devMode}`], {
		outputProxy: passthroughOutputProxy(env)
	});
	await result.onExit;

	env.print("Installer has exited. Finding services...");
	const services = await findServices(env);

	env.print("Starting services.");

	while (true) {
		startServices(env, devMode, services);

		yield;
	}
}
