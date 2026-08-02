import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "../../../workerUtils";
import { UiManager } from "../../ui/ui";
import Runtime from "../runtime";
import { ProgramStore, RuntimeSoundsStore } from "../types";

export default function handleSounds(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	getProgram: () => ProgramStore,
	reroot: (path: string) => string,
	runtime: Runtime,
	sounds: RuntimeSoundsStore,
	ui: UiManager
) {
	handle(WorkerMessageIntent.play_sound, async ({ config }) => {
		const program = getProgram();
		const sound = await ui.playSound?.(
			"file" in config ? { ...config, file: reroot(config.file) } : config
		);

		const id = runtime.nextSoundID++;

		if (!sound) return { id, duration: 5 };

		sounds.set(id, { info: sound, program });

		sound.onStop.then((time) => {
			// @ts-expect-error
			workerStore.emit(`sound_stopped_${id}`, {
				time
			});

			sounds.delete(id);
		});

		return {
			id,
			duration: sound.duration
		};
	});

	handle(WorkerMessageIntent.pause_sound, async ({ soundID }) => {
		const sound = sounds.get(soundID);

		if (!sound) throw new Error(`Sound ${soundID} does not exist.`);

		sound.info.pause();
	});

	handle(WorkerMessageIntent.resume_sound, async ({ soundID }) => {
		const sound = sounds.get(soundID);

		if (!sound) throw new Error(`Sound ${soundID} does not exist.`);

		sound.info.play();
	});

	handle(WorkerMessageIntent.remove_sound, async ({ soundID }) => {
		const sound = sounds.get(soundID);

		if (!sound) return;

		sound.info.remove();
		sounds.delete(soundID);
	});
}
