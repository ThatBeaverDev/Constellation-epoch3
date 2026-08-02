import { RuntimeMessageIntent } from "../../kernel/types/intents";
import { RuntimeMessageMap } from "../../kernel/types/messages";
import { Message, Pending, RequestHandler } from "../../shared/messages";
import { WorkerMessageIntent } from "../types/intents";
import { WorkerMessageMap } from "../types/messages";

export async function workerMessageHandler() {
	let nextMessageID = 1;

	const isNode = typeof process !== "undefined";

	let postMessage: (typeof globalThis)["postMessage"];

	if (isNode) {
		// @ts-expect-error
		const parentPort = (await import("node:worker_threads")).parentPort;

		postMessage = parentPort.postMessage.bind(parentPort);
	} else {
		postMessage = globalThis.postMessage;
	}

	globalThis.postMessage = () => {};

	const pendingMessages = new Map<number, Pending>();
	const requestHandlers = new Map<string | number, RequestHandler>();

	const onRecievedMessage = async (msg: Message) => {
		// ---------- RESPONSE ----------
		if (msg.kind === "response") {
			const pending = pendingMessages.get(msg.id);
			if (!pending) return;

			pendingMessages.delete(msg.id);

			if (msg.success) pending.resolve(msg.result);
			else
				pending.reject(
					new Error(
						`${pending.intent}     ${msg.error ?? "Unknown error"}`
					)
				);

			return;
		}

		// ---------- REQUEST ----------
		if (msg.kind === "request") {
			const handler = requestHandlers.get(msg.intent);

			if (!handler) {
				postMessage({
					kind: "response",
					id: msg.id,
					success: false,
					error: `No handler for ${msg.intent}`
				});
				return;
			}

			try {
				const result = await handler(msg.data);

				postMessage({
					kind: "response",
					id: msg.id,
					success: true,
					result
				});
			} catch (err: any) {
				postMessage({
					kind: "response",
					id: msg.id,
					success: false,
					error: err?.message ?? "Unknown error"
				});
			}

			return;
		}

		// ---------- EVENT ----------
		if (msg.kind === "event") {
			const listener = requestHandlers.get(msg.event);
			if (!listener) return;

			try {
				listener(msg.data);
			} catch (e) {
				console.error(
					`Handler in worker of intent ${msg.event} failed:`,
					e
				);
			}
		}
	};

	if (isNode) {
		// node
		// @ts-expect-error
		const { parentPort } = await import("node:worker_threads");
		parentPort.on("message", onRecievedMessage);
	} else {
		// web worker
		globalThis.onmessage = (event) => onRecievedMessage(event.data);
	}

	function sendMessage<Intent extends WorkerMessageIntent>(
		intent: Intent,
		data: WorkerMessageMap[Intent]["data"]
	): Promise<WorkerMessageMap[Intent]["return"]> {
		const id = nextMessageID++;

		return new Promise((resolve, reject) => {
			pendingMessages.set(id, { intent, resolve, reject });

			postMessage({
				kind: "request",
				id,
				intent,
				data
			});
		});
	}

	function emit<Intent extends WorkerMessageIntent>(
		event: Intent,
		data: WorkerMessageMap[Intent]["data"]
	) {
		postMessage({
			kind: "event",
			event,
			data
		});
	}

	function handle<Intent extends RuntimeMessageIntent>(
		event: Intent,
		handler: RequestHandler<
			RuntimeMessageMap[Intent]["data"],
			RuntimeMessageMap[Intent]["return"]
		>
	) {
		requestHandlers.set(event, handler);
	}

	return {
		sendMessage,
		emit,
		handle
	};
}
