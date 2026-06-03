import Constellation from "../index";
import { deleteFS } from "./config";
import SocketManager from "./sockets";
import { FileStats, Log } from "../util/types/worker";

/**
 * An interface to access a Filesystem.
 */
export interface FilesystemInterface {
	ready: boolean;
	waitForReady(): Promise<void>;
	socketManager?: SocketManager;

	init?(): Promise<void> | void;

	registerSocket(directory: string, socketId: number): void;

	/**
	 * Reads contents from a file
	 * @param path The file to read from
	 */
	readFile(path: string): Promise<string | void>;
	readFile(path: string, format: "text"): Promise<string | void>;
	readFile<T extends Object = Object>(
		path: string,
		format: "json"
	): Promise<T | void>;
	readFile<T extends Object = Object>(
		path: string,
		format?: "text" | "json"
	): Promise<string | T | void>;
	/**
	 * Writes contents to a file
	 * @param path File to write to
	 * @param contents Contents to write to the file
	 */
	writeFile(path: string, contents: string): Promise<void>;
	/**
	 * Deletes a file
	 * @param path File to delete
	 */
	unlink(path: string): Promise<void>;

	/**
	 * Creates a directory, dependent on the parent's existence.
	 * @param path Directory to create
	 */
	mkdir(path: string): Promise<boolean>;
	/**
	 * Lists the contents of a directory.
	 * @param path Directory to read
	 */
	readdir(path: string): Promise<string[]>;
	/**
	 * Deletes a directory if empty
	 * @param path Directory to delete
	 */
	rmdir(path: string): Promise<void>;

	/**
	 * Deletes a directory recursively or file, intelligently.
	 * @param path Location to delete
	 */
	rm(path: string): Promise<void>;

	/**
	 * Determines whether a given path is a directory
	 * @param path Path to check
	 */
	isDir(path: string): Promise<boolean>;

	/**
	 * Determines whether the given path contains a file OR directory
	 * @param path Path to check
	 */
	exists(path: string): Promise<boolean>;

	/**
	 * Provides stats about a file, such as type and size.
	 * @param path Path to retrieve stats of
	 */
	stats(path: string): Promise<FileStats | undefined>;
}

interface DomFsFile {
	store: number;
	size: number;
	creation: number;
	modified: number;
	type: "file" | "directory";
}

interface DomFsSocket {
	socketId: number;
	creation: number;
	modified: number;
	type: "socket";
}

type FilesystemStore = DomFsFile | DomFsSocket;

export function normalise(path: string): string {
	if (path == undefined) {
		throw new Error("Path must not be undefined.");
	}

	const chars = path.split("");
	let result = "";
	let lastCharWasSlash = false;

	for (const char of chars) {
		if (char == "/") {
			if (lastCharWasSlash) {
				// don't append
			} else {
				// append it
				result += char;
				lastCharWasSlash = true;
			}
		} else {
			lastCharWasSlash = false;
			result += char;
		}
	}

	if (!result.startsWith("/")) result = "/" + result;
	if (result.length > 1 && result.endsWith("/")) result = result.slice(0, -1);

	return result;
}

export function parent(path: string): string {
	path = normalise(path);
	if (path === "/") return "/";
	return path.substring(0, path.lastIndexOf("/")) || "/";
}

export function basename(path: string): string {
	path = normalise(path);
	return path.substring(path.lastIndexOf("/") + 1);
}

class DomFs implements FilesystemInterface {
	#log: (message: Log) => void;
	#panic: Constellation["panic"];
	socketManager?: SocketManager;

	#index: Record<string, FilesystemStore> = {};
	#db?: IDBDatabase;

	// tab-across syncronisation
	#sync = new BroadcastChannel("domfs-sync");
	#indexLoaded = false;

	get ready() {
		return Boolean(this.#db);
	}

	waitForReady() {
		return new Promise<void>((resolve) => {
			let interval = setInterval(() => {
				if (this.ready) {
					clearInterval(interval);
					resolve();
				}
			}, 50);
		});
	}

	constructor(
		log: (message: Log) => void,
		panic: Constellation["panic"],
		socketManager?: SocketManager
	) {
		this.#log = log;
		this.#panic = panic;

		this.socketManager = socketManager;

		this.#sync.onmessage = async () => {
			this.#indexLoaded = false;
			await this.#loadIndex();
		};
	}

	registerSocket(path: string, socketId: number) {
		path = normalise(path);

		const parentDir = parent(path);
		const parentEntry = this.#index[parentDir];

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(
				`Parent directory does not exist (writeFile ${path})`
			);

		const entry: DomFsSocket = {
			type: "socket",
			socketId,

			creation: Date.now(),
			modified: Date.now()
		};

		// no IDB update
		this.#index[path] = entry;
	}

	/* ================================
	   INITIALISATION
	================================ */

	async init() {
		if (deleteFS) {
			this.#log("Erasing old DomFs...");
			const dbs = await indexedDB.databases();
			const promises = dbs.map(() => {
				return new Promise<void>((resolve, reject) => {
					const DBDeleteRequest = indexedDB.deleteDatabase("fs");
					DBDeleteRequest.onerror = () => {
						this.#panic(
							"fs",
							new Error("Error deleting database.")
						);
						reject();
					};
					DBDeleteRequest.onsuccess = () => {
						this.#log("Database deleted successfully");
						resolve();
					};
				});
			});
			await Promise.all(promises);
		}

		this.#log("Opening filesystem from indexedDB...");
		const request = indexedDB.open("fs", 1);

		request.onerror = () => {
			this.#panic("fs", new Error("Failed to open IndexedDB"));
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			if (!db.objectStoreNames.contains("files")) {
				this.#log("Creating files store in indexedDB");
				db.createObjectStore("files", {
					keyPath: "id",
					autoIncrement: true
				});
			}

			if (!db.objectStoreNames.contains("index")) {
				this.#log("Creating index store in indexedDB");
				db.createObjectStore("index", {
					keyPath: "path"
				});
			}
		};

		request.onsuccess = async () => {
			this.#log("Successfully loaded filesystem from indexedDB.");
			this.#db = request.result;
			await this.#loadIndex();
		};
	}

	async #loadIndex(force = false) {
		if (!this.#db) return;

		if (this.#indexLoaded && !force) return;

		this.#index = {};

		const transaction = this.#db.transaction("index", "readonly");

		const store = transaction.objectStore("index");

		await new Promise<void>((resolve) => {
			store.openCursor().onsuccess = (event) => {
				const cursor = (event.target as IDBRequest).result;

				if (!cursor) {
					resolve();
					return;
				}

				this.#index[cursor.key as string] = cursor.value.entry;

				cursor.continue();
			};
		});

		this.#indexLoaded = true;

		if (!this.#index["/"]) {
			const now = Date.now();

			const root: DomFsFile = {
				store: -1,
				size: 0,
				creation: now,
				modified: now,
				type: "directory"
			};

			const transaction = this.#db.transaction("index", "readwrite");

			transaction.objectStore("index").put({
				path: "/",
				entry: root
			});

			this.#index["/"] = root;
		}
	}

	/* ================================
	   DIRECTORY OPERATIONS
	================================ */

	async mkdir(path: string) {
		path = normalise(path);
		await this.#loadIndex();

		if (this.#index[path]) return false;

		const parentDir = parent(path);
		const parentEntry = this.#index[parentDir];

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(`Parent directory does not exist (mkdir ${path})`);

		const now = Date.now();

		const entry: DomFsFile = {
			store: -1,
			size: 0,
			creation: now,
			modified: now,
			type: "directory"
		};

		const transaction = this.#db!.transaction("index", "readwrite");
		transaction.objectStore("index").put({ path, entry });
		this.#sync.postMessage({
			type: "mkdir",
			path
		});

		this.#index[path] = entry;
		return true;
	}

	async readdir(path: string): Promise<string[]> {
		path = normalise(path);
		await this.#loadIndex();

		const dir = this.#index[path];
		if (!dir || dir.type !== "directory")
			throw new Error("Not a directory");

		const results: string[] = [];

		for (const key in this.#index) {
			if (key === path) continue;
			if (parent(key) === path) results.push(basename(key));
		}

		return results;
	}

	async rmdir(path: string) {
		path = normalise(path);
		await this.#loadIndex();

		if (path === "/") throw new Error("Cannot remove root");

		const entry = this.#index[path];
		if (!entry || entry.type !== "directory")
			throw new Error("Not a directory");

		for (const key in this.#index) {
			if (parent(key) === path) throw new Error("Directory not empty");
		}

		const transaction = this.#db!.transaction("index", "readwrite");
		transaction.objectStore("index").delete(path);

		delete this.#index[path];

		this.#sync.postMessage({
			type: "rmdir",
			path
		});
	}

	/* ================================
	   FILE OPERATIONS
	================================ */

	async readFile<T extends Object = Object>(
		path: string,
		format: "text" | "json" = "text"
	): Promise<string | T | undefined> {
		path = normalise(path);
		await this.#loadIndex();

		const file = this.#index[path];
		if (!file || file.type !== "file") return undefined;

		const transaction = this.#db!.transaction("files", "readonly");
		const store = transaction.objectStore("files");

		return new Promise((resolve, reject) => {
			const req = store.get(file.store);

			req.onsuccess = () => {
				const contents: string | void = req.result?.contents;

				if (!contents) {
					resolve(undefined);
					return;
				}

				switch (format) {
					case "text":
						resolve(String(contents));
						break;

					case "json":
						try {
							resolve(JSON.parse(String(contents)));
						} catch (e) {
							reject(`Failed to parse JSON: ${e}`);
						}
						break;

					default:
						throw new Error(
							"Unrecognised readFile format: " + format
						);
				}
			};
			req.onerror = () => reject();
		});
	}

	async writeFile(path: string, contents: string) {
		path = normalise(path);
		await this.#loadIndex();

		const parentDir = parent(path);
		const parentEntry = this.#index[parentDir];

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(
				`Parent directory does not exist (writeFile ${path})`
			);

		const now = Date.now();
		const existing = this.#index[path];

		// MODIFY
		if (existing) {
			if (existing.type !== "file")
				throw new Error(`Cannot write to ${existing.type}`);

			const transaction = this.#db!.transaction(
				["files", "index"],
				"readwrite"
			);

			transaction.objectStore("files").put({
				id: existing.store,
				contents
			});

			const updated: DomFsFile = {
				...existing,
				size: contents.length,
				modified: now
			};

			transaction.objectStore("index").put({ path, entry: updated });

			this.#index[path] = updated;
			this.#sync.postMessage({
				type: "write",
				path
			});
			return;
		}

		// CREATE
		const transaction = this.#db!.transaction(
			["files", "index"],
			"readwrite"
		);

		const fileStore = transaction.objectStore("files");
		const indexStore = transaction.objectStore("index");

		const fileId = await new Promise<number>((resolve, reject) => {
			const req = fileStore.add({ contents });
			req.onsuccess = () => resolve(req.result as number);
			req.onerror = () => reject();
		});

		const entry: DomFsFile = {
			store: fileId,
			size: contents.length,
			creation: now,
			modified: now,
			type: "file"
		};

		indexStore.put({ path, entry });

		this.#sync.postMessage({
			type: "write",
			path
		});

		this.#index[path] = entry;
	}

	async unlink(path: string) {
		path = normalise(path);
		await this.#loadIndex();

		const entry = this.#index[path];
		if (!entry || entry.type !== "file") return;

		const transaction = this.#db!.transaction(
			["files", "index"],
			"readwrite"
		);

		transaction.objectStore("files").delete(entry.store);
		transaction.objectStore("index").delete(path);

		delete this.#index[path];

		this.#sync.postMessage({
			type: "unlink",
			path
		});
	}

	async rm(path: string) {
		path = normalise(path);
		await this.#loadIndex();

		const entry = this.#index[path];
		if (!entry) return;

		if (entry.type === "file") {
			await this.unlink(path);
			return;
		}

		const children = Object.keys(this.#index).filter(
			(p) => parent(p) === path
		);

		for (const child of children) await this.rm(child);

		await this.rmdir(path);
	}

	async isDir(path: string) {
		path = normalise(path);

		await this.#loadIndex();

		if (path === "/") return true;

		return this.#index[path]?.type === "directory";
	}

	async exists(path: string) {
		path = normalise(path);

		await this.#loadIndex();

		if (path === "/") return true;

		return this.#index[path] !== undefined;
	}

	async stats(path: string): Promise<FileStats | undefined> {
		path = normalise(path);

		await this.#loadIndex();

		const entry = this.#index[path];

		if (!entry) return;

		return {
			size: "size" in entry ? entry.size : -1,
			type: entry.type,
			modified: entry.modified,
			created: entry.creation
		};
	}
}

export default DomFs;
