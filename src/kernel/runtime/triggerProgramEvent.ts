import { EventMap, EventName } from "@/types/worker";
import { ProgramStore } from "./types";
import { RuntimeMessageIntent } from "../types/intents";

export async function triggerProgramEvent<K extends EventName>(
	program: ProgramStore,
	name: K,
	data: EventMap[K]
) {
	return await program.worker.sendMessage(
		RuntimeMessageIntent.trigger_event,
		{
			pid: program.pid,
			name,
			data
		}
	);
}
