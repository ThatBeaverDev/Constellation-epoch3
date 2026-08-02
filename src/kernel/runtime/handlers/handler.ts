import { Message, Pending, RequestHandler } from "../../../shared/messages";
import { WorkerMessageIntent } from "../../../worker/types/intents";
import { WorkerMessageMap } from "../../../worker/types/messages";
import { IS_DEV_MODE, IS_NODE } from "../../constants";
import { RuntimeMessageIntent } from "../../types/intents";
import { RuntimeMessageMap } from "../../types/messages";
import { WorkerStore } from "../types";

export const transferrableMarkerSymbol = Symbol("transfer");
export async function mainThreadMessageHandler(
	worker: Worker,
	store: WorkerStore
) {
	let nextMessageID = 1;

	const pendingMessages = new Map<number, Pending>();
	const requestHandlers = new Map<string | number, RequestHandler>();

	const onMessage = async (msg: Message) => {
		store.lastKeepAlive = Date.now();
		if (!msg) return;

		// ---------- RESPONSE ----------
		if (msg.kind === "response") {
			const pending = pendingMessages.get(msg.id);
			if (!pending) return;

			pendingMessages.delete(msg.id);

			if (msg.success) {
				pending.resolve(msg.result);
			} else {
				const error = new Error(msg.error ?? "Unknown error");
				error.name = msg.errorName;

				pending.reject(error);
			}

			return;
		}

		// ---------- REQUEST ----------
		if (msg.kind === "request") {
			const handler = requestHandlers.get(msg.intent);

			if (!handler) {
				worker.postMessage({
					kind: "response",
					id: msg.id,
					success: false,
					error: `No handler for ${msg.intent}`
				});
				return;
			}

			try {
				const raw = await handler(msg.data);

				let result: any = raw;
				let transfer: Transferable[] = [];

				if (
					raw != null &&
					typeof raw === "object" &&
					transferrableMarkerSymbol in raw
				) {
					result = (raw as any).result;
					transfer = (raw as any).transfer;
				}

				worker.postMessage(
					{ kind: "response", id: msg.id, success: true, result },
					transfer
				);
			} catch (err: any) {
				if (IS_DEV_MODE) console.error(err);

				worker.postMessage({
					kind: "response",
					id: msg.id,
					success: false,
					error: err?.message ?? "Unknown error",
					errorName: err?.name ?? "Error"
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
					`Handler in main thread of intent ${msg.event} failed:`,
					e
				);
			}
		}
	};

	if (IS_NODE) {
		worker.on("message", onMessage);
	} else {
		worker.onmessage = (event) => onMessage(event.data);
	}

	function sendMessage<Intent extends RuntimeMessageIntent>(
		intent: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	): Promise<RuntimeMessageMap[Intent]["return"]> {
		const id = nextMessageID++;

		return new Promise<RuntimeMessageMap[Intent]["return"]>(
			(resolve, reject) => {
				pendingMessages.set(id, { intent, resolve, reject });

				worker.postMessage({
					kind: "request",
					id,
					intent: intent,
					data
				});
			}
		);
	}

	function emit<Intent extends RuntimeMessageIntent>(
		event: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	) {
		worker.postMessage({
			kind: "event",
			event,
			data
		});
	}

	function handle<Intent extends WorkerMessageIntent>(
		event: Intent,
		handler: RequestHandler<
			WorkerMessageMap[Intent]["data"],
			WorkerMessageMap[Intent]["return"]
		>
	) {
		requestHandlers.set(event, handler);
	}

	function withTransfer<T>(result: T, transfer: Transferable[]) {
		return { [transferrableMarkerSymbol]: true as const, result, transfer };
	}

	return {
		sendMessage,
		emit,
		handle,
		withTransfer
	};
}
