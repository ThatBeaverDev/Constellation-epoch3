import { ConstellationWorker } from "../worker";
import { workerMessageHandler } from "./handler";
import { RuntimeMessageIntent } from "../../kernel/types/intents";

export function handleInputOutput(
	handle: Awaited<ReturnType<typeof workerMessageHandler>>["handle"],
	worker: ConstellationWorker
) {
	// events
	handle(RuntimeMessageIntent.trigger_event, (packet) => {
		const program = worker.programByPid(packet.pid);

		program.env.triggerEvent(packet.name, packet.data);
	});

	// output proxies
	handle(RuntimeMessageIntent.proxy_log, (packet) => {
		const program = worker.programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onLog(packet.log.type, packet.log.data);
	});

	handle(RuntimeMessageIntent.proxy_input, async (packet) => {
		const program = worker.programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return { finished: false };

		return {
			finished: true,
			response: await handler.onInput(packet.message, packet.config)
		};
	});

	handle(RuntimeMessageIntent.proxy_set_logs, (packet) => {
		const program = worker.programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onSetLogs(packet.logs);
	});

	handle(RuntimeMessageIntent.proxy_get_dimensions, (packet) => {
		const program = worker.programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		return handler.getDimensions();
	});
}
