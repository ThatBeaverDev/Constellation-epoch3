import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "../../../workerUtils";
import { ALLOWED_PROXY_EVENTS } from "../../constants";
import { UiManager } from "../../ui/ui";
import Runtime from "../runtime";
import { triggerProgramEvent } from "../triggerProgramEvent";
import { ProgramStore } from "../types";

export default function handleInputOutput(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	withTransfer: Awaited<
		ReturnType<typeof mainThreadMessageHandler>
	>["withTransfer"],
	getProgram: () => ProgramStore,
	programByPid: Runtime["programByPid"],
	ui: UiManager
) {
	handle(WorkerMessageIntent.log, ({ data }) => {
		const program = getProgram();

		program.onLog("log", data);
	});
	handle(WorkerMessageIntent.warn, ({ data }) => {
		const program = getProgram();

		program.onLog("warning", data);
	});
	handle(WorkerMessageIntent.error, ({ data }) => {
		const program = getProgram();

		program.onLog("error", data);
	});

	handle(
		WorkerMessageIntent.get_input,
		async ({ message = "Messsage not provided.", config }) => {
			const program = getProgram();

			return await program.onInput(message, {
				hideTyping: config.hideTyping,
				leaveInputOnCompletion: config.leaveInputOnCompletion,
				inline: config.inline,
				initialText: config.initialText
			});
		}
	);

	handle(WorkerMessageIntent.set_logs, ({ logs }) => {
		const program = getProgram();

		return program.onSetLogs(logs);
	});

	handle(WorkerMessageIntent.terminal_dimensions, () => {
		const program = getProgram();

		return program.getTerminalDimensions();
	});

	handle(
		WorkerMessageIntent.get_live_canvas,
		// @ts-expect-error // withTransfer explodes the types
		async ({ width, height }) => {
			const liveCanvas = await ui.getLiveCanvas?.(width, height);

			if (!liveCanvas) {
				throw new Error(
					"UI did not provide a canvas element (or does not support liveCanvas)."
				);
			}

			const program = getProgram();
			program.liveCanvasIds.push(liveCanvas.id);

			return withTransfer(liveCanvas, [liveCanvas.canvas]);
		}
	);

	handle(WorkerMessageIntent.remove_live_canvas, ({ id }) => {
		const program = getProgram();

		if (program.liveCanvasIds.includes(id)) {
			// good to go
			ui.removeLiveCanvas?.(id);
		} else {
			throw new Error(`Program does not own liveCanvas#${id}`);
		}
	});

	handle(WorkerMessageIntent.trigger_proxy_event, (msg) => {
		if (ALLOWED_PROXY_EVENTS.has(msg.eventName)) {
			// allowed
			const target = programByPid(msg.subjectPid);

			triggerProgramEvent(target, msg.eventName, msg.data);
		}
	});
}
