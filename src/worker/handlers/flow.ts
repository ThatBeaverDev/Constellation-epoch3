import { ConstellationProgram, WorkerProgramStore } from "@/types/worker";
import { ConstellationWorker } from "../worker";
import { workerMessageHandler } from "./handler";
import { RuntimeMessageIntent } from "../../kernel/types/intents";
import { blobToUrl } from "@/lib/uri";
import { newEnv } from "../env";

export function handleFlow(
	handle: Awaited<ReturnType<typeof workerMessageHandler>>["handle"],
	worker: ConstellationWorker
) {
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
			store.env = newEnv(worker, store, workingDirectory);

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

			worker.programs.push(store);

			return true;
		}
	);

	handle(RuntimeMessageIntent.dispatch_frame, () => {
		worker.programs.forEach(async (program) => {
			if (program.locked) return;
			program.locked = true;

			try {
				if (!program.generator) {
					worker.terminateProgram(program, "");
					return;
				}

				const result = await program.generator.next(program.passValue);
				program.passValue = undefined;

				if (result.done) {
					worker.terminateProgram(program, result.value);
				} else {
					// result.value is a regular value, pass it next time
					program.passValue = result.value;
				}
			} catch (err) {
				console.error(`Program ${program.pid} failed:`, err);

				// kill it.
				worker.terminateProgram(program, [
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

		const programsData = worker.programs.map((item) => ({
			pid: item.pid,
			directory: item.directory
		}));

		const result = {
			programs: programsData,
			completePrograms: worker.completedQueue.splice(0)
		};

		return result;
	});

	handle(RuntimeMessageIntent.program_exit_inform, ({ pid, data, logs }) => {
		const program = worker.activePrograms[pid];
		if (program) {
			program.resolve({ return: data, logs: logs });
			delete worker.activePrograms[pid];
		}
	});
}
