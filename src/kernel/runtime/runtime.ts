import { Log, User } from "@/types/worker";
import { UiManager } from "../ui/ui";
import Epoch3Kernel from "../kernel";
import { FilesystemInterface } from "../fs/fs";
import SocketManager from "./sockets";
import {
	ProgramConfig,
	ProgramInputLog,
	ProgramStore,
	RuntimeSoundsStore,
	WorkerStore
} from "./types";
import { consoleError, consoleLog, consoleWarn } from "../ui/dom";
import ConstellationWorker from "web-worker:../../worker/worker";
import { implementWorkerFS } from "./handlers/fs";
import { join } from "path-browserify";
import { logToString } from "@/lib/logs";
import handleInputOutput from "./handlers/io";
import { RuntimeMessageIntent } from "../types/intents";
import handleExecutionFlow from "./handlers/execution";
import handleProcesses from "./handlers/processes";
import handleNetwork from "./handlers/network";
import handleKernelInfo from "./handlers/kernelInfo";
import handleSounds from "./handlers/sounds";
import handleSockets from "./handlers/sockets";
import handlePasswords from "./handlers/passwords";
import { mainThreadMessageHandler } from "./handlers/handler";
import { makeChannel } from "sync-message";

export default class Runtime {
	#log: (message: Log) => void;
	#logWithCustomSource: (source: string, message: Log) => void;
	#warn: (message: Log) => void;
	#error: (message: Log) => void;

	#workerLog: UiManager["log"];
	#workerWarn: UiManager["warn"];
	#workerError: UiManager["error"];

	#panic: (message: Error) => void;
	#kernel: Epoch3Kernel;
	#fs: FilesystemInterface;

	#sockets: SocketManager;

	targetWorkers: number = 0;
	workers: WorkerStore[];

	nextSoundID = 0;
	#sounds: RuntimeSoundsStore = new Map();

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

	constructor(
		kernel: Epoch3Kernel,

		log: UiManager["log"],
		warn: UiManager["warn"],
		error: UiManager["error"],

		panic: (message: Error) => void,
		fs: FilesystemInterface
	) {
		this.#kernel = kernel;

		const logWithSource = (source: string, data: Log) => {
			if (!this.#kernel.ui.controller) return log(source, data);

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
	}

	async #createWorker(
		programDirectory: string,
		pid: number
	): Promise<WorkerStore> {
		const workerID = this.#nextWorkerID++;
		const workerName = `Worker #${workerID} (for ${programDirectory})`;

		const worker = new ConstellationWorker();

		const atomicChannel = makeChannel({
			atomics: { bufferSize: 5 * 1024 * 1024 } // 5 MB
		});
		if (!atomicChannel) {
			throw new Error("Atomic channel not supported.");
		}

		const workerStore: WorkerStore = {
			worker,
			totalPrograms: 0,
			sharedArrayBuffer: new SharedArrayBuffer(1024 ** 2), // 1 MB size
			atomicChannel,
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
			await mainThreadMessageHandler(worker);

		workerStore.sendMessage = sendMessage;
		workerStore.emit = emit;

		let __program: ProgramStore | undefined = undefined;
		const getProgram = () => {
			if (!__program) __program = this.programByPid(pid);

			return __program;
		};

		function reroot(path: string) {
			if (path.split("/").at(-1)?.trim?.() == "§") {
				const rerooted = getProgram().directory;

				return rerooted;
			} else {
				const user = getProgram().user;

				const rerooted = join(user.home, path);

				return rerooted;
			}
		}

		implementWorkerFS(
			handle,
			workerStore,
			this.#fs,
			this.#kernel.users,
			() => getProgram().user,
			reroot
		);

		// logging and input
		handleInputOutput(
			handle,
			withTransfer,
			getProgram,
			this.programByPid,
			this.#kernel.ui
		);

		// ability to spawn other processes or exit
		handleExecutionFlow(
			handle,
			getProgram,
			reroot,
			this.#kernel.users,
			this.executeProgram.bind(this),

			(data) => this.#registerTermination(pid, data)
		);

		// access to process information
		handleProcesses(handle, getProgram, this);

		// network requests
		handleNetwork(handle, this.#kernel.netMap);

		// kernel info
		handleKernelInfo(handle, this.#kernel);

		handleSounds(
			handle,
			getProgram,
			reroot,
			this,
			this.#sounds,
			this.#kernel.ui
		);

		// sockets for IPC
		handleSockets(handle, getProgram, reroot, this.#sockets);

		// validation of passwords
		handlePasswords(handle, getProgram, this.#kernel.users);

		sendMessage(RuntimeMessageIntent.send_atomics_channel, atomicChannel);

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

	async dispatchPrograms() {
		if (this.#exited) return;

		for (const worker of this.workers) {
			if (worker.lock) continue;
			worker.lock = true;

			worker
				.sendMessage(RuntimeMessageIntent.dispatch_frame, undefined)
				.then(({ programs, completePrograms }) => {
					worker.totalPrograms -= completePrograms.length;

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

	#rootLog(program: ProgramStore, log: Log) {
		if (typeof log == "string") return log;

		const workingLog = structuredClone(log);

		for (const part of workingLog) {
			switch (part.type) {
				case "image":
					if ("dir" in part) {
						part.dir = program.user.home + part.dir;
					}
					break;
			}
		}

		return workingLog;
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
		if (!programUser) throw new Error("No user to execute with was agiven");

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
					store.emit(RuntimeMessageIntent.program_exit_inform, {
						pid: program.pid,
						data,
						logs: program.logs
							.filter((item) => item.type !== "input")
							.map((item) => item.data)
					});
				});
			},

			onLog: (type, data) => {
				const rootedData = this.#rootLog(program, data);

				program.logs.push({ type, data: rootedData });

				if (proxyOwner) {
					proxyOwner.worker.emit(RuntimeMessageIntent.proxy_log, {
						handlerPid: proxyOwner.pid,
						subjectPid: program.pid,

						log: { type, data: rootedData }
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
					proxyOwner.worker.emit(
						RuntimeMessageIntent.proxy_set_logs,
						{
							handlerPid: proxyOwner.pid,
							subjectPid: program.pid,
							logs
						}
					);
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
						RuntimeMessageIntent.proxy_input,
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
						RuntimeMessageIntent.proxy_get_dimensions,
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

		const ok = await worker.sendMessage(
			RuntimeMessageIntent.begin_execution,
			{
				directory,
				code,
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

		// stop sounds
		for (const item of this.#sounds) {
			const soundID = item[0];
			const sound = item[1];

			if (!sound || sound.program !== program) continue;

			sound.info.remove();
			this.#sounds.delete(soundID);
		}

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
		this.workers.forEach((store) => store.exit());
	}
}
