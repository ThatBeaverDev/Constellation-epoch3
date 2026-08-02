import { Log, WorkerProgramStore } from "@/types/worker";
import { WorkerFS } from "./lib/fs";
import { WorkerMessageIntent } from "./types/intents";
import applyStringPrototypes from "../shared/strings";
import { workerMessageHandler } from "./handlers/handler";
import { handleSockets } from "./handlers/sockets";
import { handleInputOutput } from "./handlers/io";
import { handleFlow } from "./handlers/flow";

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

export class ConstellationWorker {
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

		// flow
		handleFlow(handle, this);

		// sockets
		handleSockets(handle, this);

		// io
		handleInputOutput(handle, this);

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
