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

	registerSocket(directory: string, socketId: number): Promise<void> | void;

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
	 * Reads the contents of a metadata tag from a file
	 * @param path The file to read from
	 * @param entry The metadata tag to read from
	 */
	getMetadataEntry(path: string, entry: string): Promise<string | void>;
	/**
	 * Lists the metadata tags from a file
	 * @param path The file to read from
	 */
	listMetadataEntries(path: string): Promise<string[] | void>;
	/**
	 * Sets the contents of a metadata tag from a file
	 * @param path The file to write to
	 * @param entry The entry to read to
	 * @param value The value to write to the entry
	 */
	setMetadataEntry(
		path: string,
		entry: string,
		value: string | undefined
	): Promise<void>;

	/**
	 * Creates a directory, dependent on the parent's existence.
	 * @param path Directory to create
	 */
	mkdir(path: string): Promise<boolean>;

	createAlias(
		newDirectory: string,
		targetDirectory: string
	): Promise<boolean>;

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

type DomFsMetadata = Partial<Record<string, string>>;

interface BaseDomFsFile {
	metadata?: DomFsMetadata;

	creation: number;
	modified: number;
}

interface DomFsFile extends BaseDomFsFile {
	type: "file";
	store: number;
	size: number;
}

interface DomFsDirectory extends BaseDomFsFile {
	type: "directory";
}

interface DomFsAlias extends BaseDomFsFile {
	type: "alias";
	size: number;
	targetDirectory: string;
}

interface DomFsSocket extends BaseDomFsFile {
	type: "socket";
	socketId: number;
}

interface IDBFile {
	id: number;
	contents: string;
}

type FilesystemStore = DomFsFile | DomFsDirectory | DomFsAlias | DomFsSocket;

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

	#index: Partial<Record<string, FilesystemStore>> = {};
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

	async registerSocket(path: string, socketId: number) {
		path = await this.resolve(path);

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

			const root: DomFsDirectory = {
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
	   UTILITIES
	================================ */

	async resolve(path: string): Promise<string> {
		await this.#loadIndex();

		const normalised = normalise(path);
		const parts = normalised.split("/").filter((item) => item !== "");

		let position = "/";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;

			const entry = this.#index[position];

			if (!entry) {
				// doesn't exist. just assume it's a directory.
				position =
					position === "/" ? `/${part}` : `${position}/${part}`;
				continue;
			}

			switch (entry.type) {
				case "directory":
					position =
						position === "/" ? `/${part}` : `${position}/${part}`;
					break;

				case "alias":
					// Jump to the alias target directory and append the current part
					position = normalise(`${entry.targetDirectory}/${part}`);
					break;

				default:
					if (!isLast) {
						throw new Error(
							`Path is invalid: file or socket ('${part}') found within traversal`
						);
					}
					position =
						position === "/" ? `/${part}` : `${position}/${part}`;
			}
		}

		const entry = this.#index[position];

		if (entry?.type == "alias") {
			position = entry.targetDirectory;
		}

		return normalise(position);
	}

	/* ================================
	   DIRECTORY OPERATIONS
	================================ */

	async mkdir(path: string) {
		path = await this.resolve(path);
		await this.#loadIndex();

		if (this.#index[path]) return false;

		const parentDir = parent(path);
		const parentEntry = this.#index[parentDir];

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(`Parent directory does not exist (mkdir ${path})`);

		const now = Date.now();

		const entry: DomFsDirectory = {
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

	async createAlias(path: string, targetDirectory: string): Promise<boolean> {
		path = await this.resolve(path);
		targetDirectory = await this.resolve(targetDirectory);

		await this.#loadIndex();

		if (this.#index[path]) return false;

		const parentDir = parent(path);
		const parentEntry = this.#index[parentDir];

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(
				`Parent directory does not exist (createAlias ${path})`
			);

		const now = Date.now();

		const entry: DomFsAlias = {
			size: 0,
			creation: now,
			modified: now,
			type: "alias",
			targetDirectory
		};

		const transaction = this.#db!.transaction("index", "readwrite");
		transaction.objectStore("index").put({ path, entry });
		this.#sync.postMessage({
			type: "createAlias",
			path
		});

		this.#index[path] = entry;
		return true;
	}

	async readdir(path: string): Promise<string[]> {
		path = await this.resolve(path);
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
		path = await this.resolve(path);
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
		path = await this.resolve(path);
		await this.#loadIndex();

		const file = this.#index[path];
		if (!file || file.type !== "file") return undefined;

		const transaction = this.#db!.transaction("files", "readonly");
		const store = transaction.objectStore("files");

		return new Promise((resolve, reject) => {
			const req: IDBRequest<IDBFile> = store.get(file.store);

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
		path = await this.resolve(path);
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
			} as IDBFile);

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

	async getMetadataEntry(
		path: string,
		entry: string
	): Promise<string | undefined> {
		path = await this.resolve(path);
		await this.#loadIndex();

		const file = this.#index[path];
		if (!file || file.type !== "file") return undefined;

		const metadata = file.metadata;
		if (!metadata) return undefined;

		return metadata[entry];
	}

	async listMetadataEntries(path: string) {
		path = await this.resolve(path);
		await this.#loadIndex();

		const file = this.#index[path];
		if (!file || file.type !== "file") return undefined;

		const metadata = file.metadata;
		if (!metadata) return [];

		return Object.keys(metadata);
	}

	async setMetadataEntry(
		path: string,
		entry: string,
		value: string
	): Promise<void> {
		path = await this.resolve(path);
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
				throw new Error(`Cannot write to metadata of ${existing.type}`);

			const transaction = this.#db!.transaction(["index"], "readwrite");

			const updated: DomFsFile = {
				...existing,
				modified: now,
				metadata: {
					...existing.metadata,
					[entry]: value
				}
			};

			transaction.objectStore("index").put({ path, entry: updated });

			this.#index[path] = updated;
			this.#sync.postMessage({
				type: "writeMetadata",
				path
			});
			return;
		}
	}

	async unlink(path: string) {
		path = await this.resolve(path);
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
		path = await this.resolve(path);
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

	async isDir(path: string): Promise<boolean> {
		path = await this.resolve(path);

		await this.#loadIndex();

		if (path === "/") return true;

		return this.#index[path]?.type === "directory";
	}

	async exists(path: string) {
		path = await this.resolve(path);

		await this.#loadIndex();

		if (path === "/") return true;

		return this.#index[path] !== undefined;
	}

	async stats(path: string): Promise<FileStats | undefined> {
		path = await this.resolve(path);

		await this.#loadIndex();

		const entry = this.#index[path];

		if (!entry) return;

		return {
			size: "size" in entry ? entry.size : -1,
			type: entry.type as "file" | "directory" | "socket", // alias is resolved away.
			modified: entry.modified,
			created: entry.creation
		};
	}
}

export default DomFs;
