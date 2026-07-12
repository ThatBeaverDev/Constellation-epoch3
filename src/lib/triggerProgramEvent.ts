import { ProgramStore } from "../runtime";
import { EventMap, EventName } from "../util/types/worker";

export async function triggerProgramEvent<K extends EventName>(
	program: ProgramStore,
	name: K,
	data: EventMap[K]
) {
	return await program.worker.sendMessage("event_trigger", {
		pid: program.pid,
		name,
		data
	});
}
