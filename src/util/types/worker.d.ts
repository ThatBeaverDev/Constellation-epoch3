import {
	Runtime_Proxy_Input,
	Runtime_Proxy_Log
} from "../../types/runtimeMessages";
import { WorkerEnv_Network_Get } from "../../types/workerMessages";

type HexColour = string;
type LogSegment =
	| {
			// text
			type?: "string";
			text: string;

			colour?: HexColour;
			bold?: boolean;
			italic?: boolean;
	  }
	| {
			// URL image
			type: "image";
			url: string;

			/**
			 * width in lines
			 */
			width: number;

			/**
			 * height in lines
			 */
			height?: number | "auto";
	  }
	| {
			// file image
			type: "image";
			dir: string;

			/**
			 * width in lines
			 */
			width: number;

			/**
			 * height in lines
			 */
			height?: number | "auto";
	  }
	| {
			// live canvas
			type: "liveCanvas";
			id: number;

			/**
			 * width in lines
			 */
			width: number;

			/**
			 * height in lines
			 */
			height: number;
	  };

export type ArrayLog = LogSegment[];
export type Log = string | ArrayLog;

type NormalizedLog = LogSegment[];

interface BaseSound {
	volume?: number;
	start?: number;

	metadata?: {
		title?: string;
		artist?: string;
		album?: string;
		/**
		 * URL or Directory
		 */
		artwork?: string;
	};
}

export interface FileSound extends BaseSound {
	file: string;
}

export interface URLSound extends BaseSound {
	url: string;
}

export type Sound = FileSound | URLSound;

export interface KeyPressModifiers {
	/**
	 * Whether Control on Windows/Linux is pressed, Command on macOS. Also returns whether 'Meta' (super/windows) was pressed, due to implementation.
	 */
	control: boolean;
	/**
	 * Whether Alt on Windows/Linux is pressed, Option on macOS
	 */
	alt: boolean;
	/**
	 * Shift is pressed
	 */
	shift: boolean;
}

export interface InputConfig {
	hideTyping: boolean;
	leaveInputOnCompletion: boolean;
	inline: boolean;
	initialText: string;
}

export interface FileStats {
	size: number;
	type: "file" | "directory" | "socket";
	modified: number;
	created: number;
}

export type NetworkRequestType = "get" | "post";

export interface KeyPressData {
	name: string;

	alt: boolean;
	shift: boolean;
	ctrl: boolean;
	super: boolean;
}

interface EventDataTypes {
	keydown: KeyPressData;
	keyup: KeyPressData;
	resize: { width: number; height: number };
}

type EventMap = EventDataTypes;

type EventName = keyof EventMap;

type EventCallback<K extends EventName> = (data: EventMap[K]) => any;

export type NetworkDataResponse<T = any> =
	| {
			response: T;

			isOk: true;
			statusCode: number;
			statusText: string;
	  }
	| {
			errorResponse?: string | T;

			isOk: false;
			statusCode: number;
			statusText: string;
	  };

export interface WorkerOutputProxy {
	onLog: (type: Runtime_Proxy_Log["log"]["type"], log: Log) => any;

	onInput: (
		message: string,
		config?: Runtime_Proxy_Input["config"]
	) => string | Promise<string>;

	onSetLogs: (logs: Log[]) => void;

	getDimensions: () =>
		| Promise<{ width: number; height: number }>
		| { width: number; height: number };
}

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
	getLiveCanvas(
		width: number,
		height: number
	):
		| Promise<{ canvas: OffscreenCanvas; id: number }>
		| { canvas: OffscreenCanvas; id: number };

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
	 * Set the logs to a list, clearing old logs.
	 * @param logs Logs to set content to.
	 */
	setLogs(logs?: Log[]): void;

	terminalDimensions(): Promise<{ width: number; height: number }>;

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

	triggerEvent<K extends EventName>(name: K, data: EventMap[K]): void;
	addEventListener<K extends EventName>(
		name: K,
		callback: EventCallback<K>
	): void;
	removeEventListener<K extends EventName>(
		name: K,
		callback: EventCallback<K>
	): void;

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
			outputProxy?: undefined;
		}
	): Promise<{
		onExit: Promise<{ return?: Log; logs: Log[] }>;
	}>;
	execute(
		path: string,
		args?: string[],
		config?: {
			handOverDisplay?: boolean;
			input?: Log[];
			outputProxy: WorkerOutputProxy;
		}
	): Promise<{
		onExit: Promise<{ return?: Log; logs: Log[] }>;
		triggerProxyEvent<K extends "keydown" | "keyup" | "resize">(
			name: K,
			data: EventMap[K]
		): void;
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
			headers?: Record<string, string>,
			options?: WorkerEnv_Network_Get["options"]
		): Promise<NetworkDataResponse<string>>;
		request<T = Object>(
			type: NetworkRequestType,
			url: string,
			format: "json",
			body?: Object,
			headers?: Record<string, string>,
			options?: WorkerEnv_Network_Get["options"]
		): Promise<NetworkDataResponse<T>>;
		request(
			type: NetworkRequestType,
			url: string,
			format: "datauri",
			body?: Object,
			headers?: Record<string, string>,
			options?: WorkerEnv_Network_Get["options"]
		): Promise<NetworkDataResponse<string>>;
		request<T = Object>(
			type: NetworkRequestType,
			url: string,
			format?: "text" | "json" | "datauri",
			body?: Object,
			headers?: Record<string, string>,
			options?: WorkerEnv_Network_Get["options"]
		): Promise<NetworkDataResponse<string | T>>;
	};

	systemStats: {
		uptime(): Promise<number>;

		kernelVersion(): Promise<string>;
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

	/**
	 * Exits the process
	 */
	exit(): void;
}

export interface SocketServer<
	OutgoingType extends Object = any,
	IncomingType extends Object = any
> {
	directory: string;

	onClientConnect?: (client: { pid: number }) => any;
	onClientDisconnect?: (client: { pid: number }) => any;

	onMessage:
		undefined | ((client: { pid: number }, payload: IncomingType) => any);
	sendMessage(clientPid: number, payload: OutgoingType): void;

	exit(): void;
}
export interface SocketConnection<
	OutgoingType extends Object = any,
	IncomingType extends Object = any
> {
	directory: string;

	onMessage?: (payload: IncomingType) => void;
	onClose?: () => void;

	sendMessage(payload: OutgoingType): void;

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

	inputRequest?: {};

	socketConnections: { connection: SocketConnection; socketId: number }[];
	socketServers: { server: SocketServer; socketId: number }[];

	liveCanvasIds: number[];

	outputProxyHandlers: Partial<Record<number, WorkerOutputProxy>>;

	onExit: (() => any)[];
	exit?: boolean;
}

export type ConstellationProgram = (
	env: Environment,
	args: string[],
	input?: Log[]
) => Generator<any, Log, unknown> | AsyncGenerator<any, Log, unknown> | Log;
