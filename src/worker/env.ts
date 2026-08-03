import {
	Environment,
	InputConfig,
	Log,
	NetworkGetOptions,
	NetworkRequestType,
	SocketConnection,
	SocketServer,
	Sound,
	WorkerOutputProxy,
	WorkerProgramStore
} from "@/types/worker";
import { ConstellationWorker } from "./worker";
import { WorkerMessageIntent } from "./types/intents";
import * as path from "path-browserify";
import { ALLOWED_PROXY_EVENTS } from "../kernel/constants";

export function newEnv(
	worker: ConstellationWorker,
	program: WorkerProgramStore,
	workingDirectory?: string
) {
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
	} = worker;

	function allEntries(obj: any) {
		const seen = new Set();
		const result = [];

		for (
			let cur = obj;
			cur && cur !== Object.prototype;
			cur = Object.getPrototypeOf(cur)
		) {
			for (const k of Object.getOwnPropertyNames(cur)) {
				if (k === "constructor" || seen.has(k)) continue;
				seen.add(k);
				const desc = Object.getOwnPropertyDescriptor(cur, k);
				if (!desc) continue;

				// Return like entries: [key, value]
				result.push([k, obj[k]]);
			}
		}

		// include own enumerable props that might be skipped? (optional)
		for (const [k, v] of Object.entries(obj)) {
			if (!seen.has(k)) {
				seen.add(k);
				result.push([k, v]);
			}
		}

		return result;
	}

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

		input: async function (message: string, config?: Partial<InputConfig>) {
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
			env.setLogs();
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

		fs: Object.fromEntries(
			allEntries(worker.fs).map((item) => {
				const name = item[0];

				if (typeof item[1] !== "function") return [name, , item[1]];
				const fn = item[1].bind(worker.fs);

				return [
					name,
					(dir: string, ...args: any[]) =>
						fn(path.resolve(env.workingDirectory, dir), ...args)
				];
			})
		),
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

			eventsMap[name] = eventsMap[name].filter((cb) => cb !== callback);

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
					workingDirectory: env.workingDirectory,
					input: config?.input,
					outputProxy: config?.outputProxy !== undefined,
					user: config?.user
				}
			);

			if (config?.outputProxy) {
				program.outputProxyHandlers[executedPID] = config.outputProxy;
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
				options?: NetworkGetOptions
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
						await sendMessage(WorkerMessageIntent.resume_sound, {
							soundID: id
						});
					},

					async remove() {
						await sendMessage(WorkerMessageIntent.remove_sound, {
							soundID: id
						});
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

						emit(WorkerMessageIntent.send_socket_packet_to_server, {
							payload,
							socketId
						});
					},

					exit() {
						if (exited) return;

						connection.onClose?.();

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

						emit(WorkerMessageIntent.send_socket_packet_to_client, {
							payload,
							socketId: socketId,
							targetPid: clientPid
						});
					},

					exit() {
						if (exited) return;

						exited = true;

						program.socketServers = program.socketServers.filter(
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
}
