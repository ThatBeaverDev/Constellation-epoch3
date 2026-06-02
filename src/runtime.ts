import Constellation from "./index";
import { FilesystemInterface } from "./lib/fs";
import { newWorker, workerFunction } from "./lib/worker";
import { InputConfig, Log, Process } from "./util/types/worker";
import { implementWorkerFS, mainThreadMessageHandler } from "./lib/workerUtils";
import {
	Worker_Sockets_Client_endConnection,
	Worker_Sockets_Client_newConnection,
	Worker_Sockets_Client_sendPacket,
	Worker_Sockets_Server_endServer,
	Worker_Sockets_Server_newServer,
	WorkerEnv_Exec,
	WorkerEnv_Input,
	WorkerEnv_Network_Get,
	WorkerEnv_PlaySound,
	WorkerEnv_SoundAction,
	WorkerEnv_SoundRemove
} from "./types/workerMessages";
import {
	Runtime_Sockets_Server_sendPacket,
	RuntimeExecuteProgram,
	RuntimeProgramInputOnPaste
} from "./types/runtimeMessages";
import {
	consoleError,
	consoleLog,
	consoleWarn,
	PlaySoundResponse
} from "./ui/dom";
import { UiManager } from "./types/ui";
import SocketManager from "./lib/sockets";
import { nodeJs } from "./lib/config";
import { blobToDataURL } from "./util/lib/dataUri";

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
	worker: WorkerStore;

	parent?: ProgramStore;
	children: Set<ProgramStore>;

	pid: number;
	directory: string;
	startTime: Date;

	onExit: (data?: any) => void;

	logs: (ProgramLog | ProgramInputLog)[];

	onLog(type: "log" | "warning" | "error", data: Log): void;
	onInput(message: string, config: InputConfig): Promise<string>;
}

export interface WorkerStore {
	worker: Worker;
	totalPrograms: number;

	computePercentage: number;
	lastKeepAlive: number;

	id: number;
	name: string;
	lock: boolean;

	sendMessage<T = any, K = any>(intent: string, data: K): Promise<T>;
	emit<T = any>(event: string, data: T): void;
	exit(): void;
}

export default class Runtime {
	#log: (message: Log) => void;
	#warn: (message: Log) => void;
	#error: (message: Log) => void;

	#workerLog: UiManager["log"];
	#workerWarn: UiManager["warn"];
	#workerError: UiManager["error"];

	#panic: (message: Error) => void;
	#kernel: Constellation;
	#fs: FilesystemInterface;

	#sockets: SocketManager;

	targetWorkers: number = 5;
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

			consoleLog(source, data);
			return 0;
		};
		this.#log = logWithSource.bind(undefined, "runtime");
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

	async #updateWorkers() {
		if (this.#exited) return;

		// insure we have the right amount of workers
		while (this.workers.length < this.targetWorkers) {
			// initialise worker
			const workerID = this.#nextWorkerID++;
			const workerName = `runtimeWorker#${workerID}`;

			const worker = await newWorker(workerFunction, workerName);

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

			const { sendMessage, handle, emit } =
				await mainThreadMessageHandler(worker, workerStore);

			workerStore.sendMessage = sendMessage;
			workerStore.emit = emit;

			implementWorkerFS(handle, this.#fs);

			handle("worker_log", ({ data }: { data: string }) => {
				this.#workerLog(workerName, data);
			});
			handle("worker_warn", ({ data }: { data: string }) => {
				this.#workerWarn(workerName, data);
			});
			handle("worker_error", ({ data }: { data: string }) => {
				this.#workerError(workerName, data);
			});

			handle(
				"program_log",
				({ data, pid }: { data: Log; pid: number }) => {
					const program = this.programByPid(pid);

					program.onLog("log", data);
				}
			);
			handle(
				"program_warn",
				({ data, pid }: { data: Log; pid: number }) => {
					const program = this.programByPid(pid);

					program.onLog("warning", data);
				}
			);
			handle(
				"program_error",
				({ data, pid }: { data: Log; pid: number }) => {
					const program = this.programByPid(pid);

					program.onLog("error", data);
				}
			);

			handle(
				"env_exec",
				async ({
					path,
					args,
					handoverDisplayPid: executingProgramPid,
					workingDirectory,
					parentPid,
					input
				}: WorkerEnv_Exec) => {
					const parent = this.programByPid(parentPid);

					const program = await this.executeProgram(
						path,
						parent,
						args,
						{
							displayHandover: { oldOwner: executingProgramPid },
							workingDirectory,
							input
						}
					);

					return { pid: program.pid };
				}
			);

			function sessionToProgram(session: ProgramStore): Process {
				return {
					pid: session.pid,
					directory: session.directory,

					startTime: session.startTime,
					core: session.worker.id
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

			handle("env_selfProcess", ({ pid }: { pid: number }) => {
				const program = this.programByPid(pid);

				const store = sessionToProgram(program);

				return store;
			});

			handle("env_parent_process", ({ pid }: { pid: number }) => {
				const program = this.programByPid(pid);

				const parent = program.parent;
				if (!parent) return undefined;

				return sessionToProgram(parent);
			});

			handle(
				"env_network_get",
				async ({
					type,
					url,
					format,
					body,
					headers
				}: WorkerEnv_Network_Get) => {
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

						switch (format) {
							case "text":
								return contents;
							case "json":
								return JSON.parse(contents);
							case "datauri":
								return blobToDataURL(new Blob([contents]));
						}
					} else {
						const request = await fetch(url, {
							method,
							body: bodyString,
							headers: headers
						});

						switch (format) {
							case "text":
								return request.text();
							case "json":
								return request.json();

							case "datauri":
								const blob = await request.blob();

								return await blobToDataURL(blob);

							default:
								throw new Error(
									`Unkown request format: '${format}'`
								);
						}
					}
				}
			);

			handle(
				"termination",
				({ pid, data }: { pid: number; data?: any }) => {
					this.#registerTermination(pid, data);

					// delete all sounds
					for (const item of this.#sounds) {
						const soundID = item[0];
						const sound = item[1];
						if (!sound) continue;

						sound.info.remove();
						this.#sounds.delete(soundID);
					}
				}
			);

			handle(
				"env_input",
				async ({
					pid,
					message = "Messsage not provided.",
					config
				}: WorkerEnv_Input) => {
					const program = this.programByPid(pid);

					return await program.onInput(message, {
						hideTyping: config.hideTyping,
						leaveInputOnCompletion: config.leaveInputOnCompletion,
						inline: config.inline,
						initialText: config.initialText,

						onPaste(data) {
							if (!config.onPasteFunctionPresent) return;

							workerStore.emit<RuntimeProgramInputOnPaste>(
								"program_input_onpaste",
								{
									pid,
									data
								}
							);
						}
					});
				}
			);

			handle("env_clear_logs", ({ pid }: { pid: number }) => {
				const program = this.programByPid(pid);

				program.logs = [];

				if (this.#kernel.ui.controller == program) {
					this.#kernel.ui.clear();
				}
			});

			handle("kernel_uptime", () => Date.now() - this.#kernel.start);
			handle("kernel_version", () => this.#kernel.version);

			handle("worker_stats", () => {
				const workers = this.workers;

				const result: {
					id: number;
					processes: number;
					activeTime: number;
				}[] = [];

				for (const worker of workers) {
					result.push({
						id: worker.id,

						processes: worker.totalPrograms,

						activeTime: worker.computePercentage / 100
					});
				}

				return result;
			});

			handle("keepAlive", () => {
				workerStore.lastKeepAlive = Date.now();
			});

			/* ----- Sounds ----- */

			handle(
				"env_sound_play",
				async ({ config, pid }: WorkerEnv_PlaySound) => {
					const program = this.programByPid(pid);
					const sound = await this.#kernel.ui.playSound?.(config);

					const id = this.#nextSoundID++;

					if (!sound) return { id, duration: 5 };

					this.#sounds.set(id, { info: sound, program });

					sound.onStop.then((time) => {
						workerStore.emit(`sound_stopped_${id}`, {
							time
						});

						this.#sounds.delete(id);
					});

					return {
						id,
						duration: sound.duration
					};
				}
			);

			handle(
				"env_sound_pause",
				async ({ soundID }: WorkerEnv_SoundAction) => {
					const sound = this.#sounds.get(soundID);

					if (!sound)
						throw new Error(`Sound ${soundID} does not exist.`);

					sound.info.pause();
				}
			);

			handle(
				"env_sound_resume",
				async ({ soundID }: WorkerEnv_SoundAction) => {
					const sound = this.#sounds.get(soundID);

					if (!sound)
						throw new Error(`Sound ${soundID} does not exist.`);

					sound.info.play();
				}
			);

			handle(
				"env_sound_remove",
				async ({ soundID }: WorkerEnv_SoundRemove) => {
					const sound = this.#sounds.get(soundID);

					if (!sound) return;

					sound.info.remove();
					this.#sounds.delete(soundID);
				}
			);

			// sockets
			handle(
				"Sockets/Client/newConnection",
				(packet: Worker_Sockets_Client_newConnection) =>
					this.#sockets.newClientConnection(packet)
			);
			handle(
				"Sockets/Client/endConnection",
				(packet: Worker_Sockets_Client_endConnection) =>
					this.#sockets.endClientConnection(packet)
			);
			handle(
				"Sockets/Client/sendPacket",
				(packet: Worker_Sockets_Client_sendPacket) =>
					this.#sockets.clientSendMessage(packet)
			);

			handle(
				"Sockets/Server/newServer",
				(packet: Worker_Sockets_Server_newServer) =>
					this.#sockets.newServerInstance(packet)
			);
			handle(
				"Sockets/Server/endServer",
				(packet: Worker_Sockets_Server_endServer) =>
					this.#sockets.endServerInstance(packet)
			);
			handle(
				"Sockets/Server/sendPacket",
				(packet: Runtime_Sockets_Server_sendPacket) =>
					this.#sockets.serverSendMessage(packet)
			);

			this.workers.push(workerStore);

			this.#log(`New worker created. (#${workerID})`);
		}
		while (this.workers.length > this.targetWorkers) {
			let hasTerminated = false;

			// too many, try to terminate one
			for (let i = this.workers.length - 1; i > 0; i--) {
				const worker = this.workers[i];

				if (worker.totalPrograms == 0) {
					// we can terminate it.
					worker.exit();
					hasTerminated = true;

					break;
				}
			}

			if (!hasTerminated) {
				// all workers have a program. wait.
				break;
			}
		}
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

		await this.#updateWorkers();

		const now = Date.now();

		for (const worker of this.workers) {
			if (worker.lastKeepAlive + 1000 < now) {
				// uh
				console.warn(
					`${worker.name} is unresponsive. Panicking if no response within 5 further seconds.`
				);

				if (
					worker.lastKeepAlive + 6000 < now &&
					(window?.document?.visibilityState == "visible" || nodeJs)
				) {
					this.#panic(
						new Error(
							`Worker ${worker.id} became unresponsive. Program states are not recoverable.`
						)
					);
				}
			}

			if (worker.lock) continue;
			worker.lock = true;

			interface execLoopResponse {
				programs: {
					pid: number;
					directory: string;
				}[];
				completePrograms: { pid: number }[];
				computePercentage: number;
			}

			worker
				.sendMessage<execLoopResponse>("execLoop", undefined)
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
		parent?: ProgramStore,
		args?: string[],
		config?: {
			displayHandover?: { oldOwner?: number };
			workingDirectory: string;
			input?: Log[];
		}
	) {
		if (this.workers.length == 0) {
			await this.#updateWorkers();
		}

		this.#log("Executing program from " + directory);

		let freestWorker: WorkerStore = this.workers[0];

		for (const worker of this.workers) {
			if (worker.totalPrograms < freestWorker.totalPrograms) {
				// it has less
				freestWorker = worker;
			}
		}

		const worker = freestWorker;
		const pid = this.#nextPID++;
		const workerName = worker.name;

		const program: ProgramStore = {
			worker: worker,

			parent,
			children: new Set(),

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
							this.#log(`${workerName} ${data}`);
							break;

						case "warning":
							this.#warn(`${workerName} ${data}`);
							break;

						case "error":
							this.#error(`${workerName} ${data}`);
							break;
					}
				}
			},
			onInput: async (message: string, config) => {
				let onResolve: (value: string) => void = () => {};
				const promise = new Promise<string>(
					(resolve) => (onResolve = resolve)
				);

				const inputLog: ProgramInputLog = {
					type: "input",
					message: message,
					config: config,
					callback: (result) => {
						if (result.finished == false) return; // false alarm

						const { response, displayText } = result;

						// remove input log, add resultant log
						program.logs = program.logs.filter(
							(item) => item !== inputLog
						);
						program.logs.push({ type: "log", data: displayText });

						onResolve(response);
					}
				};

				program.logs.push(inputLog);

				const fallbackInput = async () => {
					// it'll get resolved at some point, when the UI switches again. just leave it.
				};

				const directInput = async () => {
					const inputResponse = await this.#kernel.ui.input(
						message,
						config
					);

					if (inputResponse.finished == false) {
						return fallbackInput();
					}

					inputLog.callback(inputResponse);
				};

				if (this.#kernel.ui.controller !== program) {
					fallbackInput();
				} else {
					directInput();
				}

				return promise;
			},

			logs: []
		};

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

		const ok = await worker.sendMessage<boolean, RuntimeExecuteProgram>(
			"executeProgram",
			{
				directory,
				pid,

				args,
				workingDirectory: config?.workingDirectory ?? "/",
				input: config?.input
			}
		);
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
