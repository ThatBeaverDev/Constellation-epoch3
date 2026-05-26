import { ProgramStore } from "../runtime";
import { Runtime_Events_Trigger } from "../types/runtimeMessages";
import { EventMap, EventName } from "../util/types/worker";

export async function triggerProgramEvent<K extends EventName>(
	program: ProgramStore,
	name: K,
	data: EventMap[K]
) {
	return await program.worker.sendMessage<any, Runtime_Events_Trigger<K>>(
		"event_trigger",
		{
			pid: program.pid,
			name,
			data
		}
	);
}
