import Constellation from "./index";
import { FilesystemInterface } from "./lib/fs";
import ConstellationWorker from "web-worker:./lib/worker";
import { InputConfig, Log, Process } from "./util/types/worker";
import { implementWorkerFS, mainThreadMessageHandler } from "./lib/workerUtils";
import {
	RuntimeMessageIntent,
	RuntimeMessageMap
} from "./types/runtimeMessages";
import {
	consoleError,
	consoleLog,
	consoleWarn,
	PlaySoundResponse
} from "./ui/dom";
import { UiManager } from "./ui/ui";
import SocketManager from "./lib/sockets";
import { nodeJs } from "./lib/config";
import { blobToDataURL } from "./util/lib/uri";
import { logToString } from "./util/lib/logs";
import { triggerProgramEvent } from "./lib/triggerProgramEvent";
import { User } from "./util/types/worker";
import { insurePrivilege } from "./lib/users";

export interface ProgramLog {
	type: "log" | "warning" | "error";
	data: Log;
}
export interface ProgramInputLog {
	type: "input";
	message: string;
	config: InputConfig;
	callback(value: Awaited<ReturnType<UiManager["input"]>>): void;
}

export interface ProgramStore {
	readonly worker: WorkerStore;

	parent?: ProgramStore;
	children: Set<ProgramStore>;

	readonly pid: number;
	readonly user: User;
	readonly directory: string;
	readonly startTime: Date;

	onExit: (data?: any) => void;

	logs: (ProgramLog | ProgramInputLog)[];

	onLog(type: "log" | "warning" | "error", data: Log): void;
	onInput(message: string, config: InputConfig): Promise<string>;
	onSetLogs(logs?: Log[]): void;
	getTerminalDimensions(): Promise<{ width: number; height: number }>;

	liveCanvasIds: number[];
}

export interface WorkerStore {
	worker: Worker;
	totalPrograms: number;

	computePercentage: number;
	lastKeepAlive: number;

	id: number;
	name: string;
	lock: boolean;

	program?: ProgramStore;

	sendMessage: <Intent extends RuntimeMessageIntent>(
		intent: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	) => Promise<RuntimeMessageMap[Intent]["return"]>;
	emit: <Intent extends RuntimeMessageIntent>(
		event: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	) => void;
	exit(): void;
}

interface ProgramConfig {
	displayHandover?: { oldOwner?: number };
	workingDirectory: string;
	input?: Log[];
	outputProxy?: number;
}

export default class Runtime {
	#log: (message: Log) => void;
	#logWithCustomSource: (source: string, message: Log) => void;
	#warn: (message: Log) => void;
	#error: (message: Log) => void;

	#workerLog: UiManager["log"];
	#workerWarn: UiManager["warn"];
	#workerError: UiManager["error"];

	#panic: (message: Error) => void;
	#kernel: Constellation;
	#fs: FilesystemInterface;

	#sockets: SocketManager;

	targetWorkers: number = 0;
	workers: WorkerStore[];

	#sounds = new Map<
		number,
		{ program: ProgramStore; info: PlaySoundResponse }
	>();
	#nextSoundID = 1;

	constructor(
		kernel: Constellation,

		log: UiManager["log"],
		warn: UiManager["warn"],
		error: UiManager["error"],

		panic: (message: Error) => void,
		fs: FilesystemInterface
	) {
		this.#kernel = kernel;

		const logWithSource = (source: string, data: Log) => {
			if (!this.#kernel.ui.controller) return log(source, data);

			// @ts-expect-error
			if (typeof process == "undefined") consoleLog(source, data);
			return 0;
		};
		this.#log = logWithSource.bind(undefined, "runtime");
		this.#logWithCustomSource = logWithSource;
		this.#warn = (data: Log) => {
			if (!this.#kernel.ui.controller) return warn("runtime", data);

			consoleWarn("runtime", data);
			return 0;
		};
		this.#error = (data: Log) => {
			if (!this.#kernel.ui.controller) return error("runtime", data);

			consoleError("runtime", data);
			return 0;
		};

		this.#log("Program Runtime Initialising...");

		this.#workerLog = log;
		this.#workerWarn = warn;
		this.#workerError = error;

		this.#panic = panic;
		this.#fs = fs;

		this.#sockets = new SocketManager(
			this,
			logWithSource.bind(undefined, "runtime/sockets"),
			this.#fs
		);
		this.#fs.socketManager = this.#sockets;

		this.#fs;

		this.programs = [];
		this.workers = [];

		this.#log("Program runtime initialised.");

		if (!nodeJs)
			window.document.addEventListener(
				"visibilitychange",
				this.#onVisibilityChange
			);
	}

	programs: ProgramStore[];
	#initProgram!: ProgramStore;
	programByPid(id: number): ProgramStore {
		const index = this.programs.map((program) => program.pid).indexOf(id);

		if (index == -1) {
			throw new Error(`Session by ID '${id}' does not exist.`);
		}

		return this.programs[index];
	}

	#nextPID: number = 1;
	#nextWorkerID: number = 1;

	#onVisibilityChange = () => {
		// prevent workers dying randomly
		this.workers.forEach((worker) => (worker.lastKeepAlive = Date.now()));
	};

	async #createWorker(
		programDirectory: string,
		pid: number
	): Promise<WorkerStore> {
		const workerID = this.#nextWorkerID++;
		const workerName = `Worker #${workerID} (for ${programDirectory})`;

		const worker = new ConstellationWorker();

		const workerStore: WorkerStore = {
			worker,
			totalPrograms: 0,
			computePercentage: 0,
			lastKeepAlive: Date.now(),
			id: workerID,
			name: workerName,
			lock: false,
			// @ts-expect-error
			sendMessage() {},
			emit() {},
			exit: () => {
				this.#log(`Terminating worker #${workerStore.id}`);
				workerStore.worker.terminate();
				this.workers = this.workers.filter(
					(item) => item !== workerStore
				);
			}
		};

		const { sendMessage, handle, emit, withTransfer } =
			await mainThreadMessageHandler(worker, workerStore);

		workerStore.sendMessage = sendMessage;
		workerStore.emit = emit;

		let __program: ProgramStore | undefined = undefined;
		const getProgram = () => {
			if (!__program) __program = this.programByPid(pid);

			return __program;
		};

		implementWorkerFS(
			handle,
			this.#fs,
			this.#kernel.users,
			() => getProgram().user
		);

		function reroot(path: string) {
			const user = getProgram().user;

			if (path[0] == "/") {
				return user.home + path;
			} else {
				return user.home + "/" + path;
			}
		}

		handle("program_log", ({ data }) => {
			const program = getProgram();

			program.onLog("log", data);
		});
		handle("program_warn", ({ data }) => {
			const program = getProgram();

			program.onLog("warning", data);
		});
		handle("program_error", ({ data }) => {
			const program = getProgram();

			program.onLog("error", data);
		});

		handle(
			"env_exec",
			async ({
				path,
				args,
				handoverDisplayPid: executingProgramPid,
				workingDirectory,
				input,
				outputProxy,
				user: loginInfo
			}) => {
				const parent = getProgram();

				if (loginInfo) {
					const user = await this.#kernel.users.userByUID(
						loginInfo.uid
					);

					if (!user)
						throw new Error(
							`No user exists by UID ${loginInfo?.uid}`
						);

					const isValid = await this.#kernel.users.verifyPassword(
						user,
						loginInfo.password
					);

					if (!isValid) {
						throw new Error("Password is incorrect.");
					}
				}

				let user = loginInfo
					? await this.#kernel.users.userByUID(loginInfo.uid)
					: parent.user;

				const program = await this.executeProgram(
					reroot(path),
					parent,
					user,
					args,
					{
						displayHandover: { oldOwner: executingProgramPid },
						workingDirectory,
						input,
						outputProxy: outputProxy ? parent.pid : undefined
					}
				);

				return { pid: program.pid };
			}
		);

		function sessionToProgram(session: ProgramStore): Process {
			return {
				pid: session.pid,
				name: session.directory.textAfterAll("/"),

				startTime: session.startTime,
				UID: session.user.UID
			};
		}

		handle("env_processes", () => {
			const list: Process[] = [];

			for (const proc of this.programs) {
				const obj = sessionToProgram(proc);

				list.push(obj);
			}

			return list;
		});

		handle("env_selfProcess", () => {
			const program = getProgram();

			const store = sessionToProgram(program);

			return store;
		});

		handle("env_parent_process", () => {
			const program = getProgram();

			const parent = program.parent;
			if (!parent) return undefined;

			return sessionToProgram(parent);
		});

		handle(
			"env_network_get",
			async ({ type, url, format, body, headers, options }) => {
				const processedType = `${type}`.toLowerCase();
				let method = "GET";

				switch (processedType) {
					case "get":
						method = "GET";
						break;
					case "post":
						method = "POST";
						break;
					default:
						throw new Error(
							`Unknown request type: '` +
								processedType +
								`' (given '${type}')`
						);
				}

				const bodyString =
					method == "GET"
						? undefined
						: typeof body == "object"
							? JSON.stringify(body)
							: String(body);

				if (url[0] == "/" && nodeJs) {
					// this is to a local position, we should read from the program store (if node)
					// @ts-expect-error
					const fs = await import("node:fs/promises");
					// @ts-expect-error
					const path = await import("node:path");

					const constellationRoot: string = path.resolve(
						// @ts-expect-error
						import.meta.dirname,
						".."
					);

					const targetPath: string = path.resolve(
						constellationRoot,
						"." + url
					);

					if (!targetPath.startsWith(constellationRoot)) {
						throw new Error(
							"Attempt to read above project root denied."
						);
					}

					const contents = await fs.readFile(targetPath, "utf8");

					let result;
					switch (format) {
						case "text":
							result = contents;
							break;
						case "json":
							result = JSON.parse(contents);
							break;
						case "datauri":
							result = await blobToDataURL(new Blob([contents]));
							break;
						case "blob":
							result = new Blob([contents]);

						default:
							throw new Error(
								`Unkown request format: '${format}'`
							);
					}

					return {
						response: result,
						isOk: true,
						statusCode: 200,
						statusText: ""
					};
				} else {
					const request = await fetch(url, {
						method,
						body: bodyString,
						headers: headers,
						cache: (options.cache ?? true) ? "no-store" : "default"
					});

					let result;
					switch (format) {
						case "text":
							result = await request.text();
							break;
						case "json":
							result = await request.json();
							break;

						case "datauri":
							const blob = await request.blob();

							result = await blobToDataURL(blob);
							break;

						case "blob":
							result = await request.blob();
							break;

						default:
							throw new Error(
								`Unkown request format: '${format}'`
							);
					}

					return {
						response: request.ok ? result : undefined,
						errorResponse: request.ok ? undefined : result,

						isOk: request.ok,
						statusCode: request.status,
						statusText: request.statusText
					};
				}
			}
		);

		handle("termination", ({ data }) => {
			this.#registerTermination(pid, data);

			// delete all sounds
			for (const item of this.#sounds) {
				const soundID = item[0];
				const sound = item[1];
				if (!sound) continue;

				sound.info.remove();
				this.#sounds.delete(soundID);
			}
		});

		handle(
			"env_input",
			async ({ message = "Messsage not provided.", config }) => {
				const program = getProgram();

				return await program.onInput(message, {
					hideTyping: config.hideTyping,
					leaveInputOnCompletion: config.leaveInputOnCompletion,
					inline: config.inline,
					initialText: config.initialText
				});
			}
		);

		handle("env_set_logs", ({ logs }) => {
			const program = getProgram();

			return program.onSetLogs(logs);
		});

		handle("env_terminal_dimensions", () => {
			const program = getProgram();

			return program.getTerminalDimensions();
		});

		handle("kernel_uptime", () => Date.now() - this.#kernel.start);
		handle("kernel_version", () => this.#kernel.version);

		handle("keepAlive", () => {
			workerStore.lastKeepAlive = Date.now();
		});

		/* ----- Sounds ----- */

		handle("env_sound_play", async ({ config }) => {
			const program = getProgram();
			const sound = await this.#kernel.ui.playSound?.(
				"file" in config
					? { ...config, file: reroot(config.file) }
					: config
			);

			const id = this.#nextSoundID++;

			if (!sound) return { id, duration: 5 };

			this.#sounds.set(id, { info: sound, program });

			sound.onStop.then((time) => {
				// @ts-expect-error
				workerStore.emit(`sound_stopped_${id}`, {
					time
				});

				this.#sounds.delete(id);
			});

			return {
				id,
				duration: sound.duration
			};
		});

		handle("env_sound_pause", async ({ soundID }) => {
			const sound = this.#sounds.get(soundID);

			if (!sound) throw new Error(`Sound ${soundID} does not exist.`);

			sound.info.pause();
		});

		handle("env_sound_resume", async ({ soundID }) => {
			const sound = this.#sounds.get(soundID);

			if (!sound) throw new Error(`Sound ${soundID} does not exist.`);

			sound.info.play();
		});

		handle("env_sound_remove", async ({ soundID }) => {
			const sound = this.#sounds.get(soundID);

			if (!sound) return;

			sound.info.remove();
			this.#sounds.delete(soundID);
		});

		// sockets
		handle("Sockets/Client/newConnection", (packet) => {
			const client = getProgram();

			return this.#sockets.newClientConnection(client, {
				...packet,
				socketDirectory: reroot(packet.socketDirectory)
			});
		});
		handle("Sockets/Client/endConnection", (packet) => {
			const disconnectingClient = getProgram();

			return this.#sockets.endClientConnection(
				disconnectingClient,
				packet
			);
		});
		handle("Sockets/Client/sendPacket", (packet) => {
			const client = getProgram();

			return this.#sockets.clientSendMessage(client, packet);
		});

		handle("Sockets/Server/newServer", (packet) => {
			const server = getProgram();

			return this.#sockets.newServerInstance(server, {
				...packet,
				socketDirectory: reroot(packet.socketDirectory)
			});
		});
		handle("Sockets/Server/endServer", (packet) => {
			const server = getProgram();

			return this.#sockets.endServerInstance(server, packet);
		});
		handle("Sockets/Server/sendPacket", (packet) => {
			const server = getProgram();

			return this.#sockets.serverSendMessage(server, packet);
		});

		// @ts-expect-error // withTransfer explodes the types
		handle("env_get_liveCanvas", async ({ width, height }) => {
			const liveCanvas = await this.#kernel.ui.getLiveCanvas?.(
				width,
				height
			);

			if (!liveCanvas) {
				throw new Error(
					"UI did not provide a canvas element (or does not support liveCanvas)."
				);
			}

			const program = getProgram();
			program.liveCanvasIds.push(liveCanvas.id);

			return withTransfer(liveCanvas, [liveCanvas.canvas]);
		});

		handle("env_remove_liveCanvas", ({ id }) => {
			const program = getProgram();

			if (program.liveCanvasIds.includes(id)) {
				// good to go
				this.#kernel.ui.removeLiveCanvas?.(id);
			} else {
				throw new Error(`Program does not own liveCanvas#${id}`);
			}
		});

		handle("proxy_trigger_event", (msg) => {
			switch (msg.eventName) {
				case "keydown":
				case "keyup": {
					// allowed
					const target = this.programByPid(msg.subjectPid);

					triggerProgramEvent(target, msg.eventName, msg.data);

					break;
				}

				default:
				// not allowed to trigger
			}
		});

		handle("change_password", async (msg) => {
			await insurePrivilege(getProgram(), this.#kernel.users);

			return this.#kernel.users.changePassword(msg.uid, msg.newPassword);
		});

		handle("validate_password", async (msg) => {
			const user = await this.#kernel.users.userByUID(msg.uid);
			if (!user)
				throw new Error(`User by UID ${msg.uid} does not exist.`);

			return this.#kernel.users.verifyPassword(user, msg.password);
		});

		this.workers.push(workerStore);
		this.#log(`New worker created. (#${workerID})`);

		return workerStore;
	}

	#controllerStack: ProgramStore[] = [];
	#handoverDisplay(oldOwner: ProgramStore, newOwner: ProgramStore) {
		const oldPID = oldOwner.pid;

		if (this.#kernel.ui.controller !== oldOwner) {
			// nope, welp.
			throw new Error(
				`Program by PID ${oldPID} attempted to handover display it does not own.`
			);
		}

		// push old owner to stack
		this.#controllerStack.push(oldOwner);

		this.#kernel.ui.controller = newOwner;

		this.#switchLogs(newOwner);
	}

	#switchLogs(program: ProgramStore) {
		this.#kernel.ui.clear();

		const workerName = program.worker.name;

		for (const log of program.logs) {
			switch (log.type) {
				case "log":
					this.#workerLog(workerName, log.data);
					break;

				case "warning":
					this.#workerWarn(workerName, log.data);
					break;

				case "error":
					this.#workerError(workerName, log.data);
					break;

				case "input":
					const result = this.#kernel.ui.input(
						log.message,
						log.config
					);
					result.then((result) => {
						if (result.finished == false) {
							// not done yet, leave it
							return;
						}

						log.callback(result);
					});
					break;

				default:
					// @ts-expect-error
					throw new Error(`Unknown log type: ${log.type}`);
			}
		}
	}

	async execLoop() {
		if (this.#exited) return;

		const now = Date.now();

		for (const worker of this.workers) {
			if (
				worker.lastKeepAlive + 10000 < now &&
				(nodeJs || window?.document?.visibilityState == "visible")
			) {
				if (worker.program) {
					worker.program.onLog("log", [
						{
							text: "WorkerCrash: Program worker became unresponsive, possibly due to bad worker implementation OR program breakage.",
							colour: "#ff0000"
						}
					]);
					this.#registerTermination(worker.program.pid);
				}
				continue;
			}

			if (worker.lock) continue;
			worker.lock = true;

			worker
				.sendMessage("execLoop", undefined)
				.then(({ programs, completePrograms, computePercentage }) => {
					worker.totalPrograms -= completePrograms.length;
					worker.computePercentage = computePercentage;

					if (worker.totalPrograms !== programs.length) {
						this.#panic(
							new Error(
								`Internal knowledge of total programs does not match that of worker#${worker.id}'s report (worker#${worker.id} stated ${programs.length}, runtime expected ${worker.totalPrograms})`
							)
						);
					}

					worker.lock = false;
				});
		}
	}

	switchToProgram(pid: number) {
		const program = this.programByPid(pid);

		this.#kernel.ui.controller = program;
		this.#switchLogs(program);
	}

	async executeProgram(
		directory: string,
		parent: undefined,
		user: User,
		args?: string[],
		config?: ProgramConfig
	): Promise<ProgramStore>;
	async executeProgram(
		directory: string,
		parent: ProgramStore,
		user?: User,
		args?: string[],
		config?: ProgramConfig
	): Promise<ProgramStore>;
	async executeProgram(
		directory: string,
		parent: ProgramStore | undefined,
		user?: User,
		args?: string[],
		config?: ProgramConfig
	): Promise<ProgramStore> {
		this.#log("Executing program from " + directory);

		const pid = this.#nextPID++;
		const worker = await this.#createWorker(directory, pid);
		const workerName = worker.name;

		const proxyOwner = config?.outputProxy
			? this.programByPid(config?.outputProxy)
			: undefined;

		const programUser = user ?? parent?.user;
		if (!programUser) throw new Error();

		const program: ProgramStore = {
			worker: worker,

			parent,
			children: new Set(),
			user: programUser,

			directory,
			pid,
			startTime: new Date(),

			onExit: (data?: Log) => {
				this.workers.forEach((store) => {
					store.emit("program_exit", {
						pid: program.pid,
						data,
						logs: program.logs
							.filter((item) => item.type !== "input")
							.map((item) => item.data)
					});
				});
			},

			onLog: (type, data) => {
				program.logs.push({ type, data: data });

				if (proxyOwner) {
					proxyOwner.worker.emit("proxy_log", {
						handlerPid: proxyOwner.pid,
						subjectPid: program.pid,

						log: { type, data }
					});
				}

				const hasDisplay = this.#kernel.ui.controller == program;
				if (hasDisplay) {
					switch (type) {
						case "log":
							this.#workerLog(workerName, data);
							break;

						case "warning":
							this.#workerWarn(workerName, data);
							break;

						case "error":
							this.#workerError(workerName, data);
							break;
					}
				} else {
					switch (type) {
						case "log":
							this.#logWithCustomSource(program.directory, data);
							break;

						case "warning":
							this.#warn([
								{
									text: `${program.directory} `,
									colour: "#bbbbbb"
								},
								{ text: logToString(data) }
							]);
							break;

						case "error":
							this.#error([
								{
									text: `${program.directory} `,
									colour: "#999999"
								},
								{ text: logToString(data) }
							]);
							break;
					}
				}
			},

			onSetLogs: (logs) => {
				if (!logs) logs = [];
				program.logs = logs.map((item) => {
					return { type: "log", data: item };
				});

				if (proxyOwner) {
					proxyOwner.worker.emit("proxy_set_logs", {
						handlerPid: proxyOwner.pid,
						subjectPid: program.pid,
						logs
					});
				}

				if (this.#kernel.ui.controller == program) {
					this.#kernel.ui.clear();
					for (const log of logs) {
						this.#workerLog(workerName, log);
					}
				}
			},

			onInput: async (query: string, config) => {
				let onResolve: (value: string) => void = () => {};
				const promise = new Promise<string>(
					(resolve) => (onResolve = resolve)
				);

				const inputLog: ProgramInputLog = {
					type: "input",
					message: query,
					config: config,
					callback: (result) => {
						if (result.finished == false) return; // false alarm

						const { response } = result;
						const displayText = `${query}${response}`;

						// remove input log, add resultant log
						program.logs = program.logs.filter(
							(item) => item !== inputLog
						);
						program.logs.push({ type: "log", data: displayText });

						onResolve(response);
					}
				};

				program.logs.push(inputLog);

				const noInput = async () => {
					// it'll get resolved at some point, when the UI switches again. just leave it.
				};

				const getProxyInput = async () => {
					if (!proxyOwner) return;

					const inputResponse = await proxyOwner.worker.sendMessage(
						"proxy_input",
						{
							handlerPid: proxyOwner.pid,
							subjectPid: program.pid,

							message: query,
							config
						}
					);

					if (!inputResponse) return noInput();

					if (!inputResponse.finished) {
						return noInput();
					}

					inputLog.callback(inputResponse);
				};

				const getUiInput = async () => {
					const inputResponse = await this.#kernel.ui.input(
						query,
						config
					);

					if (inputResponse.finished == false) {
						return noInput();
					}

					inputLog.callback(inputResponse);
				};

				if (proxyOwner) {
					getProxyInput();
				} else if (this.#kernel.ui.controller !== program) {
					noInput();
				} else {
					getUiInput();
				}

				return promise;
			},

			getTerminalDimensions: async (): Promise<{
				width: number;
				height: number;
			}> => {
				const fallback = { width: 100, height: 100 };

				const getProxyDimensions = async () => {
					if (!proxyOwner) return fallback;

					return await proxyOwner.worker.sendMessage(
						"proxy_get_dimensions",
						{
							handlerPid: proxyOwner.pid,
							subjectPid: program.pid
						}
					);
				};

				const getDisplayDimensions = () => {
					return {
						width: window.innerWidth,
						height: window.innerHeight
					};
				};

				if (proxyOwner) {
					return (await getProxyDimensions()) ?? fallback;
				} else if (this.#kernel.ui.controller !== program) {
					return fallback;
				} else {
					return getDisplayDimensions();
				}
			},

			logs: [],
			liveCanvasIds: []
		};
		worker.program = program;

		let oldDisplayOwner: ProgramStore | undefined;

		if (this.#kernel.ui.controller == undefined) {
			this.#kernel.ui.controller = program;
		} else if (config?.displayHandover?.oldOwner) {
			oldDisplayOwner = this.programByPid(
				config?.displayHandover?.oldOwner
			);

			this.#handoverDisplay(oldDisplayOwner, program);
		}

		if (this.#initProgram == undefined) this.#initProgram = program;

		if (parent) parent.children.add(program);
		this.programs.push(program);

		const code = await this.#fs.readFile(directory);
		if (!code)
			throw new Error(
				`File at ${directory} cannot be executed because it does not exist.`
			);

		const ok = await worker.sendMessage("executeProgram", {
			directory,
			code,
			pid,

			args,
			workingDirectory: config?.workingDirectory ?? "/",
			input: config?.input
		});
		if (!ok) {
			// not great, let's exit properly.

			if (oldDisplayOwner) {
				this.#handoverDisplay(program, oldDisplayOwner);
			}

			throw new Error(
				"Failure to execute program (exit in program init?)"
			);
		}

		worker.totalPrograms += 1;

		return program;
	}

	#registerTermination(pid: number, data?: any) {
		const id = this.programs.map((item) => item.pid).indexOf(pid);
		if (id == -1) return;

		const program = this.programs[id];
		this.#log(
			`Program by PID ${pid} (from ${program.directory}) has exited.`
		);

		// reparent children to init
		if (program.children.size !== 0) {
			program.children.forEach(
				(child) => (child.parent = this.#initProgram)
			);
		}

		// remove from parent's child list
		if (program.parent) {
			program.parent.children.delete(program);
		}

		// remove from worker
		program.worker.program = undefined;

		// remove from controller stack if present
		if (this.#controllerStack.includes(program))
			this.#controllerStack = this.#controllerStack.filter(
				(item) => item !== program
			);

		if (this.#kernel.ui.controller === program) {
			const previous = this.#controllerStack.pop();

			if (previous) {
				this.#kernel.ui.controller = previous;

				this.#switchLogs(previous);
			} else {
				// nothing to return to
				this.#kernel.ui.controller = undefined;
				this.#kernel.ui.clear();
			}
		}

		// remove
		this.programs.splice(id, 1);

		// update worker.totalPrograms, inform workers it has exited.
		program.onExit(data);

		// kill worker
		program.worker.exit();

		if (this.programs.length == 0) {
			this.#kernel.exit();
			this.#exited = true;
		}
	}

	#exited = false;
	exit() {
		if (!nodeJs)
			window.document.removeEventListener(
				"visibilitychange",
				this.#onVisibilityChange
			);

		this.workers.forEach((store) => store.exit());
	}
}
