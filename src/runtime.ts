import Constellation from "./index";
import { FilesystemInterface } from "./lib/fs";
import { newWorker, workerFunction } from "./lib/worker";
import { onPasteData, Process } from "./types/worker";
import { implementWorkerFS, mainThreadMessageHandler } from "./lib/workerUtils";
import {
	WorkerEnv_Exec,
	WorkerEnv_Input,
	WorkerEnv_Network_Get
} from "./types/workerMessages";
import {
	RuntimeExecuteProgram,
	RuntimeProgramInputEvent,
	RuntimeProgramInputOnPaste
} from "./types/runtimeMessages";
import { Log } from "./ui/ui";
import { RuntimeProgramLogEvent } from "./types/runtimeMessages";

export interface ProgramStore {
	worker: WorkerStore;

	parent?: ProgramStore;
	children: ProgramStore[];

	pid: number;
	directory: string;
	startTime: Date;

	onExit: (data?: any) => void;

	logs: { type: "log" | "warning" | "error"; data: Log }[];
	outputProxy?: ProgramStore;

	onLog(type: "log" | "warning" | "error", data: Log): void;
	onInput(
		message: string,
		conceal?: boolean,
		keepInput?: boolean,
		functions?: {
			onPaste: (data: onPasteData) => void;
		}
	): Promise<string>;
}

export interface WorkerStore {
	worker: Worker;
	totalPrograms: number;

	computePercentage: number;
	lastKeepAlive: number;

	id: number;
	name: string;
	lock: boolean;

	sendMessage<T = any, K = any>(intent: string, data?: K): Promise<T>;
	emit<T = any>(event: string, data?: T): void;
	exit(): void;
}

export default class Runtime {
	#log: (message: string) => void;
	#warn: (message: string) => void;
	#error: (message: string) => void;

	#workerLog: (origin: string, message: Log) => void;
	#workerWarn: (origin: string, message: Log) => void;
	#workerError: (origin: string, message: Log) => void;

	#panic: (message: Error) => void;
	#kernel: Constellation;
	#fs: FilesystemInterface;

	targetWorkers: number = 3;
	#workers: WorkerStore[];

	constructor(
		kernel: Constellation,

		log: (origin: string, message: Log) => void,
		warn: (origin: string, message: Log) => void,
		error: (origin: string, message: Log) => void,

		panic: (message: Error) => void,
		fs: FilesystemInterface
	) {
		this.#kernel = kernel;

		this.#log = (data: string) => {
			if (!this.#kernel.ui.controller) log("runtime", data);
		};
		this.#warn = (data: string) => {
			if (!this.#kernel.ui.controller) warn("runtime", data);
		};
		this.#error = (data: string) => {
			if (!this.#kernel.ui.controller) error("runtime", data);
		};

		this.#log("Program Runtime Initialising...");

		this.#workerLog = log;
		this.#workerWarn = warn;
		this.#workerError = error;

		this.#panic = panic;
		this.#fs = fs;

		this.#sessions = [];
		this.#workers = [];

		this.#log("Program runtime initialised.");
	}

	#sessions: ProgramStore[];
	#initSession!: ProgramStore;
	#programByPid(id: number) {
		const index = this.#sessions.map((program) => program.pid).indexOf(id);

		if (index == -1) {
			throw new Error(`Session by ID '${id}' does not exist.`);
		}

		return this.#sessions[index];
	}

	#nextPID: number = 1;
	#nextWorkerID: number = 1;

	#updateWorkers() {
		if (this.#exited) return;

		// insure we have the right amount of workers
		while (this.#workers.length < this.targetWorkers) {
			// initialise worker
			const workerID = this.#nextWorkerID++;
			const workerName = `runtimeWorker#${workerID}`;

			const worker = newWorker(workerFunction, workerName);

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

					this.#workers = this.#workers.filter(
						(item) => item !== workerStore
					);
				}
			};

			const { sendMessage, handle, emit } = mainThreadMessageHandler(
				worker,
				workerStore
			);

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
				({ data, pid }: { data: string; pid: number }) => {
					const program = this.#programByPid(pid);

					program.onLog("log", data);
				}
			);
			handle(
				"program_warn",
				({ data, pid }: { data: string; pid: number }) => {
					const program = this.#programByPid(pid);

					program.onLog("warning", data);
				}
			);
			handle(
				"program_error",
				({ data, pid }: { data: string; pid: number }) => {
					const program = this.#programByPid(pid);

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
					outputProxy
				}: WorkerEnv_Exec) => {
					const parent = this.#programByPid(parentPid);

					const program = await this.executeProgram(
						path,
						parent,
						args,
						{
							displayHandover: { oldOwner: executingProgramPid },
							workingDirectory,
							outputProxy: outputProxy ? parentPid : undefined
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

				for (const proc of this.#sessions) {
					const obj = sessionToProgram(proc);

					list.push(obj);
				}

				return list;
			});

			handle("env_parent_process", async ({ pid }: { pid: number }) => {
				const program = this.#programByPid(pid);

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

							return new Promise((resolve) => {
								const reader = new FileReader();
								reader.onload = () => resolve(reader.result);
								reader.readAsDataURL(blob);
							});

						default:
							throw new Error(
								`Unkown request format: '${format}'`
							);
					}
				}
			);

			handle(
				"termination",
				({ pid, data }: { pid: number; data?: any }) => {
					this.#registerTermination(pid, data);
				}
			);

			handle(
				"env_input",
				async ({
					pid,
					message = "Messsage not provided.",
					conceal = false,
					keepInput = true,
					onPasteFunctionPresent = false
				}: WorkerEnv_Input) => {
					const program = this.#programByPid(pid);

					return await program.onInput(message, conceal, keepInput, {
						onPaste: (data: onPasteData) => {
							if (!onPasteFunctionPresent) return;

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
				const program = this.#programByPid(pid);

				program.logs = [];

				if (this.#kernel.ui.controller == program) {
					this.#kernel.ui.clear();
				}
			});

			handle("kernel_uptime", () => Date.now() - this.#kernel.start);
			handle("kernel_version", () => this.#kernel.version);

			handle("worker_stats", () => {
				const workers = this.#workers;

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

			this.#workers.push(workerStore);

			this.#log(`New worker created. (#${workerID})`);
		}
		while (this.#workers.length > this.targetWorkers) {
			let hasTerminated = false;

			// too many, try to terminate one
			for (let i = this.#workers.length - 1; i > 0; i--) {
				const worker = this.#workers[i];

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
			// it's possible that this is a proxy handover
			if (oldOwner.outputProxy) {
				// yep
				newOwner.onLog = oldOwner.onLog;
				newOwner.onInput = oldOwner.onInput;
				newOwner.outputProxy = oldOwner.outputProxy;

				this.#switchLogs(newOwner);
			} else {
				// nope, welp.
				throw new Error(
					`Program by PID ${oldPID} attempted to handover display it does not own. (no proxy present)`
				);
			}
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

				default:
					throw new Error(`Unknown log type: ${log.type}`);
			}
		}
	}

	async execLoop() {
		if (this.#exited) return;

		this.#updateWorkers();

		const now = Date.now();

		for (const worker of this.#workers) {
			if (worker.lastKeepAlive + 1000 < now) {
				// uh
				console.warn(
					`${worker.name} is unresponsive. Panicking if no response within 5 further seconds.`
				);

				if (worker.lastKeepAlive + 6000 < now) {
					this.#panic(
						new Error(
							`Worker ${worker.id} became unresponsive. Program states are not recoverable.`
						)
					);
				}
			}

			if (worker.lock) continue;
			worker.lock = true;

			type execLoopResponse = {
				programs: {
					pid: number;
					directory: string;
				}[];
				completePrograms: { pid: number }[];
				computePercentage: number;
			};

			worker
				.sendMessage<execLoopResponse>("execLoop")
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

	async executeProgram(
		directory: string,
		parent?: ProgramStore,
		args?: string[],
		config?: {
			displayHandover?: { oldOwner?: number };
			workingDirectory: string;
			outputProxy?: number;
		}
	) {
		if (this.#workers.length == 0) {
			this.#updateWorkers();
		}

		this.#log("Executing program from " + directory);

		let freestWorker: WorkerStore = this.#workers[0];

		for (const worker of this.#workers) {
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
			children: [],

			directory,
			pid,
			startTime: new Date(),

			onExit: (data?: any) => {
				this.#workers.forEach((store) => {
					store.emit("program_exit", {
						pid: program.pid,
						data,
						logs: program.logs.map((item) => item.data)
					});
				});
			},

			onLog: (type, data) => {
				program.logs.push({ type, data: data });

				if (program.outputProxy) {
					// do the thing
					const target = program.outputProxy;
					const workerStore = target.worker;

					workerStore.emit<RuntimeProgramLogEvent>("program_log", {
						type,
						data,
						handler: target.pid,
						origin: program.pid
					});

					return;
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
			onInput: async (
				message: string,
				conceal?: boolean,
				keepInput?: boolean,
				functions?: {
					onPaste: (data: onPasteData) => void;
				}
			) => {
				if (program.outputProxy) {
					// do the thing
					const target = program.outputProxy;
					const workerStore = target.worker;

					const response = await workerStore.sendMessage<
						string,
						RuntimeProgramInputEvent
					>("program_input", {
						message,
						handler: target.pid,
						origin: program.pid
					});

					return response;
				}

				if (this.#kernel.ui.controller !== program) {
					// sorrey.
					return new Promise<string>(() => {});
				}

				const { response, displayText } = await this.#kernel.ui.input(
					message,
					conceal,
					keepInput,
					functions?.onPaste
				);
				program.logs.push({ type: "log", data: displayText });

				return response;
			},

			logs: [],
			outputProxy: config?.outputProxy
				? this.#programByPid(config.outputProxy)
				: undefined
		};

		let oldDisplayOwner: ProgramStore | undefined;

		if (this.#kernel.ui.controller == undefined) {
			this.#kernel.ui.controller = program;
		} else if (config?.displayHandover?.oldOwner) {
			oldDisplayOwner = this.#programByPid(
				config?.displayHandover?.oldOwner
			);

			this.#handoverDisplay(oldDisplayOwner, program);
		}

		const ok = await worker.sendMessage<boolean, RuntimeExecuteProgram>(
			"executeProgram",
			{
				directory,
				pid,

				args,
				workingDirectory: config?.workingDirectory ?? "/"
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

		if (this.#initSession == undefined) this.#initSession = program;

		if (parent) parent.children.push(program);
		this.#sessions.push(program);

		return program;
	}

	#registerTermination(pid: number, data?: any) {
		const id = this.#sessions.map((item) => item.pid).indexOf(pid);
		if (id == -1) return;

		const program = this.#sessions[id];
		this.#log(
			`Program by PID ${pid} (from ${program.directory}) has exited.`
		);

		// reparent children to init
		if (program.children.length !== 0) {
			program.children.forEach(
				(child) => (child.parent = this.#initSession)
			);
		}

		// remove from parent's child list
		if (program.parent) {
			program.parent.children = program.parent.children.filter(
				(item) => item !== program
			);
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
		this.#sessions.splice(id, 1);

		// update worker.totalPrograms, inform workers it has exited.
		program.onExit(data);

		if (this.#sessions.length == 0) {
			this.#kernel.exit();
			this.#exited = true;
		}
	}

	#exited = false;
	exit() {
		this.#workers.forEach((store) => store.exit());
	}
}
