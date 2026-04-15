import { Environment } from "../types/worker";
import { Log } from "../ui/ui";
import { logsToString } from "../usrlib/logs";

export default async function* Shell(env: Environment) {
	while (true) {
		const input = await env.input(`${env.workingDirectory} $ `);

		const tokens = input.split(" ");
		const command = tokens[0];
		const commandArgs = tokens.slice(1);

		switch (command) {
			case "":
				break;
			case "cd":
				// resolve the directory
				const path = env.path.resolve(
					env.workingDirectory,
					...(commandArgs.length == 0 ? ["/"] : commandArgs)
				);

				// insure it exists
				const isDirectory = await env.fs.isDirectory(path);

				if (isDirectory) {
					env.workingDirectory = path;
				} else {
					env.print([
						{ text: `cd: `, colour: "#888888" },
						{
							text: `no such file or directory: ${commandArgs.join(" ")}`
						}
					]);
				}

				break;

			case "clear":
				env.clearLogs();
				break;

			case "exit":
				return;

			case "which":
				for (const commandName of commandArgs) {
					const envExec = await env.execute("/bin/env.js", [
						commandName
					]);
					const { return: programDirectory } = await envExec.onExit;

					if (programDirectory) {
						env.print(`${commandName}: ${programDirectory}`);
					} else {
						env.print(`${commandName}: not found.`);
					}
				}

				break;

			default:
				const envExec = await env.execute("/bin/env.js", [command]);
				const { return: programDirectory } = await envExec.onExit;
				if (!programDirectory) {
					const log: Log = [
						{ text: "shell: ", colour: "#888888" },
						{ text: "command not found: " },
						{ text: command }
					];
					env.print(log);
					break;
				}

				const programExec = await env.execute(
					logsToString(programDirectory),
					commandArgs,
					{ handOverDisplay: true }
				);
				const { return: programResult, logs: programLogs } =
					await programExec.onExit;

				const returnLogs = programResult;

				for (const log of programLogs) env.print(log);
				env.print(returnLogs);
		}

		yield;
	}
}
