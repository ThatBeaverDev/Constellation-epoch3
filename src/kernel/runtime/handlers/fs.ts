import { User } from "@/types/worker";
import { RequestHandler } from "../../../shared/messages";
import { WorkerMessageIntent } from "../../../worker/types/intents";
import { WorkerMessageMap } from "../../../worker/types/messages";
import { FilesystemInterface } from "../../fs/fs";
import { tryReadFile, tryWriteFile } from "../../security/permissions";
import UsersManager from "../../security/users";
import { writeMessage } from "sync-message";
import {
	SyncReaddirResponse,
	SyncReadFileResponse,
	SyncStatResponse,
	WorkerStore
} from "../types";

export function implementWorkerFS(
	handle: <Intent extends keyof WorkerMessageMap>(
		event: Intent,
		handler: RequestHandler<
			WorkerMessageMap[Intent]["data"],
			WorkerMessageMap[Intent]["return"]
		>
	) => void,
	workerStore: WorkerStore,
	fs: FilesystemInterface,
	users: UsersManager,
	getUser: () => User,
	reroot: (path: string) => string
) {
	handle(WorkerMessageIntent.fs_readFile, async ({ path, format }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.readFile(path, format);
	});
	handle(WorkerMessageIntent.fs_writeFile, async ({ path, contents }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.writeFile(path, contents);
	});
	handle(WorkerMessageIntent.fs_unlink, async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.unlink(path);
	});

	handle(
		WorkerMessageIntent.fs_get_metadata_entry,
		async ({ path, entry }) => {
			return await fs.getMetadataEntry(path, entry);
		}
	);
	handle(
		WorkerMessageIntent.fs_set_metadata_entry,
		async ({ path, entry, value }) => {
			return await fs.setMetadataEntry(path, entry, value);
		}
	);
	handle(WorkerMessageIntent.fs_list_metadata_entries, async ({ path }) => {
		return await fs.listMetadataEntries(path);
	});

	handle(WorkerMessageIntent.fs_mkdir, async ({ path, options }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		if (options?.recursive) {
			const parts = path.split("/").filter((item) => item.trim() !== "");

			let workingPath = "/";
			for (const part of parts) {
				workingPath += part + "/";
				await fs.mkdir(workingPath);
			}

			return true;
		} else return await fs.mkdir(path);
	});
	handle(WorkerMessageIntent.fs_createAlias, async ({ path, targetPath }) => {
		path = reroot(path);
		return await fs.createAlias(path, targetPath);
	});
	handle(WorkerMessageIntent.fs_readdir, async ({ path }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.readdir(path);
	});
	handle(WorkerMessageIntent.fs_rmdir, async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.rmdir(path);
	});

	handle(WorkerMessageIntent.fs_rm, async ({ path }) => {
		path = reroot(path);
		await tryWriteFile(path, users, getUser());

		return await fs.rm(path);
	});

	handle(WorkerMessageIntent.fs_isdir, async ({ path }) => {
		path = reroot(path);
		return await fs.isDir(path);
	});

	handle(WorkerMessageIntent.fs_exists, async ({ path }) => {
		path = reroot(path);
		return await fs.exists(path);
	});

	handle(WorkerMessageIntent.fs_stats, async ({ path }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		return await fs.stats(path);
	});

	handle(WorkerMessageIntent.fs_read_sync, async ({ path, messageId }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		const contents = await fs.readFile(path);

		const message: SyncReadFileResponse = { contents };

		writeMessage(workerStore.atomicChannel, message, messageId);
	});

	handle(WorkerMessageIntent.fs_readdir_sync, async ({ path, messageId }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		const contents = await fs.readdir(path);

		const message: SyncReaddirResponse = { contents };

		writeMessage(workerStore.atomicChannel, message, messageId);
	});

	handle(WorkerMessageIntent.fs_stat_sync, async ({ path, messageId }) => {
		path = reroot(path);
		await tryReadFile(path, users, getUser());

		const stats = await fs.stats(path);

		const message: SyncStatResponse = { stats };

		writeMessage(workerStore.atomicChannel, message, messageId);
	});
}
