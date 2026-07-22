import {
	type ConstellationProgram,
	type NetworkRequestType,
	type SocketConnection,
	type SocketServer,
	type WorkerProgramStore,
	type Environment,
	type InputConfig,
	type Log,
	type Sound,
	WorkerOutputProxy
} from "../util/types/worker.js";
import { type WorkerEnv_Network_Get } from "../types/workerMessages.js";
import path from "path-browserify";
import { WorkerFS, workerMessageHandler } from "./workerUtils.js";
import { ALLOWED_PROXY_EVENTS } from "../constants.js";

/// <reference path="@typescript/lib-webworker@npm:@types/webworker" />

async function worker() {
	String.prototype.textAfter = function (after) {
		return this.split(after).splice(1, Infinity).join(after);
	};

	String.prototype.textAfterAll = function (after) {
		return this.split(after).pop() ?? "";
	};

	String.prototype.textBefore = function (before) {
		return this.substring(0, this.indexOf(before));
	};

	String.prototype.textBeforeLast = function (before) {
		return this.split("")
			.reverse()
			.join("")
			.textAfter(before)
			.split("")
			.reverse()
			.join("");
	};

	String.prototype.map = function (mappings) {
		let text = String(this);

		for (const replaced in mappings) {
			text = text.replaceAll(replaced, mappings[replaced]);
		}

		return text;
	};

	/* Secure some bases */

	// @ts-expect-error
	globalThis.localStorage = undefined;

	// @ts-expect-error
	globalThis.eval = undefined;
	// @ts-expect-error
	globalThis.fetch = undefined;
	// @ts-expect-error
	globalThis.XMLHttpRequest = undefined;
	// @ts-expect-error
	globalThis.Worker = undefined;
	// @ts-expect-error
	globalThis.globalThis = globalThis;

	const { sendMessage, emit, handle } = await workerMessageHandler();

	setInterval(() => {
		emit("keepAlive", undefined);
	}, 2000);

	/* =============== Worker Code  =============== */

	const programs: WorkerProgramStore[] = [];
	const fs = new WorkerFS(sendMessage);

	function newEnv(
		program: WorkerProgramStore,
		workingDirectory?: string
	): Environment {
		const { pid } = program;
		let handlingInput = false;

		let logs: Log[] = [];

		/**
		 * Maps the interval ID for the program to the interval ID for the worker
		 */
		const intervalIds: Record<number, number> = {};
		let nextIntervalId = 0;

		program.onExit.push(() => {
			for (const programId in intervalIds) {
				const workerIntervalId = intervalIds[programId];

				clearInterval(workerIntervalId);
			}
		});

		const eventsMap: Record<string, Function[]> = {};

		const env: Environment = {
			print(data: Log) {
				emit("program_log", { data });

				return logs.push(data);
			},

			warn(data: Log) {
				emit("program_warn", { data });

				return logs.push(data);
			},

			error(data: Log) {
				emit("program_error", { data });

				return logs.push(data);
			},
			async getLiveCanvas(width, height) {
				return await sendMessage("env_get_liveCanvas", {
					width,
					height
				});
			},

			input: async function (
				message: string,
				config?: Partial<InputConfig>
			) {
				if (handlingInput == true) {
					throw new Error("Maximum of one input request at a time.");
				}
				handlingInput = true;

				program.inputRequest = {};

				const text = await sendMessage("env_input", {
					message,

					config: {
						hideTyping: config?.hideTyping ?? false,
						leaveInputOnCompletion:
							config?.leaveInputOnCompletion ?? true,
						inline: config?.inline ?? false,
						initialText: config?.initialText ?? ""
					}
				});

				handlingInput = false;
				return text;
			},

			clearLogs() {
				this.setLogs();
			},

			setLogs(newLogs?: Log[]) {
				emit("env_set_logs", { logs: newLogs });

				logs = newLogs ?? [];
			},

			terminalDimensions() {
				return sendMessage("env_terminal_dimensions", undefined);
			},

			fs,
			path,

			users: {
				changePassword(uid, newPassword) {
					return sendMessage("change_password", { uid, newPassword });
				},

				validatePassword(uid, password) {
					return sendMessage("validate_password", { uid, password });
				}
			},

			triggerEvent(name, data) {
				const callbacks = eventsMap[name];

				if (!callbacks) return;
				for (const callback of callbacks) {
					callback(data);
				}
			},
			addEventListener(name, callback) {
				if (!eventsMap[name]) eventsMap[name] = [callback];
				else eventsMap[name].push(callback);
			},
			removeEventListener(name, callback) {
				if (!eventsMap[name]) return;

				eventsMap[name] = eventsMap[name].filter(
					(cb) => cb !== callback
				);

				if (eventsMap[name].length == 0) delete eventsMap[name];
			},

			workingDirectory: String(workingDirectory ?? "/"),

			async execute(
				path: string,
				args?: string[],
				config?: {
					handOverDisplay?: boolean;
					input?: Log[];
					outputProxy?: WorkerOutputProxy;
					user?: { uid: number; password: string };
				}
			) {
				const { pid: executedPID } = await sendMessage("env_exec", {
					path,
					args,
					handoverDisplayPid: config?.handOverDisplay
						? pid
						: undefined,
					workingDirectory: this.workingDirectory,
					input: config?.input,
					outputProxy: config?.outputProxy !== undefined,
					user: config?.user
				});

				if (config?.outputProxy) {
					program.outputProxyHandlers[executedPID] =
						config.outputProxy;
				}

				const obj: Partial<
					(typeof activePrograms)[keyof typeof activePrograms]
				> = {}; // store for waiting for a program to exit (for awaiting the `onExit` key)

				obj.promise = new Promise<{ return: Log; logs: Log[] }>(
					(resolve) => {
						obj.resolve = resolve;
					}
				);

				// @ts-expect-error
				activePrograms[executedPID] = obj;

				if (config?.outputProxy) {
					return {
						onExit: obj.promise,

						triggerProxyEvent: (eventName, data) => {
							if (ALLOWED_PROXY_EVENTS.has(eventName)) {
								// allowed

								emit("proxy_trigger_event", {
									handlerPid: program.pid,
									subjectPid: executedPID,

									eventName,
									data: data
								});
							}
						}
					};
				}

				return {
					onExit: obj.promise
				} as any; // trust, it's trying to complain about the lack of `outputProxy` key.
			},
			async processes() {
				return await sendMessage("env_processes", undefined);
			},
			async self() {
				return await sendMessage("env_selfProcess", undefined);
			},
			async parent() {
				return await sendMessage("env_parent_process", undefined);
			},

			network: {
				request: async (
					type: NetworkRequestType,
					url: string,
					format: "text" | "json" | "datauri" | "blob" = "text",
					body?: Object,
					headers?: Record<string, string>,
					options?: WorkerEnv_Network_Get["options"]
				) => {
					const result = await sendMessage("env_network_get", {
						type,
						url,
						format,
						body,
						headers,
						options: options ?? {}
					});

					return result;
				}
			},

			systemStats: {
				async uptime() {
					return await sendMessage("kernel_uptime", undefined);
				},

				async kernelVersion() {
					return await sendMessage("kernel_version", undefined);
				}
			},

			sound: {
				play: async (config: Sound) => {
					const { id, duration } = await sendMessage(
						"env_sound_play",
						{
							config
						}
					);

					const onStop = new Promise<number>((resolve) => {
						// @ts-expect-error
						handle(`sound_stopped_${id}`, ({ time }) => {
							resolve(time);
						});
					});

					return {
						id,
						duration,
						onStop,

						async pause() {
							await sendMessage("env_sound_pause", {
								soundID: id
							});
						},

						async resume() {
							await sendMessage("env_sound_resume", {
								soundID: id
							});
						},

						async remove() {
							await sendMessage("env_sound_remove", {
								soundID: id
							});
						}
					};
				}
			},

			sockets: {
				async connectToSocket(directory: string) {
					const socketId = await sendMessage(
						"Sockets/Client/newConnection",
						{
							socketDirectory: directory
						}
					);

					let exited = false;

					const connection: SocketConnection = {
						directory: directory,

						// called from outside
						onMessage: undefined,
						sendMessage(payload: unknown) {
							if (exited)
								throw new Error(
									"Connection is no longer active and messages can no longer be sent."
								);

							emit("Sockets/Client/sendPacket", {
								payload,
								socketId
							});
						},

						exit() {
							if (exited) return;

							this.onClose?.();

							exited = true;
							program.socketConnections =
								program.socketConnections.filter(
									(socket) => socket.connection !== connection
								);

							emit("Sockets/Client/endConnection", { socketId });
						}
					};

					program.socketConnections.push({ connection, socketId });

					return connection;
				},

				async createSocket(directory: string) {
					const socketId = await sendMessage(
						"Sockets/Server/newServer",
						{
							socketDirectory: directory
						}
					);

					let exited = false;

					const server: SocketServer = {
						directory: directory,

						onClientConnect: undefined,
						onClientDisconnect: undefined,
						onMessage: undefined,

						sendMessage(clientPid, payload) {
							if (exited)
								throw new Error(
									"Server is no longer active and messages can no longer be sent"
								);

							emit("Sockets/Server/sendPacket", {
								payload,
								socketId: socketId,
								targetPid: clientPid
							});
						},

						exit() {
							if (exited) return;

							exited = true;

							program.socketServers =
								program.socketServers.filter(
									(socket) => socket.server !== server
								);

							emit("Sockets/Server/endServer", { socketId });
						}
					};

					program.socketServers.push({ server, socketId });

					return server;
				}
			},

			timers: {
				sleep(ms: number) {
					return new Promise<void>((resolve) => {
						setTimeout(resolve, ms);
					});
				},

				setInterval(callback, ms) {
					const interval = setInterval(callback, ms);
					const programIntervalId = nextIntervalId++;

					intervalIds[programIntervalId] = interval;

					return programIntervalId;
				},

				clearInterval(id) {
					const interval = intervalIds[id];

					if (!interval) return;
					delete intervalIds[id];

					clearInterval(interval);
				}
			},

			exit() {
				terminateProgram(program, "");
			}
		};

		return env;
	}

	const activePrograms: Partial<
		Record<
			number,
			{
				promise: Promise<{ return: Log; logs: Log[] }>;
				resolve: (value: { return: Log; logs: Log[] }) => void;
			}
		>
	> = {};

	handle(
		"executeProgram",
		async ({
			directory,
			code: contents,
			pid,

			args,
			workingDirectory,
			input
		}) => {
			// from src/util/lib/uri.ts
			async function blobToUrl(blob: Blob) {
				const url = URL.createObjectURL(blob);

				setTimeout(() => {
					URL.revokeObjectURL(url);
				}, 5000);

				return url;
			}

			if (!directory) throw new Error("Directory is required!");
			if (!pid) throw new Error("PID is required!");

			if (!contents)
				throw new Error(
					`File '${directory}' to execute does not exist!`
				);

			const blob = new Blob([contents], { type: "text/javascript" });
			const url = await blobToUrl(blob);

			const exports = await import(url);
			const program = exports.default as ConstellationProgram;

			const store: WorkerProgramStore = {
				generator: undefined,

				pid,
				directory,

				// @ts-expect-error
				env: "tempValue",

				locked: false,

				outputHandlers: {},

				socketConnections: [],
				socketServers: [],

				liveCanvasIds: [],

				outputProxyHandlers: {},

				onExit: []
			};
			store.env = newEnv(store, workingDirectory);

			try {
				const generator = program(store.env, args ?? [], input);

				if (
					generator &&
					Object.keys(Object.getPrototypeOf(generator)).length == 0
				) {
					// @ts-expect-error // probably a generator
					store.generator = generator;
				} else {
					// not a generator, this is a return value, let's just pretend we're working with a generator.
					store.generator = (function* emptyGenerator() {
						return generator;
					})();
				}
			} catch (e) {
				console.error(e);
				return false;
			}

			programs.push(store);

			return true;
		}
	);

	function programByPid(id: number) {
		const index = programs.map((program) => program.pid).indexOf(id);

		if (index == -1) {
			throw new Error(
				`Program by PID ${id} does not exist on this worker.`
			);
		}

		return programs[index];
	}

	function terminateProgram(program: WorkerProgramStore, data: Log) {
		for (const liveCanvas of program.liveCanvasIds) {
			emit("env_remove_liveCanvas", { id: liveCanvas });
		}

		for (const server of program.socketServers) {
			server.server.exit();
		}
		for (const connection of program.socketConnections) {
			connection.connection.exit();
		}
		program.onExit.forEach((fn) => fn());

		completedQueue.push({ pid: program.pid });

		programs.splice(programs.indexOf(program), 1);

		sendMessage("termination", { data });
	}

	const completedQueue: { pid: number }[] = [];

	const computeCalculationWindow = 2000;
	const computeSlices: { start: number; end: number }[] = [];

	handle("execLoop", () => {
		const start = performance.now();

		programs.forEach(async (program) => {
			if (program.locked) return;
			program.locked = true;

			try {
				if (!program.generator) {
					terminateProgram(program, "");
					return;
				}

				const result = await program.generator.next(program.passValue);
				program.passValue = undefined;

				if (result.done) {
					terminateProgram(program, result.value);
				} else {
					// result.value is a regular value, pass it next time
					program.passValue = result.value;
				}
			} catch (err) {
				console.error(`Program ${program.pid} failed:`, err);

				// kill it.
				terminateProgram(program, [
					{
						text: String(
							err instanceof Error
								? `${err.name}: ${err.message}`
								: err
						),
						colour: "#ff0000"
					}
				]);
			}

			program.locked = false;
		});

		const programsData = programs.map((item) => ({
			pid: item.pid,
			directory: item.directory
		}));

		const end = performance.now();

		// Store this active compute period
		computeSlices.push({ start, end });

		// Remove anything completely outside the window
		const cutoff = end - computeCalculationWindow;
		while (computeSlices.length && computeSlices[0].end < cutoff) {
			computeSlices.shift();
		}

		// Calculate total active time within the last 2 seconds
		let activeTime = 0;

		for (const slice of computeSlices) {
			const overlapStart = Math.max(slice.start, cutoff);
			const overlapEnd = slice.end;

			if (overlapEnd > overlapStart) {
				activeTime += overlapEnd - overlapStart;
			}
		}

		const computePercentage = (activeTime / computeCalculationWindow) * 100;

		const result = {
			programs: programsData,
			completePrograms: completedQueue.splice(0),
			computePercentage
		};

		return result;
	});

	handle("program_exit", ({ pid, data, logs }) => {
		const program = activePrograms[pid];
		if (program) {
			program.resolve({ return: data, logs: logs });
			delete activePrograms[pid];
		}
	});

	// sockets

	function socketServerBySocketId(
		id: number
	): WorkerProgramStore["socketServers"][0] | undefined {
		for (const program of programs) {
			const ids = program.socketServers.map((server) => server.socketId);
			const index = ids.indexOf(id);

			if (index !== -1) {
				return program.socketServers[index];
			}
		}

		return undefined;
	}

	function clientConnectionsBySocketId(id: number) {
		const connections: WorkerProgramStore["socketConnections"] = [];
		for (const program of programs) {
			const ids = program.socketConnections.map(
				(connection) => connection.socketId
			);
			const index = ids.indexOf(id);

			if (index !== -1) {
				connections.push(program.socketConnections[index]);
			}
		}

		return connections;
	}

	handle("Sockets/Client/newConnection", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientConnect?.({ pid: packet.initiatorPid });
	});
	handle("Sockets/Client/endConnection", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientDisconnect?.({ pid: packet.initiatorPid });
	});
	handle("Sockets/Client/sendPacket", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onMessage?.(
			{ pid: packet.initiatorPid },
			packet.payload
		);
	});

	// shouldnt fire
	handle("Sockets/Server/newServer", () => {});
	handle("Sockets/Server/endServer", (packet) => {
		// a server has terminated, so we need to disconnect clients.
		const connections = clientConnectionsBySocketId(packet.socketId);

		for (const connection of connections) {
			// need onClose()
			connection.connection.onClose?.();
			connection.connection.exit();
		}
	});
	handle("Sockets/Server/sendPacket", (packet) => {
		// recieve server packet
		const recipient = programByPid(packet.targetPid);

		const ids = recipient.socketConnections.map(
			(connection) => connection.socketId
		);
		const index = ids.indexOf(packet.socketId);

		if (index == -1) return; // not connected

		const { connection } = recipient.socketConnections[index];

		connection.onMessage?.(packet.payload);
	});

	// events
	handle("event_trigger", (packet) => {
		const program = programByPid(packet.pid);

		program.env.triggerEvent(packet.name, packet.data);
	});

	// output proxies
	handle("proxy_log", (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onLog(packet.log.type, packet.log.data);
	});

	handle("proxy_input", async (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return { finished: false };

		return {
			finished: true,
			response: await handler.onInput(packet.message, packet.config)
		};
	});

	handle("proxy_set_logs", (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onSetLogs(packet.logs);
	});

	handle("proxy_get_dimensions", (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		return handler.getDimensions();
	});

	console.log("Initialisation Complete.");
}

worker();
