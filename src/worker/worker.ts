import {
	ConstellationProgram,
	Environment,
	InputConfig,
	Log,
	NetworkRequestType,
	SocketConnection,
	SocketServer,
	Sound,
	WorkerOutputProxy,
	WorkerProgramStore
} from "@/types/worker";
import { WorkerFS } from "./lib/fs";
import * as path from "path-browserify";
import { ALLOWED_PROXY_EVENTS } from "../kernel/constants";
import { WorkerEnv_Network_Get } from "./types/messages";
import { WorkerMessageIntent } from "./types/intents";
import { blobToUrl } from "@/lib/uri";
import { RuntimeMessageIntent } from "../kernel/types/intents";
import applyStringPrototypes from "../shared/strings";
import { workerMessageHandler } from "./handlers/handler";

applyStringPrototypes();

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

class ConstellationWorker {
	sendMessage!: Awaited<
		ReturnType<typeof workerMessageHandler>
	>["sendMessage"];
	emit!: Awaited<ReturnType<typeof workerMessageHandler>>["emit"];

	programs: WorkerProgramStore[] = [];
	fs!: WorkerFS;

	activePrograms: Partial<
		Record<
			number,
			{
				promise: Promise<{ return: Log; logs: Log[] }>;
				resolve: (value: { return: Log; logs: Log[] }) => void;
			}
		>
	> = {};

	completedQueue: { pid: number }[] = [];
	computeCalculationWindow = 2000;
	computeSlices: { start: number; end: number }[] = [];

	constructor() {
		this.init();
	}

	init = async () => {
		const { sendMessage, emit, handle } = await workerMessageHandler();

		this.sendMessage = sendMessage;
		this.emit = emit;

		setInterval(() => {
			emit(WorkerMessageIntent.ping, undefined);
		}, 2000);

		this.fs = new WorkerFS(sendMessage);

		// handlers
		handle(
			RuntimeMessageIntent.begin_execution,
			async ({
				directory,
				code: contents,
				pid,

				args,
				workingDirectory,
				input
			}) => {
				if (!directory) throw new Error("Directory is required!");
				if (!pid) throw new Error("PID is required!");

				if (!contents)
					throw new Error(
						`File '${directory}' to execute does not exist!`
					);

				const blob = new Blob([contents], {
					type: "text/javascript"
				});
				const url = blobToUrl(blob);

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
				store.env = this.newEnv(store, workingDirectory);

				try {
					const generator = program(store.env, args ?? [], input);

					if (
						generator &&
						Object.keys(Object.getPrototypeOf(generator)).length ==
							0
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

				this.programs.push(store);

				return true;
			}
		);

		handle(RuntimeMessageIntent.dispatch_frame, () => {
			const start = performance.now();

			this.programs.forEach(async (program) => {
				if (program.locked) return;
				program.locked = true;

				try {
					if (!program.generator) {
						this.terminateProgram(program, "");
						return;
					}

					const result = await program.generator.next(
						program.passValue
					);
					program.passValue = undefined;

					if (result.done) {
						this.terminateProgram(program, result.value);
					} else {
						// result.value is a regular value, pass it next time
						program.passValue = result.value;
					}
				} catch (err) {
					console.error(`Program ${program.pid} failed:`, err);

					// kill it.
					this.terminateProgram(program, [
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

			const programsData = this.programs.map((item) => ({
				pid: item.pid,
				directory: item.directory
			}));

			const end = performance.now();

			// Store this active compute period
			this.computeSlices.push({ start, end });

			// Remove anything completely outside the window
			const cutoff = end - this.computeCalculationWindow;
			while (
				this.computeSlices.length &&
				this.computeSlices[0].end < cutoff
			) {
				this.computeSlices.shift();
			}

			// Calculate total active time within the last 2 seconds
			let activeTime = 0;

			for (const slice of this.computeSlices) {
				const overlapStart = Math.max(slice.start, cutoff);
				const overlapEnd = slice.end;

				if (overlapEnd > overlapStart) {
					activeTime += overlapEnd - overlapStart;
				}
			}

			const computePercentage =
				(activeTime / this.computeCalculationWindow) * 100;

			const result = {
				programs: programsData,
				completePrograms: this.completedQueue.splice(0),
				computePercentage
			};

			return result;
		});

		handle(
			RuntimeMessageIntent.program_exit_inform,
			({ pid, data, logs }) => {
				const program = this.activePrograms[pid];
				if (program) {
					program.resolve({ return: data, logs: logs });
					delete this.activePrograms[pid];
				}
			}
		);

		// sockets

		const socketServerBySocketId = (
			id: number
		): WorkerProgramStore["socketServers"][0] | undefined => {
			for (const program of this.programs) {
				const ids = program.socketServers.map(
					(server) => server.socketId
				);
				const index = ids.indexOf(id);

				if (index !== -1) {
					return program.socketServers[index];
				}
			}

			return undefined;
		};

		const clientConnectionsBySocketId = (id: number) => {
			const connections: WorkerProgramStore["socketConnections"] = [];
			for (const program of this.programs) {
				const ids = program.socketConnections.map(
					(connection) => connection.socketId
				);
				const index = ids.indexOf(id);

				if (index !== -1) {
					connections.push(program.socketConnections[index]);
				}
			}

			return connections;
		};

		handle(RuntimeMessageIntent.socket_client_connected, (packet) => {
			const server = socketServerBySocketId(packet.socketId);

			server?.server?.onClientConnect?.({ pid: packet.initiatorPid });
		});
		handle(RuntimeMessageIntent.socket_client_disconnected, (packet) => {
			const server = socketServerBySocketId(packet.socketId);

			server?.server?.onClientDisconnect?.({
				pid: packet.initiatorPid
			});
		});
		handle(RuntimeMessageIntent.socket_client_sent_packet, (packet) => {
			const server = socketServerBySocketId(packet.socketId);

			server?.server?.onMessage?.(
				{ pid: packet.initiatorPid },
				packet.payload
			);
		});

		// shouldnt fire
		handle(RuntimeMessageIntent.socket_server_ended, (packet) => {
			// a server has terminated, so we need to disconnect clients.
			const connections = clientConnectionsBySocketId(packet.socketId);

			for (const connection of connections) {
				// need onClose()
				connection.connection.onClose?.();
				connection.connection.exit();
			}
		});
		handle(RuntimeMessageIntent.socket_server_sent_packet, (packet) => {
			// recieve server packet
			const recipient = this.programByPid(packet.targetPid);

			const ids = recipient.socketConnections.map(
				(connection) => connection.socketId
			);
			const index = ids.indexOf(packet.socketId);

			if (index == -1) return; // not connected

			const { connection } = recipient.socketConnections[index];

			connection.onMessage?.(packet.payload);
		});

		// events
		handle(RuntimeMessageIntent.trigger_event, (packet) => {
			const program = this.programByPid(packet.pid);

			program.env.triggerEvent(packet.name, packet.data);
		});

		// output proxies
		handle(RuntimeMessageIntent.proxy_log, (packet) => {
			const program = this.programByPid(packet.handlerPid);

			const handler = program.outputProxyHandlers[packet.subjectPid];
			if (!handler) return;

			handler.onLog(packet.log.type, packet.log.data);
		});

		handle(RuntimeMessageIntent.proxy_input, async (packet) => {
			const program = this.programByPid(packet.handlerPid);

			const handler = program.outputProxyHandlers[packet.subjectPid];
			if (!handler) return { finished: false };

			return {
				finished: true,
				response: await handler.onInput(packet.message, packet.config)
			};
		});

		handle(RuntimeMessageIntent.proxy_set_logs, (packet) => {
			const program = this.programByPid(packet.handlerPid);

			const handler = program.outputProxyHandlers[packet.subjectPid];
			if (!handler) return;

			handler.onSetLogs(packet.logs);
		});

		handle(RuntimeMessageIntent.proxy_get_dimensions, (packet) => {
			const program = this.programByPid(packet.handlerPid);

			const handler = program.outputProxyHandlers[packet.subjectPid];
			if (!handler) return;

			return handler.getDimensions();
		});

		console.log("Initialisation Complete.");
	};

	programByPid = (id: number) => {
		const index = this.programs.map((program) => program.pid).indexOf(id);

		if (index == -1) {
			throw new Error(
				`Program by PID ${id} does not exist on this worker.`
			);
		}

		return this.programs[index];
	};

	newEnv = (program: WorkerProgramStore, workingDirectory?: string) => {
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

		const {
			emit,
			sendMessage,
			activePrograms,
			terminateProgram: terminate
		} = this;

		const env: Environment = {
			print(data: Log) {
				emit(WorkerMessageIntent.log, { data });

				return logs.push(data);
			},

			warn(data: Log) {
				emit(WorkerMessageIntent.warn, { data });

				return logs.push(data);
			},

			error(data: Log) {
				emit(WorkerMessageIntent.error, { data });

				return logs.push(data);
			},
			async getLiveCanvas(width, height) {
				return await sendMessage(WorkerMessageIntent.get_live_canvas, {
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

				const text = await sendMessage(WorkerMessageIntent.get_input, {
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
				emit(WorkerMessageIntent.set_logs, { logs: newLogs });

				logs = newLogs ?? [];
			},

			terminalDimensions() {
				return sendMessage(
					WorkerMessageIntent.terminal_dimensions,
					undefined
				);
			},

			fs: this.fs,
			path,

			users: {
				changePassword(uid, newPassword) {
					return sendMessage(WorkerMessageIntent.change_password, {
						uid,
						newPassword
					});
				},

				validatePassword(uid, password) {
					return sendMessage(WorkerMessageIntent.validate_password, {
						uid,
						password
					});
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
				const { pid: executedPID } = await sendMessage(
					WorkerMessageIntent.execute_program,
					{
						path,
						args,
						handoverDisplayPid: config?.handOverDisplay
							? pid
							: undefined,
						workingDirectory: this.workingDirectory,
						input: config?.input,
						outputProxy: config?.outputProxy !== undefined,
						user: config?.user
					}
				);

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

								emit(WorkerMessageIntent.trigger_proxy_event, {
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
				return await sendMessage(
					WorkerMessageIntent.get_all_processes,
					undefined
				);
			},
			async self() {
				return await sendMessage(
					WorkerMessageIntent.get_self_process,
					undefined
				);
			},
			async parent() {
				return await sendMessage(
					WorkerMessageIntent.get_parent_process,
					undefined
				);
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
					const result = await sendMessage(
						WorkerMessageIntent.env_network_get,
						{
							type,
							url,
							format,
							body,
							headers,
							options: options ?? {}
						}
					);

					return result;
				}
			},

			systemStats: {
				async uptime() {
					return await sendMessage(
						WorkerMessageIntent.kernel_uptime,
						undefined
					);
				},

				async kernelVersion() {
					return await sendMessage(
						WorkerMessageIntent.kernel_version,
						undefined
					);
				}
			},

			sound: {
				play: async (config: Sound) => {
					const { id, duration } = await sendMessage(
						WorkerMessageIntent.play_sound,
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
							await sendMessage(WorkerMessageIntent.pause_sound, {
								soundID: id
							});
						},

						async resume() {
							await sendMessage(
								WorkerMessageIntent.resume_sound,
								{
									soundID: id
								}
							);
						},

						async remove() {
							await sendMessage(
								WorkerMessageIntent.remove_sound,
								{
									soundID: id
								}
							);
						}
					};
				}
			},

			sockets: {
				async connectToSocket(directory: string) {
					const socketId = await sendMessage(
						WorkerMessageIntent.socket_connect,
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

							emit(
								WorkerMessageIntent.send_socket_packet_to_server,
								{
									payload,
									socketId
								}
							);
						},

						exit() {
							if (exited) return;

							this.onClose?.();

							exited = true;
							program.socketConnections =
								program.socketConnections.filter(
									(socket) => socket.connection !== connection
								);

							emit(WorkerMessageIntent.socket_disconnect, {
								socketId
							});
						}
					};

					program.socketConnections.push({
						connection,
						socketId
					});

					return connection;
				},

				async createSocket(directory: string) {
					const socketId = await sendMessage(
						WorkerMessageIntent.create_socket,
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

							emit(
								WorkerMessageIntent.send_socket_packet_to_client,
								{
									payload,
									socketId: socketId,
									targetPid: clientPid
								}
							);
						},

						exit() {
							if (exited) return;

							exited = true;

							program.socketServers =
								program.socketServers.filter(
									(socket) => socket.server !== server
								);

							emit(WorkerMessageIntent.end_socket, {
								socketId
							});
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
				terminate(program, "");
			}
		};

		return env;
	};

	terminateProgram = (program: WorkerProgramStore, data: Log) => {
		for (const liveCanvas of program.liveCanvasIds) {
			this.emit(WorkerMessageIntent.remove_live_canvas, {
				id: liveCanvas
			});
		}

		for (const server of program.socketServers) {
			server.server.exit();
		}
		for (const connection of program.socketConnections) {
			connection.connection.exit();
		}
		program.onExit.forEach((fn) => fn());

		this.completedQueue.push({ pid: program.pid });

		this.programs.splice(this.programs.indexOf(program), 1);

		this.sendMessage(WorkerMessageIntent.exit, { data });
	};
}

new ConstellationWorker();
