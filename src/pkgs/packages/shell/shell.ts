import {
	Environment,
	EventMap,
	EventName,
	Log
} from "../../../util/types/worker";
import { logsToString, logToString } from "../../../util/lib/logs";
import { user, usersByName } from "../../../util/lib/users";

export interface ShellCommand {
	name: string;
	args: string[];

	output?:
		| { type: "file"; name: string }
		| { type: "command"; command: ShellCommand };
}

const exitTokens = ["|", ">"];

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
			case "\t":
			case "\n":
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
				if (!quote && exitTokens.includes(char)) {
					tokens.push(currentToken);

					tokens.push(char);

					currentToken = "";
				} else append();
		}
	}

	if (quote) throw new Error(`Quotes were not fully closed in ${text}`);
	tokens.push(currentToken);

	return tokens.filter((item) => item.trim() !== "");
}

export function parseShellCommand(text: string): ShellCommand[] {
	const tokens = tokenise(text);
	const commands: ShellCommand[] = [];

	function grabCommand(
		tokens: string[],
		isTopLevel = false
	):
		| {
				command: ShellCommand;
				digestedTokens: number;
		  }
		| undefined {
		let i = 0;
		const command: ShellCommand = { name: tokens[i], args: [] };

		if (!command.name) return undefined;
		if (exitTokens.includes(command.name))
			throw new Error(`${command.name} is a reserved name.`);

		while (true) {
			i++;

			if (exitTokens.includes(tokens[i]) || tokens[i] == undefined) break;
			else command.args.push(tokens[i]);
		}

		if (!tokens[i]) {
			// we're done, end of command

			if (isTopLevel && i !== tokens.length)
				throw new Error(`Unexpected: ${tokens[i]}`);

			return { command, digestedTokens: i };
		} else
			switch (tokens[i]) {
				case "|":
					i++;

					// digest the next one, we're piping into it
					const grabbed = grabCommand(tokens.slice(i));
					if (!grabbed) {
						throw new Error("Command to pipe into must be given.");
					}

					const { command: pipeTarget, digestedTokens } = grabbed;
					i += digestedTokens;

					command.output = { type: "command", command: pipeTarget };

					if (isTopLevel && i !== tokens.length)
						throw new Error(`Unexpected: ${tokens[i]}`);

					return { command, digestedTokens: i };

				case ">":
					i++;

					const targetFile = tokens[i];
					if (targetFile == undefined)
						throw new Error("Target file must be specified.");

					command.output = { type: "file", name: targetFile };
					i++;

					if (isTopLevel && i !== tokens.length)
						throw new Error(`Unexpected: ${tokens[i]}`);

					return { command, digestedTokens: i };

				default:
					throw new Error(`Unexpected exit token: ${tokens[i]}`);
			}
	}

	const grabbed = grabCommand(tokens, true);
	if (!grabbed) return [];

	const { command, digestedTokens } = grabbed;

	if (digestedTokens < tokens.length)
		throw new Error(`Unexpected: ${tokens[digestedTokens + 1]}`);
	commands.push(command);

	return commands;
}

export interface Shell_IO {
	input: Environment["input"];
	print: Environment["print"];
	clearLogs: Environment["clearLogs"];
	setLogs: (logs: Log[]) => void;
	terminalDimensions: Environment["terminalDimensions"];
}
export async function shellImpl(env: Environment, io: Shell_IO) {
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

	const executionIdOrder: number[] = [];
	let nextExecutionID: number = 0;

	const logsMap: Record<number, Log[]> = {};

	function redisplayLogs() {
		const logs: Log[] = [];

		for (const id of executionIdOrder) {
			logs.push(...logsMap[id]);
		}

		io.setLogs(logs);
	}

	function newLogSection() {
		const execID = nextExecutionID++;
		executionIdOrder.push(execID);

		const logs: Log[] = [];
		logsMap[execID] = logs;

		return logs;
	}

	let execUser: { uid: number; password: string } | undefined = undefined;

	const welcome = await env.fs.readFile(welcomeMessage);
	if (welcome) newLogSection().push(welcome);

	redisplayLogs();

	const executedCommandRequiresExitReturn = Symbol();
	async function executeCommand(
		command: ShellCommand,
		input?: Log[],
		overrideUser?: { uid: number; password: string }
	): Promise<Log[] | typeof executedCommandRequiresExitReturn | undefined> {
		const result: Log[] = [];

		const logs = newLogSection();

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
				for (const id of executionIdOrder) {
					delete logsMap[id];
				}
				nextExecutionID = 0;
				executionIdOrder.splice(0, Infinity);

				redisplayLogs();

				break;

			case "exit":
				return executedCommandRequiresExitReturn;

			case "which":
				for (const commandName of command.args) {
					const envExec = await env.execute(
						"/sbin/env.js",
						[commandName],
						{ user: overrideUser ?? execUser }
					);
					const { return: programDirectory } = await envExec.onExit;

					if (programDirectory) {
						result.push(`${commandName}: ${programDirectory}`);
					} else {
						result.push(`${commandName}: not found.`);
					}
				}

				break;

			case "su": {
				const targetUID = command.args[0]
					? (await usersByName(env, command.args[0]))[0]?.UID
					: 0;

				if (targetUID == undefined) {
					result.push(`su: User not found.`);
					break;
				}

				const password = await io.input(`Password:`, {
					hideTyping: true,
					leaveInputOnCompletion: false
				});

				const correct = await env.users.validatePassword(
					targetUID,
					password
				);

				if (!correct) {
					result.push([
						{ text: "su: ", colour: "#888888" },
						{ text: "Incorrect password" }
					]);
				} else {
					// ok
					const newUser = await user(env, targetUID);

					if (!newUser) {
						throw new Error(
							"New target user does not exist! (but it did before?)"
						);
					}

					execUser = { uid: newUser.UID, password };
				}

				break;
			}

			case "sudo": {
				const password = await io.input("Password:", {
					hideTyping: true,
					leaveInputOnCompletion: false
				});

				try {
					return await executeCommand(
						{
							name: command.args[0],
							args: command.args.slice(1),
							output: command.output
						},
						input,
						{ uid: 0, password }
					);
				} catch (e) {
					if (
						e instanceof Error &&
						e.message.includes("Password is incorrect")
					) {
						result.push([
							{ text: "sudo: ", colour: "#888888" },
							{ text: "Incorrect password" }
						]);
					} else {
						result.push(`${e}`);
					}
				}

				break;
			}

			default:
				const envExec = await env.execute(
					"/sbin/env.js",
					[command.name],
					{ user: overrideUser ?? execUser }
				);
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
					{
						input,
						outputProxy: {
							onLog(_, log) {
								logs.push(log);

								io.print(log);
							},
							async onInput(message, config) {
								const result = await io.input(message, config);

								if (config?.leaveInputOnCompletion ?? true) {
									logs.push(`${message}${result}`);
								}

								return result;
							},

							onSetLogs(newLogs) {
								logs.splice(0, Infinity, ...newLogs);

								redisplayLogs();
							},

							getDimensions() {
								return io.terminalDimensions();
							}
						},
						user: overrideUser ?? execUser
					}
				);

				const eventHandlers: Partial<
					Record<EventName, (data: EventMap[EventName]) => void>
				> = {};

				function passEvent(eventName: EventName) {
					const fn = (data: EventMap[EventName]) =>
						programExec.triggerProxyEvent(eventName, data);

					env.addEventListener(eventName, fn);
					eventHandlers[eventName] = fn;
				}

				passEvent("keydown");
				passEvent("keyup");
				passEvent("resize");

				// logs were already added live
				const { return: programResult } = await programExec.onExit;

				for (const name in eventHandlers) {
					// @ts-expect-error
					const eventName: EventName = name;

					const fn = eventHandlers[eventName];
					if (!fn) continue;

					env.removeEventListener(eventName, fn);
				}

				const returnLogs = programResult;

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

					await env.fs.writeFile(path, text);

					break;
			}
		} else return result;
	}

	async function runCommand() {
		const query = `${env.workingDirectory} $ `;
		const response = await io.input(query);

		newLogSection().push(`${query}${response}`);

		const commands = parseShellCommand(response);

		for (const command of commands) {
			const logs = await executeCommand(command);
			if (logs == executedCommandRequiresExitReturn) return true; // exit

			if (logs) {
				for (const log of logs) io.print(log);
			}
		}

		return false;
	}

	return { runCommand };
}

export default async function* Shell(env: Environment) {
	const { runCommand } = await shellImpl(env, {
		input: env.input,
		print: env.print,
		clearLogs: env.clearLogs,
		setLogs: env.setLogs,
		terminalDimensions: env.terminalDimensions
	});

	while (true) {
		const exit = await runCommand();

		if (exit) return;
		else yield;
	}
}
