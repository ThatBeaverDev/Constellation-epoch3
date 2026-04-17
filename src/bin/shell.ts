import { Environment } from "../types/worker";
import { Log } from "../ui/ui";
import { logsToString, logToString } from "../usrlib/logs";

interface Command {
	name: string;
	args: string[];

	output?:
		| { type: "file"; name: string }
		| { type: "command"; command: Command };
}

function tokenise(text: string) {
	let quote: '"' | "'" | undefined = undefined;
	let currentToken: string = "";
	const tokens: string[] = [];

	for (const char of text) {
		function append() {
			currentToken += char;
		}

		switch (char) {
			case " ":
				if (!quote) {
					tokens.push(currentToken);
					currentToken = "";
				} else {
					append();
				}
				break;

			case '"':
			case "'":
				if (quote == char) {
					quote = undefined;
				} else if (quote) {
					append();
				} else {
					quote = char;
				}
				break;

			default:
				append();
		}
	}

	if (quote) throw new Error(`Quotes were not fully closed in ${text}`);
	tokens.push(currentToken);

	return tokens.filter((item) => item.trim() !== "");
}

export function parseShellCommand(text: string): Command[] {
	const tokens = tokenise(text);
	const commands: Command[] = [];

	function grabCommand(tokens: string[]): {
		command: Command;
		digestedTokens: number;
	} {
		let i = 0;
		const command: Command = { name: tokens[i], args: [] };

		const exitTokens = ["|", ">"];
		while (true) {
			i++;

			if (exitTokens.includes(tokens[i]) || tokens[i] == undefined) break;
			else command.args.push(tokens[i]);
		}

		if (!tokens[i])
			return { command, digestedTokens: i }; // we're done, end of command
		else
			switch (tokens[i]) {
				case "|":
					i++;

					// digest the next one, we're piping into it
					const { command: pipeTarget, digestedTokens } = grabCommand(
						tokens.slice(i)
					);
					i += digestedTokens;

					command.output = { type: "command", command: pipeTarget };
					return { command, digestedTokens: i };

				case ">":
					i++;

					const targetFile = tokens[i];
					command.output = { type: "file", name: targetFile };
					i++;

					break;
			}

		return { command, digestedTokens: i };
	}

	const { command, digestedTokens } = grabCommand(tokens);
	if (digestedTokens < tokens.length)
		throw new Error(`Unexpected: ${tokens[digestedTokens + 1]}`);
	commands.push(command);

	return commands;
}

export default async function* Shell(env: Environment) {
	const configDirectory = "/config/shell";
	const welcomeMessage = env.path.resolve(configDirectory, "./welcome.txt");

	await env.fs.mkdir(configDirectory);
	const welcomeExists = await env.fs.exists(welcomeMessage);
	if (!welcomeExists) {
		await env.fs.writeFile(
			welcomeMessage,
			`Welcome to Constellation! To view a list of programs, you can use \`ls /bin\`.`
		);
	}

	const welcome = await env.fs.readFile(welcomeMessage);
	if (welcome) env.print(welcome);

	async function executeCommand(command: Command, input?: Log[]) {
		const result: Log[] = [];

		switch (command.name) {
			case "":
				break;
			case "cd":
				// resolve the directory
				const path = env.path.resolve(
					env.workingDirectory,
					...(command.args.length == 0 ? ["/"] : command.args)
				);

				// insure it exists
				const isDirectory = await env.fs.isDirectory(path);

				if (isDirectory) {
					env.workingDirectory = path;
				} else {
					result.push([
						{ text: `cd: `, colour: "#888888" },
						{
							text: `no such file or directory: ${command.args.join(" ")}`
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
				for (const commandName of command.args) {
					const envExec = await env.execute("/bin/env.js", [
						commandName
					]);
					const { return: programDirectory } = await envExec.onExit;

					if (programDirectory) {
						result.push(`${commandName}: ${programDirectory}`);
					} else {
						result.push(`${commandName}: not found.`);
					}
				}

				break;

			default:
				const envExec = await env.execute("/bin/env.js", [
					command.name
				]);
				const { return: programDirectory } = await envExec.onExit;
				if (!programDirectory) {
					const log: Log = [
						{ text: "shell: ", colour: "#888888" },
						{ text: "command not found: " },
						{ text: command.name }
					];
					result.push(log);
					break;
				}

				const programExec = await env.execute(
					logToString(programDirectory),
					command.args,
					{ handOverDisplay: true, input }
				);
				const { return: programResult, logs: programLogs } =
					await programExec.onExit;

				const returnLogs = programResult;

				for (const log of programLogs) result.push(log);
				if (returnLogs) result.push(returnLogs);
		}

		if (command.output) {
			switch (command.output.type) {
				case "command":
					return await executeCommand(command.output.command, result);

				case "file":
					const path = env.path.join(
						env.workingDirectory,
						command.output.name
					);
					const text = logsToString(result ?? []);

					console.debug(path, text);

					await env.fs.writeFile(path, text);

					break;
			}
		} else return result;
	}

	while (true) {
		const input = await env.input(`${env.workingDirectory} $ `);
		const commands = parseShellCommand(input);

		for (const command of commands) {
			const logs = await executeCommand(command);
			if (logs) {
				for (const log of logs) env.print(log);
			}
		}

		yield;
	}
}
