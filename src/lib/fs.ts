import Constellation from "../index";
import { deleteFS } from "./config";

/**
 * An interface to access a Filesystem.
 */
export interface FilesystemInterface {
	ready: boolean;
	waitForReady(): Promise<void>;

	init?(): Promise<void> | void;

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
	isDir(path: string): boolean;

	/**
	 * Determines whether the given path contains a file OR directory
	 * @param path Path to check
	 */
	exists(path: string): boolean;
}

interface DomFsFile {
	/**
	 * Store ID for the file contents
	 */
	store: number;

	/**
	 * Filesize in characters
	 */
	size: number;

	/**
	 * UNIX timestamp for when the file was created.
	 */
	creation: number;
	/**
	 * UNIX timestamp for when the file was last modified.
	 */
	modified: number;

	/**
	 * The type of the entry.
	 */
	type: "file" | "directory";
}

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
	#panic: Constellation["panic"];

	#index: Record<string, DomFsFile> = {};
	#db?: IDBDatabase;

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

	constructor(panic: Constellation["panic"]) {
		this.#panic = panic;
	}

	/* ================================
	   INITIALISATION
	================================ */

	async init() {
		if (deleteFS) {
			console.log("Erasing old DomFs...");
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
						console.log("Database deleted successfully");
						resolve();
					};
				});
			});
			await Promise.all(promises);
		}

		const request = indexedDB.open("fs", 1);

		request.onerror = () => {
			this.#panic("fs", new Error("Failed to open IndexedDB"));
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			if (!db.objectStoreNames.contains("files")) {
				db.createObjectStore("files", {
					keyPath: "id",
					autoIncrement: true
				});
			}

			if (!db.objectStoreNames.contains("index")) {
				db.createObjectStore("index", {
					keyPath: "path"
				});
			}
		};

		request.onsuccess = async () => {
			this.#db = request.result;
			await this.#loadIndex();
		};
	}

	async #loadIndex() {
		if (!this.#db) return;

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

		// Ensure root directory exists
		if (!this.#index["/"]) {
			const now = Date.now();

			const root: DomFsFile = {
				store: -1,
				size: 0,
				creation: now,
				modified: now,
				type: "directory"
			};

			const transaction2 = this.#db.transaction("index", "readwrite");
			transaction2.objectStore("index").put({
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

		const transactioon = this.#db!.transaction("index", "readwrite");
		transactioon.objectStore("index").put({ path, entry });

		this.#index[path] = entry;
		return true;
	}

	async readdir(path: string): Promise<string[]> {
		path = normalise(path);

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
	}

	/* ================================
	   FILE OPERATIONS
	================================ */

	async readFile<T extends Object = Object>(
		path: string,
		format: "text" | "json" = "text"
	): Promise<string | T | undefined> {
		path = normalise(path);

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
			if (existing.type === "directory")
				throw new Error("Cannot write to directory");

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

		this.#index[path] = entry;
	}

	async unlink(path: string) {
		path = normalise(path);

		const entry = this.#index[path];
		if (!entry || entry.type !== "file") return;

		const transaction = this.#db!.transaction(
			["files", "index"],
			"readwrite"
		);

		transaction.objectStore("files").delete(entry.store);
		transaction.objectStore("index").delete(path);

		delete this.#index[path];
	}

	async rm(path: string) {
		path = normalise(path);

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

	isDir(path: string): boolean {
		path = normalise(path);

		if (path === "/") return true;

		const dir = this.#index[path];
		if (!dir || dir.type !== "directory") return false;

		return true;
	}

	exists(path: string) {
		path = normalise(path);

		if (path === "/") return true;

		const fileEntry = this.#index[path];
		return fileEntry !== undefined;
	}
}

/*class NodeFs implements FilesystemInterface {
	#log: UiManager["log"];
	#panic: Constellation["panic"];
	ready = false;
	waitForReady() {
		return new Promise<void>((resolve) => {
			setInterval(() => {
				if (this.ready) {
					resolve();
				}
			}, 2);
		});
	}

	constructor(log: (message: string) => void, panic: Constellation["panic"]) {
		this.#log = log;
		this.#panic = panic;

		log("Initialising NodeFs...");
	}

	async readFile(directory: string) {}

	async writeFile(directory: string, contents: string) {}
}

const Fs: new (
	log: (message: string) => void,
	panic: Constellation["panic"]
) => FilesystemInterface = env == "web" ? DomFs : NodeFs;
export default Fs;*/
export default DomFs;
