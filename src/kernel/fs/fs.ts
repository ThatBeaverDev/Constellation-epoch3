import { FileStats, Log } from "@/types/worker";
import SocketManager from "../runtime/sockets";
import Epoch3Kernel from "../kernel";
import { FS_DB_NAME, NEW_FS } from "../constants";

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
	readFile(path: string): Promise<string | undefined>;
	readFile(path: string, format: "text"): Promise<string | undefined>;
	readFile<T extends Object = Object>(
		path: string,
		format: "json"
	): Promise<T | undefined>;
	readFile<T extends Object = Object>(
		path: string,
		format?: "text" | "json"
	): Promise<string | T | undefined>;
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

	/**
	 * Returns the used FS space in bytes
	 */
	getUsedSpace(): Promise<number>;

	/**
	 * Returns the maximum allowed FS space in bytes
	 */
	getAllowedSpace(): Promise<number>;
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
	#panic: Epoch3Kernel["panic"];
	socketManager?: SocketManager;

	#db?: IDBDatabase;

	get ready() {
		return Boolean(this.#db);
	}

	#readyPromise: Promise<void>;
	#onReady!: Function;

	// In constructor:
	waitForReady() {
		return this.#readyPromise;
	}

	constructor(
		log: (message: Log) => void,
		panic: Epoch3Kernel["panic"],
		socketManager?: SocketManager
	) {
		this.#log = log;
		this.#panic = panic;

		this.#sync.addEventListener(
			"message",
			(e: MessageEvent<{ path: string; entry: FilesystemStore }>) => {
				const { path, entry } = e.data;

				if (entry == undefined) delete this.#index[path];
				else this.#index[path] = entry;
			}
		);

		this.socketManager = socketManager;

		this.#readyPromise = new Promise((resolve) => {
			this.#onReady = resolve;
		});
	}

	#index: Partial<Record<string, FilesystemStore>> = {};
	#sync = new BroadcastChannel(`fs_sync_${FS_DB_NAME}`);
	#listIndexEntries() {
		return Object.keys(this.#index);
	}

	async #getIndexEntry(path: string) {
		if (this.#index[path]) {
			return this.#index[path];
		}

		await this.#refreshIndexEntry(path);

		return this.#index[path];
	}

	async #refreshIndexEntry(path: string) {
		if (!this.#db) throw new Error("Database has not opened yet.");

		const transaction = this.#db.transaction("index", "readonly");
		const store = transaction.objectStore("index");

		return new Promise<void>((resolve, reject) => {
			interface StoredData {
				path: string;
				entry: FilesystemStore;
			}

			const request: IDBRequest<StoredData> = store.get(path);

			request.onsuccess = () => {
				const entry = request.result?.entry;

				if (entry) {
					this.#index[path] = entry;
				} else {
					delete this.#index[path];
				}

				resolve();
			};

			request.onerror = () => reject();
		});
	}

	#setIndexEntry(
		path: string,
		entry: FilesystemStore,
		transaction?: IDBTransaction
	) {
		if (!transaction) {
			if (!this.#db) throw new Error("Database has not opened yet.");

			transaction = this.#db.transaction("index", "readwrite");
		}

		const store = transaction.objectStore("index");

		return new Promise<void>((resolve, reject) => {
			const request = store.put({ path, entry });

			request.onsuccess = () => {
				this.#sync.postMessage({ path, entry });

				this.#index[path] = entry;

				resolve();
			};

			request.onerror = () => reject();
		});
	}

	#deleteIndexEntry(path: string, transaction?: IDBTransaction) {
		if (!transaction) {
			if (!this.#db) throw new Error("Database has not opened yet.");

			transaction = this.#db.transaction("index", "readwrite");
		}

		const store = transaction.objectStore("index");

		return new Promise<void>((resolve, reject) => {
			const request = store.delete(path);

			request.onsuccess = () => {
				this.#sync.postMessage({ path, entry: undefined });

				delete this.#index[path];

				resolve();
			};

			request.onerror = () => reject();
		});
	}

	async registerSocket(path: string, socketId: number) {
		path = await this.resolve(path);

		if (this.#index[path]) {
			throw new Error(
				`Cannot register socket as a file already exists at ${path}`
			);
		}

		const parentDir = parent(path);
		const parentEntry = await this.#getIndexEntry(parentDir);

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

		// don't update indexedDB
		this.#index[path] = entry;
	}

	/* ================================
	   INITIALISATION
	================================ */

	async init() {
		if (NEW_FS) {
			this.#log("Erasing old DomFs...");

			await new Promise<void>((resolve, reject) => {
				const DBDeleteRequest = indexedDB.deleteDatabase(FS_DB_NAME);
				DBDeleteRequest.onerror = () => {
					this.#panic("fs", new Error("Error deleting database."));
					reject("Error deleting database.");
				};
				DBDeleteRequest.onsuccess = () => {
					this.#log("Database deleted successfully");
					resolve();
				};
			});
		}

		this.#log("Opening filesystem from indexedDB...");

		enum FsVersions {
			initial = 1
		}

		const init = new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(FS_DB_NAME, FsVersions.initial);

			request.onerror = () => {
				this.#panic("fs", new Error("Failed to open IndexedDB"));

				reject("Failed to open IndexedDB");
			};

			request.onupgradeneeded = (event) => {
				const openRequest = event.target as IDBOpenDBRequest;
				const db = openRequest.result;

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

				resolve();
			};
		});

		await init;

		await this.#loadIndex();

		this.#onReady();
	}

	/* ================================
	   UTILITIES
	================================ */

	#indexLoaded = false;
	async #loadIndex() {
		if (!this.#db || this.#indexLoaded) return;

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

			await this.#setIndexEntry("/", root);
		}
	}

	async resolve(path: string): Promise<string> {
		const normalised = normalise(path);
		const parts = normalised.split("/").filter((item) => item !== "");

		let position = "/";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;

			const entry = await this.#getIndexEntry(position);

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

		const entry = await this.#getIndexEntry(position);

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

		const currentEntry = await this.#getIndexEntry(path);
		if (currentEntry) return false;

		const parentDir = parent(path);
		const parentEntry = await this.#getIndexEntry(parentDir);

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(`Parent directory does not exist (mkdir ${path})`);

		const now = Date.now();

		const entry: DomFsDirectory = {
			creation: now,
			modified: now,
			type: "directory"
		};

		await this.#setIndexEntry(path, entry);
		return true;
	}

	async createAlias(path: string, targetDirectory: string): Promise<boolean> {
		path = await this.resolve(path);
		targetDirectory = await this.resolve(targetDirectory);

		const currentEntry = await this.#getIndexEntry(path);
		if (currentEntry) return false;

		const parentDir = parent(path);
		const parentEntry = await this.#getIndexEntry(parentDir);

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

		await this.#setIndexEntry(path, entry);
		return true;
	}

	async readdir(path: string): Promise<string[]> {
		path = await this.resolve(path);

		const dir = await this.#getIndexEntry(path);
		if (!dir || dir.type !== "directory")
			throw new Error(`Not a directory: '${path}'`);

		const keys = this.#listIndexEntries();

		function buildChildrenMap() {
			const childrenMap = new Map<string, string[]>();

			for (const path of keys) {
				if (path === "/") continue;

				const lastSlash = path.lastIndexOf("/");
				const parentPath =
					lastSlash === 0 ? "/" : path.slice(0, lastSlash);

				if (!childrenMap.has(parentPath)) {
					childrenMap.set(parentPath, []);
				}

				const filename = path.split("/").pop();

				// @ts-expect-error // we just populated it above, it's fine
				childrenMap.get(parentPath).push(filename);
			}

			return childrenMap;
		}
		const map = buildChildrenMap();

		const results = map.get(path);
		if (results == undefined) return [];
		else return results;
	}

	async rmdir(path: string) {
		path = await this.resolve(path);

		if (path === "/") throw new Error("Cannot remove root");

		const entry = await this.#getIndexEntry(path);
		if (!entry || entry.type !== "directory")
			throw new Error(`Not a directory: '${path}'`);

		const keys = this.#listIndexEntries();

		for (const key of keys) {
			if (parent(key) === path) throw new Error("Directory not empty");
		}

		await this.#deleteIndexEntry(path);
	}

	/* ================================
	   FILE OPERATIONS
	================================ */

	async readFile<T extends Object = Object>(
		path: string,
		format: "text" | "json" = "text"
	): Promise<string | T | undefined> {
		path = await this.resolve(path);

		const file = await this.#getIndexEntry(path);
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

		const parentDir = parent(path);
		const parentEntry = await this.#getIndexEntry(parentDir);

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(
				`Parent directory does not exist (writeFile ${path})`
			);

		const now = Date.now();
		const existing = await this.#getIndexEntry(path);

		const transaction = this.#db!.transaction(
			["index", "files"],
			"readwrite"
		);
		const fileStore = transaction.objectStore("files");

		return new Promise<void>(async (resolve, reject) => {
			if (existing) {
				// MODIFY
				if (existing.type !== "file") {
					reject(`Cannot write to ${existing.type}`);
					return;
				}

				fileStore.put({ id: existing.store, contents } as IDBFile);
				const updated: DomFsFile = {
					...existing,
					size: contents.length,
					modified: now
				};

				await this.#setIndexEntry(path, updated, transaction);
				resolve();
				return;
			}

			// CREATE
			const req = fileStore.add({ contents });
			req.onsuccess = async () => {
				const fileId = req.result as number;
				const entry: DomFsFile = {
					store: fileId,
					size: contents.length,
					creation: now,
					modified: now,
					type: "file"
				};

				await this.#setIndexEntry(path, entry, transaction);

				resolve();
			};

			req.onerror = () => reject();
		});
	}

	async getMetadataEntry(
		path: string,
		entry: string
	): Promise<string | undefined> {
		path = await this.resolve(path);

		const file = await this.#getIndexEntry(path);
		if (!file || file.type !== "file") return undefined;

		const metadata = file.metadata;
		if (!metadata) return undefined;

		return metadata[entry];
	}

	async listMetadataEntries(path: string) {
		path = await this.resolve(path);

		const file = await this.#getIndexEntry(path);
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

		const parentDir = parent(path);
		const parentEntry = await this.#getIndexEntry(parentDir);

		if (!parentEntry || parentEntry.type !== "directory")
			throw new Error(
				`Parent directory does not exist (writeFile ${path})`
			);

		const now = Date.now();
		const existing = await this.#getIndexEntry(path);

		// MODIFY
		if (existing) {
			if (existing.type !== "file")
				throw new Error(`Cannot write to metadata of ${existing.type}`);

			const updated: DomFsFile = {
				...existing,
				modified: now,
				metadata: {
					...existing.metadata,
					[entry]: value
				}
			};

			await this.#setIndexEntry(path, updated);
			return;
		}
	}

	async unlink(path: string) {
		path = await this.resolve(path);

		const entry = await this.#getIndexEntry(path);
		if (!entry || entry.type !== "file") return;

		const transaction = this.#db!.transaction(
			["index", "files"],
			"readwrite"
		);

		const store = transaction.objectStore("files");
		store.delete(entry.store);

		await this.#deleteIndexEntry(path, transaction);
	}

	async rm(path: string) {
		path = await this.resolve(path);

		const entry = await this.#getIndexEntry(path);
		if (!entry) return;

		if (entry.type === "file") {
			await this.unlink(path);
			return;
		}

		const keys = this.#listIndexEntries();
		const children = keys.filter((p) => parent(p) === path);

		for (const child of children) await this.rm(child);

		await this.rmdir(path);
	}

	async isDir(path: string): Promise<boolean> {
		path = await this.resolve(path);

		if (path === "/") return true;

		const store = await this.#getIndexEntry(path);

		return store?.type === "directory";
	}

	async exists(path: string) {
		path = await this.resolve(path);

		if (path === "/") return true;

		return (await this.#getIndexEntry(path)) !== undefined;
	}

	async stats(path: string): Promise<FileStats | undefined> {
		path = await this.resolve(path);

		const entry = await this.#getIndexEntry(path);

		if (!entry) return;

		return {
			size: "size" in entry ? entry.size : -1,
			type: entry.type as "file" | "directory" | "socket", // alias is resolved away.
			modified: entry.modified,
			created: entry.creation
		};
	}

	async getUsedSpace() {
		const storageInfo = await navigator.storage.estimate();
		return storageInfo.usage ?? 0;
	}

	async getAllowedSpace() {
		const storageInfo = await navigator.storage.estimate();
		return storageInfo.quota ?? 1;
	}
}

export default DomFs;
