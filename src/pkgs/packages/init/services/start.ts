import { Environment } from "@/types/worker";
import { Service } from "../types";
import { usersByName } from "@/lib/users";

export async function startServices(
	env: Environment,
	devMode: boolean,
	services: Service[]
) {
	for (const service of services) {
		if (
			service.running == true ||
			service.failed instanceof Error ||
			service.restartPolicy == "never"
		)
			continue;

		try {
			let userState: { uid: number; password: string } | undefined =
				undefined;

			service.running = true;

			if (service.askForUser) {
				async function getUsername() {
					if (devMode) {
						return "dev";
					}

					return env.input("Username: ");
				}

				async function getPassword() {
					if (devMode) {
						return "dev";
					}

					return env.input("Password: ", {
						hideTyping: true
					});
				}

				const username = await getUsername();

				const targetUser = (await usersByName(env, username))[0];
				if (!targetUser) {
					env.print(`User '${username}' doesn't exist!`);
					service.running = false;
					continue;
				}

				const password = await getPassword();

				userState = { uid: targetUser?.UID, password };
			}

			const exec = await env.execute(service.directory, service.args, {
				handOverDisplay: service.display,
				user: userState
			});

			if (service.restartPolicy == "once") {
				service.restartPolicy = "never";
			}

			exec.onExit.then(() => (service.running = false));
		} catch (e) {
			try {
				if (service.fallback) {
					const exec = await env.execute(
						service.fallback,
						service.args,
						{ handOverDisplay: service.display }
					);
					service.running = true;
					if (service.restartPolicy == "once") {
						service.restartPolicy = "never";
					}

					exec.onExit.then(() => (service.running = false));
				}
			} catch (e) {
				service.failed = e instanceof Error ? e : false;
				env.warn(
					`Service from ${service.directory} (and fallback at ${service.fallback}) has failed to start: ${String(e)}`
				);
			} finally {
				service.failed = e instanceof Error ? e : false;
				env.warn(
					`Service from ${service.directory} has failed to start: ${String(e)}`
				);
			}
		}
	}
}
