import { EventMap, EventName } from "@/types/worker";
import { ProgramStore } from "./types";

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
