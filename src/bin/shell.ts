import { Environment } from "../lib/worker";

export default async function* Shell(env: Environment) {
	while (true) {
		const input = await env.input(`${env.workingDirectory} $ `);

		const tokens = input.split(" ");
		const command = tokens[0];
		const commandArgs = tokens.slice(1);

		switch (command) {
			case "cd":
				env.workingDirectory = env.path.resolve(
					env.workingDirectory,
					...commandArgs
				);
				break;

			case "pwd":
				env.print(env.workingDirectory);
				break;

			case "clear":
				env.clearLogs();
				break;

			case "exit":
				return;

			case "which":
				for (const commandName of commandArgs) {
					const envExec = await env.execute<string | undefined>(
						"/bin/env.js",
						[commandName]
					);
					const { return: programDirectory } = await envExec.onExit;

					if (programDirectory) {
						env.print(`${commandName}: ${programDirectory}`);
					} else {
						env.print(`${commandName}: not found.`);
					}
				}

				break;

			default:
				const envExec = await env.execute<string | undefined>(
					"/bin/env.js",
					[command]
				);
				const { return: programDirectory } = await envExec.onExit;
				if (!programDirectory) {
					env.print("shell: command not found: ", command);
					break;
				}

				const programExec = await env.execute<string | undefined>(
					programDirectory,
					commandArgs,
					{ handOverDisplay: true }
				);
				const { return: programResult, logs: programLogs } =
					await programExec.onExit;

				const returnLogs = String(programResult ?? "");
				const lines = [...programLogs, ...returnLogs.split("\n")];
				for (const line of lines) env.print(line);
		}

		yield;
	}
}
