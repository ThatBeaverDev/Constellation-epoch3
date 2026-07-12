import {
	type ConstellationProgram,
	type EnvironmentFilesystem,
	type NetworkRequestType,
	type SocketConnection,
	type SocketServer,
	type WorkerProgramStore,
	type Environment,
	type InputConfig,
	type Log,
	type Sound,
	WorkerOutputProxy
} from "../util/types/worker.js";
import {
	WorkerMessageDataTypes,
	WorkerMessageIntent,
	WorkerMessageMap,
	type WorkerEnv_Exec,
	type WorkerEnv_Network_Get
} from "../types/workerMessages.js";
import {
	RuntimeMessageIntent,
	RuntimeMessageMap
} from "../types/runtimeMessages.js";
import { type FileStats } from "../util/types/worker";
import { writeTempFile } from "./tempFile.js";
import { nodeJs } from "./config.js";
import { blobToUrl } from "../util/lib/uri.js";

/// <reference path="@typescript/lib-webworker@npm:@types/webworker" />

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

export async function workerFunction(this: undefined) {
	/* ===== PATH-BROWSERIFY, SLIGHTLY MODIFIED ===== */

	// sourced from https://github.com/browserify/path-browserify/blob/master/index.js. not my property, I've modified the exports lines, and added typescript types

	// 'path' module extracted from Node.js v8.11.1 (only the posix part)
	// transplited with Babel

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	"use strict";

	function assertPath(path: string) {
		if (typeof path !== "string") {
			throw new TypeError(
				"Path must be a string. Received " + JSON.stringify(path)
			);
		}
	}

	// Resolves . and .. elements in a path with directory names
	function normalizeStringPosix(path: string, allowAboveRoot: boolean) {
		let res: string = "";
		let lastSegmentLength: number = 0;
		let lastSlash: number = -1;
		let dots: number = 0;
		let code: number | undefined = undefined;

		for (let i = 0; i <= path.length; ++i) {
			if (i < path.length) code = path.charCodeAt(i);
			else if (code === 47 /*/*/) break;
			else code = 47; /*/*/
			if (code === 47 /*/*/) {
				if (lastSlash === i - 1 || dots === 1) {
					// NOOP
				} else if (lastSlash !== i - 1 && dots === 2) {
					if (
						res.length < 2 ||
						lastSegmentLength !== 2 ||
						res.charCodeAt(res.length - 1) !== 46 /*.*/ ||
						res.charCodeAt(res.length - 2) !== 46 /*.*/
					) {
						if (res.length > 2) {
							const lastSlashIndex = res.lastIndexOf("/");
							if (lastSlashIndex !== res.length - 1) {
								if (lastSlashIndex === -1) {
									res = "";
									lastSegmentLength = 0;
								} else {
									res = res.slice(0, lastSlashIndex);
									lastSegmentLength =
										res.length - 1 - res.lastIndexOf("/");
								}
								lastSlash = i;
								dots = 0;
								continue;
							}
						} else if (res.length === 2 || res.length === 1) {
							res = "";
							lastSegmentLength = 0;
							lastSlash = i;
							dots = 0;
							continue;
						}
					}
					if (allowAboveRoot) {
						if (res.length > 0) res += "/..";
						else res = "..";
						lastSegmentLength = 2;
					}
				} else {
					if (res.length > 0)
						res += "/" + path.slice(lastSlash + 1, i);
					else res = path.slice(lastSlash + 1, i);
					lastSegmentLength = i - lastSlash - 1;
				}
				lastSlash = i;
				dots = 0;
			} else if (code === 46 /*.*/ && dots !== -1) {
				++dots;
			} else {
				dots = -1;
			}
		}
		return res;
	}

	function _format(sep: string, pathObject: ReturnType<typeof path.parse>) {
		const dir = pathObject.dir || pathObject.root;
		const base =
			pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
		if (!dir) {
			return base;
		}
		if (dir === pathObject.root) {
			return dir + base;
		}
		return dir + sep + base;
	}

	const path = {
		// path.resolve([from ...], to)
		resolve(...args: string[]) {
			let resolvedPath = "";
			let resolvedAbsolute = false;
			let cwd = "/"; // fallback

			for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
				const path = i >= 0 ? args[i] : cwd;

				assertPath(path);

				// Skip empty entries
				if (path.length === 0) {
					continue;
				}

				resolvedPath = path + "/" + resolvedPath;
				resolvedAbsolute = path.charCodeAt(0) === 47; /*/*/
			}

			// At this point the path should be resolved to a full absolute path, but
			// handle relative paths to be safe (might happen when process.cwd() fails)

			// Normalize the path
			resolvedPath = normalizeStringPosix(
				resolvedPath,
				!resolvedAbsolute
			);

			if (resolvedAbsolute) {
				if (resolvedPath.length > 0) {
					return "/" + resolvedPath;
				} else {
					return "/";
				}
			} else if (resolvedPath.length > 0) {
				return resolvedPath;
			} else {
				return ".";
			}
		},

		normalize(path: string) {
			assertPath(path);

			if (path.length === 0) return ".";

			let isAbsolute = path.charCodeAt(0) === 47; /*/*/
			const trailingSeparator =
				path.charCodeAt(path.length - 1) === 47; /*/*/

			// Normalize the path
			path = normalizeStringPosix(path, !isAbsolute);

			if (path.length === 0 && !isAbsolute) path = ".";
			if (path.length > 0 && trailingSeparator) path += "/";

			if (isAbsolute) return "/" + path;
			return path;
		},

		isAbsolute(path: string) {
			assertPath(path);
			return path.length > 0 && path.charCodeAt(0) === 47; /*/*/
		},

		join(...args: string[]) {
			if (args.length === 0) return ".";
			let joined: string | undefined = undefined;
			for (let i = 0; i < args.length; ++i) {
				const arg = args[i];
				assertPath(arg);
				if (arg.length > 0) {
					if (joined === undefined) joined = arg;
					else joined += "/" + arg;
				}
			}
			if (joined === undefined) return ".";
			return path.normalize(joined);
		},

		relative(from: string, to: string) {
			assertPath(from);
			assertPath(to);

			if (from === to) return "";

			from = path.resolve(from);
			to = path.resolve(to);

			if (from === to) return "";

			// Trim any leading backslashes
			let fromStart = 1;
			for (; fromStart < from.length; ++fromStart) {
				if (from.charCodeAt(fromStart) !== 47 /*/*/) break;
			}
			const fromEnd = from.length;
			const fromLen = fromEnd - fromStart;

			// Trim any leading backslashes
			let toStart = 1;
			for (; toStart < to.length; ++toStart) {
				if (to.charCodeAt(toStart) !== 47 /*/*/) break;
			}
			const toEnd = to.length;
			const toLen = toEnd - toStart;

			// Compare paths to find the longest common path from root
			const length = fromLen < toLen ? fromLen : toLen;
			let lastCommonSep = -1;
			let i = 0;
			for (; i <= length; ++i) {
				if (i === length) {
					if (toLen > length) {
						if (to.charCodeAt(toStart + i) === 47 /*/*/) {
							// We get here if `from` is the exact base path for `to`.
							// For example: from='/foo/bar'; to='/foo/bar/baz'
							return to.slice(toStart + i + 1);
						} else if (i === 0) {
							// We get here if `from` is the root
							// For example: from='/'; to='/foo'
							return to.slice(toStart + i);
						}
					} else if (fromLen > length) {
						if (from.charCodeAt(fromStart + i) === 47 /*/*/) {
							// We get here if `to` is the exact base path for `from`.
							// For example: from='/foo/bar/baz'; to='/foo/bar'
							lastCommonSep = i;
						} else if (i === 0) {
							// We get here if `to` is the root.
							// For example: from='/foo'; to='/'
							lastCommonSep = 0;
						}
					}
					break;
				}
				const fromCode = from.charCodeAt(fromStart + i);
				const toCode = to.charCodeAt(toStart + i);
				if (fromCode !== toCode) break;
				else if (fromCode === 47 /*/*/) lastCommonSep = i;
			}

			let out = "";
			// Generate the relative path based on the path difference between `to`
			// and `from`
			for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
				if (i === fromEnd || from.charCodeAt(i) === 47 /*/*/) {
					if (out.length === 0) {
						out += "..";
					} else {
						out += "/..";
					}
				}
			}

			// Lastly, append the rest of the destination (`to`) path that comes after
			// the common path parts
			if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
			else {
				toStart += lastCommonSep;
				if (to.charCodeAt(toStart) === 47 /*/*/) ++toStart;
				return to.slice(toStart);
			}
		},

		_makeLong(path: string) {
			return path;
		},

		dirname(path: string) {
			assertPath(path);
			if (path.length === 0) return ".";
			let code = path.charCodeAt(0);
			const hasRoot = code === 47; /*/*/
			let end = -1;
			let matchedSlash = true;

			for (let i = path.length - 1; i >= 1; --i) {
				code = path.charCodeAt(i);
				if (code === 47 /*/*/) {
					if (!matchedSlash) {
						end = i;
						break;
					}
				} else {
					// We saw the first non-path separator
					matchedSlash = false;
				}
			}

			if (end === -1) return hasRoot ? "/" : ".";
			if (hasRoot && end === 1) return "//";
			return path.slice(0, end);
		},

		basename(path: string, ext: string) {
			if (ext !== undefined && typeof ext !== "string")
				throw new TypeError('"ext" argument must be a string');
			assertPath(path);

			let start = 0;
			let end = -1;
			let matchedSlash = true;
			let i;

			if (
				ext !== undefined &&
				ext.length > 0 &&
				ext.length <= path.length
			) {
				if (ext.length === path.length && ext === path) return "";

				let extIdx = ext.length - 1;
				let firstNonSlashEnd = -1;

				for (i = path.length - 1; i >= 0; --i) {
					const code = path.charCodeAt(i);
					if (code === 47 /*/*/) {
						// If we reached a path separator that was not part of a set of path
						// separators at the end of the string, stop now
						if (!matchedSlash) {
							start = i + 1;
							break;
						}
					} else {
						if (firstNonSlashEnd === -1) {
							// We saw the first non-path separator, remember this index in case
							// we need it if the extension ends up not matching
							matchedSlash = false;
							firstNonSlashEnd = i + 1;
						}
						if (extIdx >= 0) {
							// Try to match the explicit extension
							if (code === ext.charCodeAt(extIdx)) {
								if (--extIdx === -1) {
									// We matched the extension, so mark this as the end of our path
									// component
									end = i;
								}
							} else {
								// Extension does not match, so our result is the entire path
								// component
								extIdx = -1;
								end = firstNonSlashEnd;
							}
						}
					}
				}

				if (start === end) end = firstNonSlashEnd;
				else if (end === -1) end = path.length;
				return path.slice(start, end);
			} else {
				for (i = path.length - 1; i >= 0; --i) {
					if (path.charCodeAt(i) === 47 /*/*/) {
						// If we reached a path separator that was not part of a set of path
						// separators at the end of the string, stop now
						if (!matchedSlash) {
							start = i + 1;
							break;
						}
					} else if (end === -1) {
						// We saw the first non-path separator, mark this as the end of our
						// path component
						matchedSlash = false;
						end = i + 1;
					}
				}

				if (end === -1) return "";
				return path.slice(start, end);
			}
		},

		extname(path: string) {
			assertPath(path);
			let startDot = -1;
			let startPart = 0;
			let end = -1;
			let matchedSlash = true;

			// Track the state of characters (if any) we see before our first dot and
			// after any path separator we find
			let preDotState = 0;

			for (let i = path.length - 1; i >= 0; --i) {
				const code = path.charCodeAt(i);
				if (code === 47 /*/*/) {
					// If we reached a path separator that was not part of a set of path
					// separators at the end of the string, stop now
					if (!matchedSlash) {
						startPart = i + 1;
						break;
					}
					continue;
				}
				if (end === -1) {
					// We saw the first non-path separator, mark this as the end of our
					// extension
					matchedSlash = false;
					end = i + 1;
				}
				if (code === 46 /*.*/) {
					// If this is our first dot, mark it as the start of our extension
					if (startDot === -1) startDot = i;
					else if (preDotState !== 1) preDotState = 1;
				} else if (startDot !== -1) {
					// We saw a non-dot and non-path separator before our dot, so we should
					// have a good chance at having a non-empty extension
					preDotState = -1;
				}
			}

			if (
				startDot === -1 ||
				end === -1 ||
				// We saw a non-dot character immediately before the dot
				preDotState === 0 ||
				// The (right-most) trimmed path component is exactly '..'
				(preDotState === 1 &&
					startDot === end - 1 &&
					startDot === startPart + 1)
			) {
				return "";
			}
			return path.slice(startDot, end);
		},

		format(pathObject: {
			root: string;
			dir: string;
			base: string;
			ext: string;
			name: string;
		}) {
			if (pathObject === null || typeof pathObject !== "object") {
				throw new TypeError(
					'The "pathObject" argument must be of type Object. Received type ' +
						typeof pathObject
				);
			}
			return _format("/", pathObject);
		},

		parse(path: string) {
			assertPath(path);

			const ret = { root: "", dir: "", base: "", ext: "", name: "" };
			if (path.length === 0) return ret;
			let code = path.charCodeAt(0);

			let isAbsolute = code === 47; /*/*/

			const start = isAbsolute ? 1 : 0;
			if (isAbsolute) ret.root = "/";

			let startDot = -1;
			let startPart = 0;
			let end = -1;
			let matchedSlash = true;
			let i = path.length - 1;

			// Track the state of characters (if any) we see before our first dot and
			// after any path separator we find
			let preDotState = 0;

			// Get non-dir info
			for (; i >= start; --i) {
				code = path.charCodeAt(i);
				if (code === 47 /*/*/) {
					// If we reached a path separator that was not part of a set of path
					// separators at the end of the string, stop now
					if (!matchedSlash) {
						startPart = i + 1;
						break;
					}
					continue;
				}
				if (end === -1) {
					// We saw the first non-path separator, mark this as the end of our
					// extension
					matchedSlash = false;
					end = i + 1;
				}
				if (code === 46 /*.*/) {
					// If this is our first dot, mark it as the start of our extension
					if (startDot === -1) startDot = i;
					else if (preDotState !== 1) preDotState = 1;
				} else if (startDot !== -1) {
					// We saw a non-dot and non-path separator before our dot, so we should
					// have a good chance at having a non-empty extension
					preDotState = -1;
				}
			}

			if (
				startDot === -1 ||
				end === -1 ||
				// We saw a non-dot character immediately before the dot
				preDotState === 0 ||
				// The (right-most) trimmed path component is exactly '..'
				(preDotState === 1 &&
					startDot === end - 1 &&
					startDot === startPart + 1)
			) {
				if (end !== -1) {
					if (startPart === 0 && isAbsolute)
						ret.base = ret.name = path.slice(1, end);
					else ret.base = ret.name = path.slice(startPart, end);
				}
			} else {
				if (startPart === 0 && isAbsolute) {
					ret.name = path.slice(1, startDot);
					ret.base = path.slice(1, end);
				} else {
					ret.name = path.slice(startPart, startDot);
					ret.base = path.slice(startPart, end);
				}
				ret.ext = path.slice(startDot, end);
			}

			if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
			else if (isAbsolute) ret.dir = "/";

			return ret;
		}
	};

	/* ===== END OF PASS-BROWSERIFY ===== */

	async function workerMessageHandler() {
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

	String.prototype.textAfter = function (after) {
		return this.split(after).splice(1, Infinity).join(after);
	};

	String.prototype.textAfterAll = function (after) {
		return this.split(after).pop() ?? "";
	};

	String.prototype.textBefore = function (before) {
		return this.substring(0, this.indexOf(before));
	};

	String.prototype.textBeforeLast = function (before) {
		return this.split("")
			.reverse()
			.join("")
			.textAfter(before)
			.split("")
			.reverse()
			.join("");
	};

	String.prototype.map = function (mappings) {
		let text = String(this);

		for (const replaced in mappings) {
			text = text.replaceAll(replaced, mappings[replaced]);
		}

		return text;
	};

	/* Secure some bases */

	// @ts-expect-error
	globalThis.localStorage = undefined;

	// @ts-expect-error
	globalThis.eval = undefined;
	// @ts-expect-error
	globalThis.fetch = undefined;
	// @ts-expect-error
	globalThis.XMLHttpRequest = undefined;
	// @ts-expect-error
	globalThis.Worker = undefined;
	// @ts-expect-error
	globalThis.globalThis = globalThis;

	class WorkerFS implements EnvironmentFilesystem {
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
			if (typeof path !== "string")
				throw new Error("Path must be string");
			if (!["text", "json", undefined].includes(format))
				throw new Error("Format must be 'text', 'json' or blank.");

			return await this.#sendMessage("fs_readFile", { path, format });
		}
		async writeFile(path: string, contents: string) {
			if (typeof path !== "string")
				throw new Error("Path must be string");
			if (typeof contents !== "string")
				throw new Error("Contents must be string");

			return await this.#sendMessage("fs_writeFile", { path, contents });
		}
		async unlink(path: string): Promise<void> {
			if (typeof path !== "string")
				throw new Error("Path must be string");

			return await this.#sendMessage("fs_unlink", { path });
		}

		async mkdir(
			path: string,
			options?: { recursive?: boolean }
		): Promise<boolean> {
			if (typeof path !== "string")
				throw new Error("Path must be string");

			return await this.#sendMessage("fs_mkdir", { path, options });
		}
		async readdir(path: string): Promise<string[]> {
			if (typeof path !== "string")
				throw new Error("Path must be string");

			return await this.#sendMessage("fs_readdir", { path });
		}
		async rmdir(path: string): Promise<void> {
			if (typeof path !== "string")
				throw new Error("Path must be string");

			return await this.#sendMessage("fs_rmdir", { path });
		}

		async rm(path: string): Promise<void> {
			if (typeof path !== "string")
				throw new Error("Path must be string");

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

	const { sendMessage, emit, handle } = await workerMessageHandler();

	setInterval(() => {
		emit("keepAlive", undefined);
	}, 2000);

	/* =============== Worker Code  =============== */

	const programs: WorkerProgramStore[] = [];
	const fs = new WorkerFS(sendMessage);

	function newEnv(
		program: WorkerProgramStore,
		workingDirectory?: string
	): Environment {
		const { pid } = program;
		let handlingInput = false;

		let logs: Log[] = [];

		/**
		 * Maps the interval ID for the program to the interval ID for the worker
		 */
		const intervalIds: Record<number, number> = {};
		let nextIntervalId = 0;

		program.onExit.push(() => {
			for (const programId in intervalIds) {
				const workerIntervalId = intervalIds[programId];

				clearInterval(workerIntervalId);
			}
		});

		const eventsMap: Record<string, Function[]> = {};

		const env: Environment = {
			print(data: Log) {
				emit("program_log", { data });

				return logs.push(data);
			},

			warn(data: Log) {
				emit("program_warn", { data });

				return logs.push(data);
			},

			error(data: Log) {
				emit("program_error", { data });

				return logs.push(data);
			},
			async getLiveCanvas(width, height) {
				return await sendMessage("env_get_liveCanvas", {
					width,
					height
				});
			},

			input: async function (
				message: string,
				config?: Partial<InputConfig>
			) {
				if (handlingInput == true) {
					throw new Error("Maximum of one input request at a time.");
				}
				handlingInput = true;

				program.inputRequest = {};

				const text = await sendMessage("env_input", {
					message,

					config: {
						hideTyping: config?.hideTyping ?? false,
						leaveInputOnCompletion:
							config?.leaveInputOnCompletion ?? true,
						inline: config?.inline ?? false,
						initialText: config?.initialText ?? ""
					}
				});

				handlingInput = false;
				return text;
			},

			clearLogs() {
				emit("env_clear_logs", undefined);

				logs.splice(0, Infinity);
			},

			fs,
			path,

			triggerEvent(name, data) {
				const callbacks = eventsMap[name];

				if (!callbacks) return;
				for (const callback of callbacks) {
					callback(data);
				}
			},
			addEventListener(name, callback) {
				if (!eventsMap[name]) eventsMap[name] = [callback];
				else eventsMap[name].push(callback);
			},
			removeEventListener(name, callback) {
				if (!eventsMap[name]) return;

				eventsMap[name] = eventsMap[name].filter(
					(cb) => cb !== callback
				);

				if (eventsMap[name].length == 0) delete eventsMap[name];
			},

			workingDirectory: String(workingDirectory ?? "/"),

			async execute(
				path: string,
				args?: string[],
				config?: {
					handOverDisplay?: boolean;
					input?: Log[];
					outputProxy?: WorkerOutputProxy;
				}
			) {
				const data: WorkerEnv_Exec = {
					path,
					args,
					handoverDisplayPid: config?.handOverDisplay
						? pid
						: undefined,
					workingDirectory: this.workingDirectory,
					input: config?.input,
					outputProxy: config?.outputProxy !== undefined
				};

				const { pid: executedPID } = await sendMessage(
					"env_exec",
					data
				);

				if (config?.outputProxy) {
					program.outputProxyHandlers[executedPID] =
						config.outputProxy;
				}

				const obj: Partial<
					(typeof activePrograms)[keyof typeof activePrograms]
				> = {}; // store for waiting for a program to exit (for awaiting the `onExit` key)

				obj.promise = new Promise<{ return: Log; logs: Log[] }>(
					(resolve) => {
						obj.resolve = resolve;
					}
				);

				// @ts-expect-error
				activePrograms[executedPID] = obj;

				if (config?.outputProxy) {
					return {
						onExit: obj.promise,

						triggerProxyEvent: (eventName, data) => {
							switch (eventName) {
								case "keydown":
								case "keyup": {
									// allowed

									emit("proxy_trigger_event", {
										handlerPid: program.pid,
										subjectPid: executedPID,

										eventName,
										data: data
									});

									break;
								}

								default:
								// not allowed to trigger
							}
						}
					};
				}

				return {
					onExit: obj.promise
				} as any; // trust, it's trying to complain about the lack of `outputProxy` key.
			},
			async processes() {
				return await sendMessage("env_processes", undefined);
			},
			async self() {
				return await sendMessage("env_selfProcess", undefined);
			},
			async parent() {
				return await sendMessage("env_parent_process", undefined);
			},

			network: {
				request: async (
					type: NetworkRequestType,
					url: string,
					format: "text" | "json" | "datauri" = "text",
					body?: Object,
					headers?: Record<string, string>,
					options?: WorkerEnv_Network_Get["options"]
				) => {
					const result = await sendMessage("env_network_get", {
						type,
						url,
						format,
						body,
						headers,
						options: options ?? {}
					});

					return result;
				}
			},

			systemStats: {
				async uptime() {
					return await sendMessage("kernel_uptime", undefined);
				},

				async kernelVersion() {
					return await sendMessage("kernel_version", undefined);
				}
			},

			sound: {
				play: async (config: Sound) => {
					const { id, duration } = await sendMessage(
						"env_sound_play",
						{
							config
						}
					);

					const onStop = new Promise<number>((resolve) => {
						// @ts-expect-error
						handle(`sound_stopped_${id}`, ({ time }) => {
							resolve(time);
						});
					});

					return {
						id,
						duration,
						onStop,

						async pause() {
							await sendMessage("env_sound_pause", {
								soundID: id
							});
						},

						async resume() {
							await sendMessage("env_sound_resume", {
								soundID: id
							});
						},

						async remove() {
							await sendMessage("env_sound_remove", {
								soundID: id
							});
						}
					};
				}
			},

			sockets: {
				async connectToSocket(directory: string) {
					const socketId = await sendMessage(
						"Sockets/Client/newConnection",
						{
							socketDirectory: directory
						}
					);

					let exited = false;

					const connection: SocketConnection = {
						directory: directory,

						// called from outside
						onMessage: undefined,
						sendMessage(payload: unknown) {
							if (exited)
								throw new Error(
									"Connection is no longer active and messages can no longer be sent."
								);

							emit("Sockets/Client/sendPacket", {
								payload,
								socketId
							});
						},

						exit() {
							if (exited) return;

							this.onClose?.();

							exited = true;
							program.socketConnections =
								program.socketConnections.filter(
									(socket) => socket.connection !== connection
								);

							emit("Sockets/Client/endConnection", { socketId });
						}
					};

					program.socketConnections.push({ connection, socketId });

					return connection;
				},

				async createSocket(directory: string) {
					const socketId = await sendMessage(
						"Sockets/Server/newServer",
						{
							socketDirectory: directory
						}
					);

					let exited = false;

					const server: SocketServer = {
						directory: directory,

						onClientConnect: undefined,
						onClientDisconnect: undefined,
						onMessage: undefined,

						sendMessage(clientPid, payload) {
							if (exited)
								throw new Error(
									"Server is no longer active and messages can no longer be sent"
								);

							emit("Sockets/Server/sendPacket", {
								payload,
								socketId: socketId,
								targetPid: clientPid
							});
						},

						exit() {
							if (exited) return;

							exited = true;

							program.socketServers =
								program.socketServers.filter(
									(socket) => socket.server !== server
								);

							emit("Sockets/Server/endServer", { socketId });
						}
					};

					program.socketServers.push({ server, socketId });

					return server;
				}
			},

			timers: {
				sleep(ms: number) {
					return new Promise<void>((resolve) => {
						setTimeout(resolve, ms);
					});
				},

				setInterval(callback, ms) {
					const interval = setInterval(callback, ms);
					const programIntervalId = nextIntervalId++;

					intervalIds[programIntervalId] = interval;

					return programIntervalId;
				},

				clearInterval(id) {
					const interval = intervalIds[id];

					if (!interval) return;
					delete intervalIds[id];

					clearInterval(interval);
				}
			},

			exit() {
				terminateProgram(program, "");
			}
		};

		return env;
	}

	const activePrograms: Partial<
		Record<
			number,
			{
				promise: Promise<{ return: Log; logs: Log[] }>;
				resolve: (value: { return: Log; logs: Log[] }) => void;
			}
		>
	> = {};

	handle(
		"executeProgram",
		async ({
			directory,
			pid,

			args,
			workingDirectory,
			input
		}) => {
			// from src/util/lib/uri.ts
			async function blobToUrl(blob: Blob) {
				const url = URL.createObjectURL(blob);

				setTimeout(() => {
					URL.revokeObjectURL(url);
				}, 5000);

				return url;
			}

			if (!directory) throw new Error("Directory is required!");
			if (!pid) throw new Error("PID is required!");

			const contents = await fs.readFile(directory);
			if (!contents)
				throw new Error(
					`File '${directory}' to execute does not exist!`
				);

			const blob = new Blob([contents], { type: "text/javascript" });
			const url = await blobToUrl(blob);

			const exports = await import(url);
			const program = exports.default as ConstellationProgram;

			const store: WorkerProgramStore = {
				generator: undefined,

				pid,
				directory,

				// @ts-expect-error
				env: "tempValue",

				locked: false,

				outputHandlers: {},

				socketConnections: [],
				socketServers: [],

				liveCanvasIds: [],

				outputProxyHandlers: {},

				onExit: []
			};
			store.env = newEnv(store, workingDirectory);

			try {
				const generator = program(store.env, args ?? [], input);

				if (
					generator &&
					Object.keys(Object.getPrototypeOf(generator)).length == 0
				) {
					// @ts-expect-error // probably a generator
					store.generator = generator;
				} else {
					// not a generator, this is a return value, let's just pretend we're working with a generator.
					store.generator = (function* emptyGenerator() {
						return generator;
					})();
				}
			} catch (e) {
				console.error(e);
				return false;
			}

			programs.push(store);

			return true;
		}
	);

	function programByPid(id: number) {
		const index = programs.map((program) => program.pid).indexOf(id);

		if (index == -1) {
			throw new Error(
				`Program by PID ${id} does not exist on this worker.`
			);
		}

		return programs[index];
	}

	function terminateProgram(program: WorkerProgramStore, data: Log) {
		for (const liveCanvas of program.liveCanvasIds) {
			emit("env_remove_liveCanvas", { id: liveCanvas });
		}

		for (const server of program.socketServers) {
			server.server.exit();
		}
		for (const connection of program.socketConnections) {
			connection.connection.exit();
		}
		program.onExit.forEach((fn) => fn());

		completedQueue.push({ pid: program.pid });

		programs.splice(programs.indexOf(program), 1);

		sendMessage("termination", { data });
	}

	const completedQueue: { pid: number }[] = [];

	const computeCalculationWindow = 2000;
	const computeSlices: { start: number; end: number }[] = [];

	handle("execLoop", () => {
		const start = performance.now();

		programs.forEach(async (program) => {
			if (program.locked) return;
			program.locked = true;

			try {
				if (!program.generator) {
					terminateProgram(program, "");
					return;
				}

				const result = await program.generator.next(program.passValue);
				program.passValue = undefined;

				if (result.done) {
					terminateProgram(program, result.value);
				} else {
					// result.value is a regular value, pass it next time
					program.passValue = result.value;
				}
			} catch (err) {
				console.error(`Program ${program.pid} failed:`, err);

				// kill it.
				terminateProgram(program, [
					{
						text: String(err instanceof Error ? err.stack : err),
						colour: "#ff0000"
					}
				]);
			}

			program.locked = false;
		});

		const programsData = programs.map((item) => ({
			pid: item.pid,
			directory: item.directory
		}));

		const end = performance.now();

		// Store this active compute period
		computeSlices.push({ start, end });

		// Remove anything completely outside the window
		const cutoff = end - computeCalculationWindow;
		while (computeSlices.length && computeSlices[0].end < cutoff) {
			computeSlices.shift();
		}

		// Calculate total active time within the last 2 seconds
		let activeTime = 0;

		for (const slice of computeSlices) {
			const overlapStart = Math.max(slice.start, cutoff);
			const overlapEnd = slice.end;

			if (overlapEnd > overlapStart) {
				activeTime += overlapEnd - overlapStart;
			}
		}

		const computePercentage = (activeTime / computeCalculationWindow) * 100;

		const result = {
			programs: programsData,
			completePrograms: completedQueue.splice(0),
			computePercentage
		};

		return result;
	});

	handle("program_exit", ({ pid, data, logs }) => {
		const program = activePrograms[pid];
		if (program) {
			program.resolve({ return: data, logs: logs });
			delete activePrograms[pid];
		}
	});

	// sockets

	function socketServerBySocketId(
		id: number
	): WorkerProgramStore["socketServers"][0] | undefined {
		for (const program of programs) {
			const ids = program.socketServers.map((server) => server.socketId);
			const index = ids.indexOf(id);

			if (index !== -1) {
				return program.socketServers[index];
			}
		}

		return undefined;
	}

	function clientConnectionsBySocketId(id: number) {
		const connections: WorkerProgramStore["socketConnections"] = [];
		for (const program of programs) {
			const ids = program.socketConnections.map(
				(connection) => connection.socketId
			);
			const index = ids.indexOf(id);

			if (index !== -1) {
				connections.push(program.socketConnections[index]);
			}
		}

		return connections;
	}

	handle("Sockets/Client/newConnection", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientConnect?.({ pid: packet.initiatorPid });
	});
	handle("Sockets/Client/endConnection", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientDisconnect?.({ pid: packet.initiatorPid });
	});
	handle("Sockets/Client/sendPacket", (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onMessage?.(
			{ pid: packet.initiatorPid },
			packet.payload
		);
	});

	// shouldnt fire
	handle("Sockets/Server/newServer", () => {});
	handle("Sockets/Server/endServer", (packet) => {
		// a server has terminated, so we need to disconnect clients.
		const connections = clientConnectionsBySocketId(packet.socketId);

		for (const connection of connections) {
			// need onClose()
			connection.connection.onClose?.();
			connection.connection.exit();
		}
	});
	handle("Sockets/Server/sendPacket", (packet) => {
		// recieve server packet
		const recipient = programByPid(packet.targetPid);

		const ids = recipient.socketConnections.map(
			(connection) => connection.socketId
		);
		const index = ids.indexOf(packet.socketId);

		if (index == -1) return; // not connected

		const { connection } = recipient.socketConnections[index];

		connection.onMessage?.(packet.payload);
	});

	// events
	handle("event_trigger", (packet) => {
		const program = programByPid(packet.pid);

		program.env.triggerEvent(packet.name, packet.data);
	});

	// output proxies
	handle("proxy_log", (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onLog(packet.log.type, packet.log.data);
	});

	handle("proxy_input", async (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return { finished: false };

		return {
			finished: true,
			response: await handler.onInput(packet.message, packet.config)
		};
	});

	handle("proxy_clear", (packet) => {
		const program = programByPid(packet.handlerPid);

		const handler = program.outputProxyHandlers[packet.subjectPid];
		if (!handler) return;

		handler.onClear();
	});

	console.log("Initialisation Complete.");
}

// Source - https://stackoverflow.com/a/77602420
// Posted by timkay
// Retrieved 2026-03-05, License - CC BY-SA 4.0
// I added the name parameter.
export async function newWorker(fn: Function, name?: string, ...params: any[]) {
	const stringifiedParameters = params.map((item) => JSON.stringify(item));
	const code = `(${fn.toString()})(${stringifiedParameters})`;

	const reference = nodeJs
		? await writeTempFile(code)
		: blobToUrl(new Blob([code], { type: "application/javascript" }));

	return new Worker(reference, { name, type: "module" });
}
