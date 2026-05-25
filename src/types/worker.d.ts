import { FileStats } from "../lib/fs";
import { InputConfig, KeyPressModifiers, Log, Sound } from "../ui/ui";

export type NetworkRequestType = "get" | "post";

export interface Environment {
	/**
	 * Log an line to the console
	 * @param data Log text
	 */
	print(data: Log): void;
	/**
	 * Log an warning to the console
	 * @param data Warning text
	 */
	warn(data: Log): void;
	/**
	 * Log an error to the console
	 * @param data Error text
	 */
	error(data: Log): void;

	/**
	 * Request text input from the user. Requires input access.
	 * @param message Text prompt
	 * @returns User entry
	 */
	input: (
		message: string,
		config?: Partial<InputConfig>
	) => Promise<string> | never;

	/**
	 * Clear the display terminal. Requires input access.
	 */
	clearLogs(): void;

	/**
	 * Access to the system's filesystem
	 */
	fs: EnvironmentFilesystem;

	/**
	 * Path utilities
	 */
	path: {
		resolve(...args: string[]): string;
		join(...args: string[]): string;
		relative(from: string, to: string): string;

		normalize(path: string): string;
		isAbsolute(path: string): boolean;
		dirname(path: string): string;
		basename(path: string, ext: string): string;
		extname(path: string): string;

		format(pathObject: {
			root: string;
			dir: string;
			base: string;
			ext: string;
			name: string;
		}): string;
		parse(path: string): {
			root: string;
			dir: string;
			base: string;
			ext: string;
			name: string;
		};
	};

	/**
	 * Reassign me to change working directory.
	 */
	workingDirectory: string;

	/**
	 * Execute a program from a directory.
	 */
	execute(
		path: string,
		args?: string[],
		config?: {
			handOverDisplay?: boolean;
			input?: Log[];
		}
	): Promise<{
		onExit: Promise<{ return?: Log; logs: Log[] }>;
	}>;

	/**
	 * Provides a list of processes and basic information
	 */
	processes(): Promise<Process[]>;
	/**
	 * Provides the object for *this* process
	 */
	self(): Promise<Process>;
	/**
	 * Provides the object for the parent process.
	 */
	parent(): Promise<Process | undefined>;

	/**
	 * Networking related utilities
	 */
	network: {
		request(
			type: NetworkRequestType,
			url: string,
			format?: "text",
			body?: Object,
			headers?: Record<string, string>
		): Promise<string>;
		request<T = Object>(
			type: NetworkRequestType,
			url: string,
			format: "json",
			body?: Object,
			headers?: Record<string, string>
		): Promise<T>;
		request(
			type: NetworkRequestType,
			url: string,
			format: "datauri",
			body?: Object,
			headers?: Record<string, string>
		): Promise<string>;
		request<T = Object>(
			type: NetworkRequestType,
			url: string,
			format?: "text" | "json" | "datauri",
			body?: Object,
			headers?: Record<string, string>
		): Promise<string | T>;
	};

	systemStats: {
		uptime(): Promise<number>;

		workerStats(): Promise<
			{ id: number; processes: number; activeTime: number }[]
		>;

		kernelVersion(): Promise<number>;
	};

	sound: {
		play(config: Sound): Promise<{
			id: number;
			duration: number;
			onStop: Promise<number>;

			pause(): Promise<void>;
			resume(): Promise<void>;
			remove(): Promise<void>;
		}>;
	};

	sockets: {
		createSocket(directory: string): Promise<SocketServer>;
		connectToSocket(directory: string): Promise<SocketConnection>;
	};

	timers: {
		sleep(ms: number): Promise<void>;

		setInterval(callback: () => void, ms: number): number;

		clearInterval(id: number): void;
	};
}

export interface SocketServer {
	directory: string;

	onClientConnect?: (client: { pid: number }) => any;
	onClientDisconnect?: (client: { pid: number }) => any;

	onMessage: undefined | ((client: { pid: number }, payload: any) => any);
	sendMessage(clientPid: number, payload: any): void;

	exit(): void;
}
export interface SocketConnection {
	directory: string;

	onMessage?: (payload: any) => void;
	onClose?: () => void;

	sendMessage(payload: any): void;

	exit(): void;
}

export interface EnvironmentFilesystem {
	ready: boolean;
	waitForReady(): Promise<void>;

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
	writeFile(path: string, contents: string): Promise<any>;
	unlink(path: string): Promise<void>;

	mkdir(path: string, options?: { recursive?: boolean }): Promise<boolean>;
	readdir(path: string): Promise<string[]>;
	rmdir(path: string): Promise<void>;

	rm(path: string): Promise<void>;

	isDirectory(path: string): Promise<boolean>;
	exists(path: string): Promise<boolean>;

	stats(path: string): Promise<FileStats | undefined>;
}

export interface Process {
	pid: number;
	directory: string;
	startTime: Date;
	core: number;
}

export interface WorkerProgramStore {
	generator?:
		| Generator<Promise<any> | void, any, any>
		| AsyncGenerator<Promise<any> | void, any, any>;
	pid: number;
	directory: string;

	env: Environment;

	locked: boolean;
	passValue?: any;

	inputRequest?: {
		onPaste?: (data: onPasteData) => any;
	};

	socketConnections: { connection: SocketConnection; socketId: number }[];
	socketServers: { server: SocketServer; socketId: number }[];

	onExit: (() => any)[];
}

interface onPasteData {
	type: "text" | "image" | "file";
	data: string;
}

export type ConstellationProgram = (
	env: Environment,
	args: string[],
	input?: Log[]
) => Generator<any, Log, unknown> | AsyncGenerator<any, Log, unknown> | Log;
