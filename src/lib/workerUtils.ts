import { WorkerStore } from "../runtime";
import { FilesystemInterface } from "./fs";

type WorkerRequest = {
	kind: "request";
	id: number;
	intent: string;
	data?: any;
};

type WorkerResponse = {
	kind: "response";
	id: number;
	success: boolean;
	result?: any;
	error?: string;
};

type WorkerEvent = {
	kind: "event";
	event: string;
	data?: any;
};

type WorkerMessage = WorkerRequest | WorkerResponse | WorkerEvent;

type Pending = {
	resolve: (v: any) => void;
	reject: (e: any) => void;
};

type RequestHandler = (data: any) => Promise<any> | any;

export function mainThreadMessageHandler(worker: Worker, store: WorkerStore) {
	let nextMessageID = 1;

	const pendingMessages = new Map<number, Pending>();
	const requestHandlers = new Map<string, RequestHandler>();

	worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
		const msg = event.data;
		store.lastKeepAlive = Date.now();

		// ---------- RESPONSE ----------
		if (msg.kind === "response") {
			const pending = pendingMessages.get(msg.id);
			if (!pending) return;

			pendingMessages.delete(msg.id);

			if (msg.success) pending.resolve(msg.result);
			else pending.reject(new Error(msg.error ?? "Unknown error"));

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
				const result = await handler(msg.data);

				worker.postMessage({
					kind: "response",
					id: msg.id,
					success: true,
					result
				});
			} catch (err: any) {
				worker.postMessage({
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

			listener(msg.data);
		}
	};

	function sendMessage(intent: string, data?: any): Promise<any> {
		const id = nextMessageID++;

		return new Promise((resolve, reject) => {
			pendingMessages.set(id, { resolve, reject });

			worker.postMessage({
				kind: "request",
				id,
				intent,
				data
			});
		});
	}

	function emit(event: string, data?: any) {
		worker.postMessage({
			kind: "event",
			event,
			data
		});
	}

	function handle(intent: string, handler: RequestHandler) {
		requestHandlers.set(intent, handler);
	}

	return {
		sendMessage,
		emit,
		handle
	};
}

export function implementWorkerFS(
	handle: (intent: string, handler: RequestHandler) => void,
	fs: FilesystemInterface
) {
	handle(
		"fs_readFile",
		async ({
			path,
			format
		}: {
			path: string;
			format?: "text" | "json";
		}) => {
			return await fs.readFile(path, format);
		}
	);
	handle(
		"fs_writeFile",
		async ({ path, contents }: { path: string; contents: string }) => {
			return await fs.writeFile(path, contents);
		}
	);
	handle("fs_unlink", async ({ path }: { path: string }) => {
		return await fs.unlink(path);
	});

	handle("fs_mkdir", async ({ path }: { path: string }) => {
		return await fs.mkdir(path);
	});
	handle("fs_readdir", async ({ path }: { path: string }) => {
		return await fs.readdir(path);
	});
	handle("fs_rmdir", async ({ path }: { path: string }) => {
		return await fs.rmdir(path);
	});

	handle("fs_rm", async ({ path }: { path: string }) => {
		return await fs.rm(path);
	});

	handle("fs_isdir", async ({ path }: { path: string }) => {
		return await fs.isDir(path);
	});

	handle("fs_exists", async ({ path }: { path: string }) => {
		return await fs.exists(path);
	});
}
