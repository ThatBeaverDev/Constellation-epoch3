import Constellation from "./index";
import { FilesystemInterface } from "./lib/fs";
import { Environment, Process, workerFunction } from "./lib/worker";
import { implementWorkerFS, mainThreadMessageHandler } from "./lib/workerUtils";

export interface Session {
	worker: WorkerStore;

	parent?: Session;
	children: Session[];

	id: number;
	directory: string;
	startTime: Date;

	onExit: (data?: any) => void;

	logs: { type: "log" | "warning" | "error"; text: string }[];
}

interface WorkerStore {
	worker: Worker;
	totalPrograms: number;

	id: number;
	name: string;
	lock: boolean;

	sendMessage<T = any>(intent: string, data?: any): Promise<T>;
	emit(event: string, data?: any): void;
	exit(): void;
}

// Source - https://stackoverflow.com/a/26603875
// Posted by Stefan Steiger, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-05, License - CC BY-SA 4.0

export function toBase64(txt: string) {
	// TextEncoder: Always UTF8
	const uint8Array = new TextEncoder().encode(txt);
	let binary = "";

	for (let i = 0; i < uint8Array.length; ++i)
		binary += String.fromCharCode(uint8Array[i]);

	return btoa(binary);
}

export default class Runtime {
	#log: (message: string) => void;
	#warn: (message: string) => void;
	#error: (message: string) => void;

	#workerLog: (origin: string, message: string) => void;
	#workerWarn: (origin: string, message: string) => void;
	#workerError: (origin: string, message: string) => void;

	#panic: (message: Error) => void;
	#kernel: Constellation;
	#fs: FilesystemInterface;

	targetWorkers: number = 3;
	#workers: WorkerStore[];

	constructor(
		kernel: Constellation,

		log: (origin: string, message: string) => void,
		warn: (origin: string, message: string) => void,
		error: (origin: string, message: string) => void,

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

	#sessions: Session[];
	#initSession!: Session;
	#sessionByID(id: number) {
		const index = this.#sessions.map((program) => program.id).indexOf(id);

		if (index == -1) {
			console.trace("here!");
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
			const { sendMessage, handle, emit } =
				mainThreadMessageHandler(worker);

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
					const program = this.#sessionByID(pid);

					program.logs.push({ type: "log", text: data });

					const hasDisplay = this.#kernel.ui.controller == program;
					if (hasDisplay) {
						this.#workerLog(workerName, data);
					} else {
						this.#log(`${workerName} ${data}`);
					}
				}
			);
			handle(
				"program_warn",
				({ data, pid }: { data: string; pid: number }) => {
					const program = this.#sessionByID(pid);

					program.logs.push({ type: "warning", text: data });

					const hasDisplay = this.#kernel.ui.controller == program;
					if (hasDisplay) {
						this.#workerWarn(workerName, data);
					} else {
						this.#log(`${workerName} ${data}`);
					}
				}
			);
			handle(
				"program_error",
				({ data, pid }: { data: string; pid: number }) => {
					const program = this.#sessionByID(pid);

					program.logs.push({ type: "error", text: data });

					const hasDisplay = this.#kernel.ui.controller == program;
					if (hasDisplay) {
						this.#workerError(workerName, data);
					} else {
						this.#log(`${workerName} ${data}`);
					}
				}
			);

			handle(
				"env_exec",
				async ({
					path,
					args,
					handoverDisplayPid: executingProgramPid,
					workingDirectory,
					pid
				}: {
					path: string;
					args?: string[];
					handoverDisplayPid?: number;
					workingDirectory: string;
					pid: number;
				}) => {
					const parent = this.#sessionByID(pid);

					const program = await this.executeProgram(
						path,
						parent,
						args,
						{
							displayHandover: { oldOwner: executingProgramPid },
							workingDirectory
						}
					);

					return { pid: program.id };
				}
			);

			function sessionToProgram(session: Session): Process {
				return {
					pid: session.id,
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
				const program = this.#sessionByID(pid);

				const parent = program.parent;
				if (!parent) return undefined;

				return sessionToProgram(parent);
			});

			handle(
				"env_network_get",
				async ({
					url,
					format
				}: {
					url: string;
					format: "text" | "json";
				}) => {
					return await (await fetch(url))[format]();
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
					keepInput = false
				}: {
					pid: number;
					message: string;
					conceal: boolean;
					keepInput: boolean;
				}) => {
					const program = this.#sessionByID(pid);
					if (this.#kernel.ui.controller !== program) {
						throw new Error(
							"Program requires display access to request input."
						);
					}

					const { response, displayText } =
						await this.#kernel.ui.input(
							message,
							conceal,
							keepInput
						);
					program.logs.push({ type: "log", text: displayText });

					return response;
				}
			);

			handle("env_clear_logs", ({ pid }: { pid: number }) => {
				const program = this.#sessionByID(pid);

				program.logs = [];

				if (this.#kernel.ui.controller == program) {
					this.#kernel.ui.clear();
				}
			});

			handle("kernel_uptime", () => {
				return 0;
			});
			handle("kernel_version", () => 1);

			const workerStore: WorkerStore = {
				worker,
				totalPrograms: 0,

				id: workerID,
				name: workerName,
				lock: false,

				sendMessage,
				emit,

				exit: () => {
					this.#log(`Terminating worker #${workerStore.id}`);

					workerStore.worker.terminate();

					this.#workers = this.#workers.filter(
						(item) => item !== workerStore
					);
				}
			};
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

	#controllerStack: Session[] = [];
	#handoverDisplay(oldOwner: Session, newOwner: Session) {
		const oldPID = oldOwner.id;

		if (this.#kernel.ui.controller !== oldOwner) {
			throw new Error(
				`Program by PID ${oldPID} attempted to handover display it does not own.`
			);
		}

		// push old owner to stack
		this.#controllerStack.push(oldOwner);

		this.#kernel.ui.controller = newOwner;

		this.#switchLogs(newOwner);
	}

	#switchLogs(program: Session) {
		this.#kernel.ui.clear();

		const workerName = program.worker.name;

		for (const log of program.logs) {
			switch (log.type) {
				case "log":
					this.#workerLog(workerName, log.text);
					break;

				case "warning":
					this.#workerWarn(workerName, log.text);
					break;

				case "error":
					this.#workerError(workerName, log.text);
					break;

				default:
					throw new Error(`Unknown log type: ${log.type}`);
			}
		}
	}

	async execLoop() {
		if (this.#exited) return;

		this.#updateWorkers();

		for (const worker of this.#workers) {
			if (worker.lock) continue;
			worker.lock = true;

			const { programs, completePrograms } = await worker.sendMessage<{
				programs: {
					pid: number;
					directory: string;
				}[];
				completePrograms: { pid: number }[];
			}>("execLoop");

			worker.totalPrograms -= completePrograms.length;

			if (worker.totalPrograms !== programs.length) {
				this.#panic(
					new Error(
						`Internal knowledge of total programs does not match that of worker#${worker.id}'s report (worker#${worker.id} stated ${programs.length}, runtime expected ${worker.totalPrograms})`
					)
				);
			}

			worker.lock = false;
		}
	}

	async executeProgram(
		directory: string,
		parent?: Session,
		args?: string[],
		config?: {
			displayHandover?: { oldOwner?: number };
			workingDirectory: string;
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

		const program: Session = {
			worker: worker,

			parent,
			children: [],

			directory,
			id: pid,
			startTime: new Date(),

			onExit: (data?: any) => {
				this.#workers.forEach((store) => {
					store.emit("program_exit", {
						pid: program.id,
						data,
						logs: program.logs.map((item) => item.text)
					});
				});
			},

			logs: []
		};

		let oldDisplayOwner: Session | undefined;

		if (this.#kernel.ui.controller == undefined) {
			this.#kernel.ui.controller = program;
		} else if (config?.displayHandover?.oldOwner) {
			oldDisplayOwner = this.#sessionByID(
				config?.displayHandover?.oldOwner
			);

			this.#handoverDisplay(oldDisplayOwner, program);
		}

		const ok = await worker.sendMessage("executeProgram", {
			directory,
			pid,
			args,
			workingDirectory: config?.workingDirectory ?? "/"
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

		if (this.#initSession == undefined) this.#initSession = program;

		if (parent) parent.children.push(program);
		this.#sessions.push(program);

		return program;
	}

	#registerTermination(pid: number, data?: any) {
		const id = this.#sessions.map((item) => item.id).indexOf(pid);
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

// Source - https://stackoverflow.com/a/77602420
// Posted by timkay
// Retrieved 2026-03-05, License - CC BY-SA 4.0
// I added the name parameter.
function newWorker(fn: Function, name?: string, ...params: any[]) {
	return new Worker(
		URL.createObjectURL(
			new Blob(
				[
					`(${fn.toString()})(${params.map((item) => JSON.stringify(item))})`
				],
				{ type: "application/javascript" }
			)
		),
		{ name, type: "module" }
	);
}
