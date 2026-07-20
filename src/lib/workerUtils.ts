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
import { User } from "../util/types/worker";
import { nodeJs } from "./config";
import { FilesystemInterface } from "./fs";
import { tryReadFile, tryWriteFile } from "./permissions";
import UsersManager from "./users";

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
	errorName: string;
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
				pendingMessages.set(id, { resolve, reject });

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
	fs: FilesystemInterface,
	users: UsersManager,
	getUser: () => User
) {
	function reroot(path: string) {
		const user = getUser();

		if (path[0] == "/") {
			return user.home + path;
		} else {
			return user.home + "/" + path;
		}
	}

	handle("fs_readFile", async ({ path, format }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.readFile(path, format);
	});
	handle("fs_writeFile", async ({ path, contents }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.writeFile(path, contents);
	});
	handle("fs_unlink", async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.unlink(path);
	});

	handle("fs_mkdir", async ({ path, options }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

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
		path = reroot(path);
		return await fs.createAlias(path, targetPath);
	});
	handle("fs_readdir", async ({ path }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.readdir(path);
	});
	handle("fs_rmdir", async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.rmdir(path);
	});

	handle("fs_rm", async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.rm(path);
	});

	handle("fs_isdir", async ({ path }) => {
		path = reroot(path);
		return await fs.isDir(path);
	});

	handle("fs_exists", async ({ path }) => {
		path = reroot(path);
		return await fs.exists(path);
	});

	handle("fs_stats", async ({ path }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.stats(path);
	});
}
