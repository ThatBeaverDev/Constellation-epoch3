import { EnvironmentFilesystem, FileStats } from "@/types/worker";
import { WorkerMessageIntent } from "../types/intents";
import { WorkerMessageMap } from "../types/messages";

export class WorkerFS implements EnvironmentFilesystem {
	ready = true;
	waitForReady(): Promise<void> {
		return new Promise((resolve) => resolve());
	}
	#sendMessage: <Intent extends WorkerMessageIntent>(
		intent: Intent,
		data: WorkerMessageMap[Intent]["data"]
	) => Promise<WorkerMessageMap[Intent]["return"]>;

	constructor(
		sendMessage: <Intent extends WorkerMessageIntent>(
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

		return await this.#sendMessage(WorkerMessageIntent.fs_readFile, {
			path,
			format
		});
	}
	async writeFile(path: string, contents: string) {
		if (typeof path !== "string") throw new Error("Path must be string");
		if (typeof contents !== "string")
			throw new Error("Contents must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_writeFile, {
			path,
			contents
		});
	}
	async unlink(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_unlink, { path });
	}

	async getMetadataEntry(path: string, entry: string) {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(
			WorkerMessageIntent.fs_get_metadata_entry,
			{
				path,
				entry
			}
		);
	}
	async listMetadataEntries(path: string) {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(
			WorkerMessageIntent.fs_list_metadata_entries,
			{ path }
		);
	}
	async setMetadataEntry(
		path: string,
		entry: string,
		value: string | undefined
	) {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(
			WorkerMessageIntent.fs_set_metadata_entry,
			{
				path,
				entry,
				value
			}
		);
	}

	async mkdir(
		path: string,
		options?: { recursive?: boolean }
	): Promise<boolean> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_mkdir, {
			path,
			options
		});
	}

	async createAlias(path: string, targetPath: string): Promise<boolean> {
		if (typeof path !== "string") throw new Error("Path must be string");

		if (typeof targetPath !== "string")
			throw new Error("Target path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_createAlias, {
			path,
			targetPath
		});
	}

	async readdir(path: string): Promise<string[]> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_readdir, {
			path
		});
	}
	async rmdir(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_rmdir, { path });
	}

	async rm(path: string): Promise<void> {
		if (typeof path !== "string") throw new Error("Path must be string");

		return await this.#sendMessage(WorkerMessageIntent.fs_rm, { path });
	}

	async isDirectory(path: string): Promise<boolean> {
		return await this.#sendMessage(WorkerMessageIntent.fs_isdir, { path });
	}

	async exists(path: string): Promise<boolean> {
		return await this.#sendMessage(WorkerMessageIntent.fs_exists, { path });
	}

	async stats(path: string): Promise<FileStats | undefined> {
		return await this.#sendMessage(WorkerMessageIntent.fs_stats, { path });
	}
}
