import { Process } from "@/types/worker";
import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "../../../workerUtils";
import Runtime from "../runtime";
import { ProgramStore } from "../types";

export default function handleProcesses(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	getProgram: () => ProgramStore,
	runtime: Runtime
) {
	function sessionToProcess(session: ProgramStore): Process {
		return {
			pid: session.pid,
			name: session.directory.textAfterAll("/"),

			startTime: session.startTime,
			UID: session.user.UID
		};
	}

	handle(WorkerMessageIntent.get_all_processes, () => {
		return runtime.programs.map((session) => sessionToProcess(session));
	});

	handle(WorkerMessageIntent.get_self_process, () => {
		const program = getProgram();

		const store = sessionToProcess(program);

		return store;
	});

	handle(WorkerMessageIntent.get_parent_process, () => {
		const program = getProgram();

		const parent = program.parent;
		if (!parent) return undefined;

		return sessionToProcess(parent);
	});
}
