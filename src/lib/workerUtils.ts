import { WorkerStore } from "../runtime";
import {
	RuntimeMessageIntent,
	RuntimeMessageMap
} from "../types/runtimeMessages";
import {
	WorkerMessageDataTypes,
	WorkerMessageIntent,
	WorkerMessageMap
} from "../types/workerMessages";
import { EnvironmentFilesystem, FileStats } from "../util/types/worker";
import { nodeJs } from "./config";
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
	intent: string;

	resolve: (v: any) => void;
	reject: (e: any) => void;
};

type RequestHandler<T = any, K = any> = (data: T) => Promise<K> | K;

export const transferrableMarkerSymbol = Symbol("transfer");
export async function mainThreadMessageHandler(
	worker: Worker,
	store: WorkerStore
) {
	let nextMessageID = 1;

	const pendingMessages = new Map<number, Pending>();
	const requestHandlers = new Map<string, RequestHandler>();

	const onMessage = async (msg: WorkerMessage) => {
		store.lastKeepAlive = Date.now();
		if (!msg) return;

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

	if (nodeJs) {
		// @ts-expect-error
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

export function implementWorkerFS(
	handle: <Intent extends keyof WorkerMessageDataTypes>(
		event: Intent,
		handler: RequestHandler<
			WorkerMessageDataTypes[Intent]["data"],
			WorkerMessageDataTypes[Intent]["return"]
		>
	) => void,
	fs: FilesystemInterface
) {
	handle("fs_readFile", async ({ path, format }) => {
		return await fs.readFile(path, format);
	});
	handle("fs_writeFile", async ({ path, contents }) => {
		return await fs.writeFile(path, contents);
	});
	handle("fs_unlink", async ({ path }) => {
		return await fs.unlink(path);
	});

	handle("fs_mkdir", async ({ path, options }) => {
		if (options?.recursive) {
			const parts = path.split("/").filter((item) => item.trim() !== "");

			let workingPath = "/";
			for (const part of parts) {
				workingPath += part;
				const isGood = await fs.mkdir(workingPath);

				if (!isGood)
					throw new Error(
						"Failed to create part of recursive directory"
					);
			}

			return true;
		} else return await fs.mkdir(path);
	});
	handle("fs_createAlias", async ({ path, targetPath }) => {
		return await fs.createAlias(path, targetPath);
	});
	handle("fs_readdir", async ({ path }) => {
		return await fs.readdir(path);
	});
	handle("fs_rmdir", async ({ path }) => {
		return await fs.rmdir(path);
	});

	handle("fs_rm", async ({ path }) => {
		return await fs.rm(path);
	});

	handle("fs_isdir", async ({ path }) => {
		return await fs.isDir(path);
	});

	handle("fs_exists", async ({ path }) => {
		return await fs.exists(path);
	});

	handle("fs_stats", async ({ path }) => {
		return await fs.stats(path);
	});
}

export async function workerMessageHandler() {
	let nextMessageID = 1;

	// @ts-expect-error
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
	const requestHandlers = new Map<string, RequestHandler>();

	const onRecievedMessage = async (msg: WorkerMessage) => {
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

export class WorkerFS implements EnvironmentFilesystem {
	ready = true;
	waitForReady(): Promise<void> {
		return new Promise((resolve) => resolve());
	}
	#sendMessage: <Intent extends keyof WorkerMessageDataTypes>(
		intent: Intent,
		data: WorkerMessageMap[Intent]["data"]
	) => Promise<WorkerMessageMap[Intent]["return"]>;

	constructor(
		sendMessage: <Intent extends keyof WorkerMessageDataTypes>(
			intent: Intent,
			data: WorkerMessageMap[Intent]["data"]
		) => Promise<WorkerMessageMap[Intent]["return"]>
	) {
		this.#sendMessage = sendMessage;
	}

	readFile(path: string): Promise<string | void>;
	readFile(path: string, format: "text"): Promise<string | void>;
	readFile<T extends Object = Object>(
		path: string,
		format: "json"
	): Promise<T | void>;
	async readFile<T extends Object = Object>(
		path: string,
		format?: "text" | "json"
	): Promise<string | T | void> {
		if (typeof path !== "string") throw new Error("Path must be string");
		if (!["text", "json", undefined].includes(format))
			throw new Error("Format must be 'text', 'json' or blank.");

		return await this.#sendMessage("fs_readFile", { path, format });
	}
	async writeFile(path: string, contents: string) {
		if (typeof path !== "string") throw new Error("Path must be string");
		if (typeof contents !== "string")
			throw new Error("Contents must be string");

		return await this.#sendMessage("fs_writeFile", { path, contents });
	}
	async unlink(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage("fs_unlink", { path });
	}

	async mkdir(
		path: string,
		options?: { recursive?: boolean }
	): Promise<boolean> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage("fs_mkdir", { path, options });
	}

	async createAlias(path: string, targetPath: string): Promise<boolean> {
		if (typeof path !== "string") throw new Error("Path must be string");

		if (typeof targetPath !== "string")
			throw new Error("Target path must be string");

		return await this.#sendMessage("fs_createAlias", {
			path,
			targetPath
		});
	}

	async readdir(path: string): Promise<string[]> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage("fs_readdir", { path });
	}
	async rmdir(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage("fs_rmdir", { path });
	}

	async rm(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage("fs_rm", { path });
	}

	async isDirectory(path: string): Promise<boolean> {
		return await this.#sendMessage("fs_isdir", { path });
	}

	async exists(path: string): Promise<boolean> {
		return await this.#sendMessage("fs_exists", { path });
	}

	async stats(path: string): Promise<FileStats | undefined> {
		return await this.#sendMessage("fs_stats", { path });
	}
}
