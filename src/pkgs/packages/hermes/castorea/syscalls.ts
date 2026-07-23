import { Environment } from "../../../../util/types/worker";
import { HERMES_CASTOREA_DISK } from "../constants";

type FileAttribute = "contents" | "children" | "permissions" | string;

interface File {
	contents?: any;
	[key: string]: any;
}

export default function castoreaCalls(env: Environment, args: string[]) {
	const debugging = true;

	function debug(...text: string[]) {
		if (debugging) console.warn(...text);
	}

	function fullDirectory(base: string, point: string) {
		point = `${point ?? ""}`;
		base = `${base ?? ""}`;

		const split = point.split("");

		switch (point[0]) {
			case "§":
				split[0] = "/System";
				break;
			case "~":
				split[0] = "/Users/hermes";
				break;
		}

		const loc = split.join("");

		const full = env.path.resolve(base, loc);

		return env.path.join(HERMES_CASTOREA_DISK, full);
	}

	// Process messaging store backed by in-memory state
	const messages: Record<
		number,
		Array<{ origin: number; content: any; sent: number }>
	> = {};
	const processNames: Record<number, string> = {};

	const calls = {
		// --- Filesystem Calls ---
		read: async (
			directory: string,
			attribute: FileAttribute = "contents"
		) => {
			debug(`read ${directory}`);
			const dir = fullDirectory(env.workingDirectory, directory);

			const obj = await env.fs.readFile<File>(dir, "json");
			if (!obj) return undefined;

			return obj[attribute];
		},

		write: async (directory: string, content: any) => {
			debug(`write ${directory}`, JSON.stringify(content));
			const dir = fullDirectory(env.workingDirectory, directory);

			const obj: File = { contents: content };
			await env.fs.writeFile(dir, JSON.stringify(obj));

			return 0;
		},

		unlink: async (directory: string) => {
			debug(`unlink ${directory}`);
			const dir = fullDirectory(env.workingDirectory, directory);

			await env.fs.rm(dir);
		},

		isFolder: async (directory: string) => {
			debug(`isFolder ${directory}`);
			const dir = fullDirectory(env.workingDirectory, directory);

			return await env.fs.isDirectory(dir);
		},

		isDir: async (directory: string) => {
			const dir = fullDirectory(env.workingDirectory, directory);
			return await env.fs.isDirectory(dir);
		},

		exists: async (directory: string) => {
			const dir = fullDirectory(env.workingDirectory, directory);
			return await env.fs.exists(dir);
		},

		readdir: async (directory: string, attribute: string = "children") => {
			debug(`readdir ${directory}`);
			const dir = fullDirectory(env.workingDirectory, directory);

			switch (attribute) {
				case "children":
					return await env.fs.readdir(dir);

				case "permissions":
					throw new Error("Permissions attribute is not supported");

				default:
					const raw = await env.fs.readFile<Record<string, any>>(
						dir,
						"json"
					);
					return raw ? raw[attribute] : undefined;
			}
		},

		mkdir: async (directory: string) => {
			debug(`mkdir ${directory}`);
			const dir = fullDirectory(env.workingDirectory, directory);

			await env.fs.mkdir(dir, { recursive: true });

			return 0;
		},

		chdir: async (target: string) => {
			try {
				const newDir = fullDirectory(env.workingDirectory, target);
				env.workingDirectory = newDir;
				return 0;
			} catch (e) {
				return -1;
			}
		},

		getcwd: () => {
			return String(env.workingDirectory);
		},

		// --- Process & Execution Calls ---
		exec: async (
			directory: string,
			execArgs: string[] = [],
			stdin?: any,
			options: { username?: string; password?: string } = {}
		) => {
			const dir = fullDirectory(env.workingDirectory, directory);
			return await env.execute(dir, execArgs, {
				input: stdin
			});
		},

		getpid: async () => {
			const self = await env.self();
			return self.pid;
		},

		whoami: async () => {
			return "hermes";
		},

		usrinf: async (name?: string) => {
			return {
				sysDir: "/System",
				homeDir: "/Users/hermes",
				username: name || "hermes"
			};
		},

		chusr: () => {
			debug(`chusr`);
			throw new Error("Not supported");
		},

		// --- System Information Calls ---
		uname: () => {
			return {
				sysname: "Constellation",
				release: "v0.5.0"
			};
		},

		sysinfo: async () => {
			const uptime = await env.systemStats.uptime();
			const procs = await env.processes();

			return {
				uptime,
				totalRam: 0,
				freeRam: 0,
				usedRam: 0,
				procs: procs.length
			};
		},

		gethostname: async () => {
			const content = await env.fs.readFile(
				"/System/info/hostname",
				"text"
			);
			return content ? String(content) : "constellation";
		},

		sethostname: async (hostname: string) => {
			try {
				await env.fs.writeFile("/System/info/hostname", hostname);
				return 0;
			} catch (e) {
				return -1;
			}
		},

		// --- Messaging & IPC ---
		send: async (targetPID: number, content: any) => {
			debug("send", `${targetPID}`, JSON.stringify(content));

			const self = await env.self();
			if (!messages[targetPID]) {
				messages[targetPID] = [];
			}

			messages[targetPID].push({
				origin: self.pid,
				content: structuredClone(content),
				sent: Date.now()
			});
		},

		readMsgs: async (deleteAfterRead: boolean = true) => {
			const self = await env.self();
			const pid = self.pid;

			if (!messages[pid]) {
				messages[pid] = [];
			}

			const data = structuredClone(messages[pid]);

			if (deleteAfterRead) {
				messages[pid] = [];
			}

			return data;
		},

		shout: async (name: string) => {
			const self = await env.self();
			processNames[self.pid] = name;
		},

		pidOfName: (name: string) => {
			const entries = Object.entries(processNames);
			const found = entries.find(([_, val]) => val === name);
			return found ? Number(found[0]) : NaN;
		},

		// --- Path Utility ---
		fullDirectory: (location: string) => {
			return fullDirectory(env.workingDirectory, location);
		},

		// devices
		claimDevice(deviceName: string) {
			debug("claim", deviceName);

			if (deviceName in mockDevices) {
				const device = mockDevices[deviceName];

				device.owner = 1;
			} else {
				throw new Error(
					"Device " + deviceName + " is not a valid device."
				);
			}
		},
		releaseDevice(deviceName: string) {
			debug("release", deviceName);

			if (deviceName in mockDevices) {
				const device = mockDevices[deviceName];

				if (device.owner == 1) {
					device.owner = 0;
				}
			} else {
				throw new Error(
					"Device " + deviceName + " is not a valid device."
				);
			}
		},
		async deviceRope(
			deviceName: string,
			ropeName: string,
			args: any[] = []
		) {
			debug("rope", deviceName, ropeName, JSON.stringify(args));

			const dev = mockDevices[deviceName];
			if (!dev)
				throw new Error(
					"Device " + deviceName + " is not a valid device."
				);

			if (dev.owner !== 1) {
				throw new Error("You do not own device " + deviceName);
			}

			if (ropeName in dev.ropes) {
				const ropeResult = await dev.ropes[ropeName](...args);
				return ropeResult;
			} else {
				throw new Error(
					"Ropee " +
						deviceName +
						" is not a valid rope for this device."
				);
			}
		}
	};

	const mockDevices: Record<
		string,
		{
			owner: number;
			ropes: Record<string, (...args: any[]) => Promise<any>>;
		}
	> = {
		eth0: {
			owner: 0,
			ropes: {
				async get(url: string) {
					const request = await env.network.request("get", url);

					if (request.isOk) {
						return request.response;
					} else {
						throw new Error(
							`HTTP Error ${request.statusCode}: ${request.statusText}`
						);
					}
				}
			}
		}
	};

	return calls;
}
