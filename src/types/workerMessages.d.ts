import { transferrableMarkerSymbol } from "../lib/workerUtils";
import {
	EventMap,
	EventName,
	FileStats,
	InputConfig,
	Log,
	NetworkDataResponse,
	NetworkRequestType,
	Process,
	Sound
} from "../util/types/worker";
import { Runtime_Sockets_Server_sendPacket } from "./runtimeMessages";

// Types for messages sent by workers.

interface WorkerMessageDataTypes {
	program_log: {
		data: { data: Log };
		return: void;
	};
	program_warn: {
		data: { data: Log };
		return: void;
	};
	program_error: {
		data: { data: Log };
		return: void;
	};

	env_exec: {
		data: WorkerEnv_Exec;
		return: { pid: number };
	};
	env_processes: {
		data: void;
		return: Process[];
	};
	env_selfProcess: {
		data: void;
		return: Process;
	};
	env_parent_process: {
		data: void;
		return: Process | undefined;
	};
	env_network_get: {
		data: WorkerEnv_Network_Get;
		return: NetworkDataResponse;
	};
	env_input: {
		data: WorkerEnv_Input;
		return: string;
	};
	env_clear_logs: { data: void; return: void };
	kernel_uptime: {
		data: void;
		return: number;
	};
	kernel_version: {
		data: void;
		return: string;
	};
	keepAlive: {
		data: void;
		return: void;
	};
	env_sound_play: {
		data: WorkerEnv_PlaySound;
		return: { id: number; duration: number };
	};
	env_sound_pause: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	env_sound_resume: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	env_sound_remove: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	env_get_liveCanvas: {
		data: Worker_Env_Get_LiveCanvas;
		return: {
			canvas: OffscreenCanvas;
			id: number;
		};
	};
	env_remove_liveCanvas: {
		data: { id: number };
		return: void;
	};

	// sockets
	"Sockets/Client/newConnection": {
		data: Worker_Sockets_Client_newConnection;
		return: number;
	};
	"Sockets/Client/endConnection": {
		data: Worker_Sockets_Client_endConnection;
		return: void;
	};
	"Sockets/Client/sendPacket": {
		data: Worker_Sockets_Client_sendPacket;
		return: void;
	};
	"Sockets/Server/newServer": {
		data: Worker_Sockets_Server_newServer;
		return: number;
	};
	"Sockets/Server/endServer": {
		data: Worker_Sockets_Server_endServer;
		return: void;
	};
	"Sockets/Server/sendPacket": {
		data: Runtime_Sockets_Server_sendPacket;
		return: void;
	};

	// proxies
	proxy_trigger_event: {
		data: Worker_Proxy_Trigger_Event<any>;
		return: void;
	};

	termination: {
		data: { data?: any };
		return: void;
	};

	// workerFS
	fs_readFile: {
		data: { path: string; format?: "text" | "json" };
		return: string | any | void;
	};
	fs_writeFile: {
		data: { path: string; contents: string };
		return: void;
	};
	fs_unlink: {
		data: { path: string };
		return: void;
	};
	fs_mkdir: {
		data: { path: string; options?: { recursive?: boolean } };
		return: boolean;
	};
	fs_readdir: {
		data: { path: string };
		return: string[];
	};
	fs_rmdir: {
		data: { path: string };
		return: void;
	};
	fs_rm: {
		data: { path: string };
		return: void;
	};
	fs_isdir: {
		data: { path: string };
		return: boolean;
	};
	fs_exists: {
		data: { path: string };
		return: boolean;
	};
	fs_stats: {
		data: { path: string };
		return: FileStats | undefined;
	};
}

export type WorkerMessageMap = WorkerMessageDataTypes;
export type WorkerMessageIntent = keyof WorkerMessageMap;

export interface WorkerEnv_Exec {
	path: string;
	args?: string[];
	input?: Log[];

	handoverDisplayPid?: number;
	outputProxy: boolean;

	workingDirectory: string;
}

export interface WorkerEnv_Input {
	message: string;
	config: InputConfig;
}

export interface WorkerEnv_Network_Get {
	type: NetworkRequestType;
	url: string;
	format: "text" | "json" | "datauri";
	body?: Object;
	headers?: Record<string, string>;
	options: {
		cache?: boolean;
	};
}

// sound types

export interface WorkerEnv_PlaySound {
	pid: number;
	config: Sound;
}

export interface WorkerEnv_SoundAction {
	soundID: number;
}

export interface WorkerEnv_SoundRemove {
	soundID: number;
}

/* ========== Sockets ========== */

// Client connecting
export interface Worker_Sockets_Client_newConnection {
	socketDirectory: string;
}

// Client disconnecting
export interface Worker_Sockets_Client_endConnection {
	socketId: number;
}

// Client sending packet
export interface Worker_Sockets_Client_sendPacket {
	socketId: number;
	payload: unknown;
}

// Server initialisation

export interface Worker_Sockets_Server_newServer {
	socketDirectory: string;
}

// Server disconnecting
export interface Worker_Sockets_Server_endServer {
	socketId: number;
}

// Server sending packet
export interface Worker_Sockets_Server_sendPacket {
	socketId: number;
	targetPid: number;
	payload: unknown;
}

export interface Worker_Env_Get_LiveCanvas {
	width: number;
	height: number;
}

export type Worker_Proxy_Input_Response =
	| {
			response: string;
			finished: true;
	  }
	| {
			finished: false;
	  };

export interface Worker_Proxy_Trigger_Event<K extends EventName> {
	/**
	 * In this case, the dispatcher
	 */
	handlerPid: number;
	/**
	 * In this case, the program that the proxy is attached to
	 */
	subjectPid: number;

	eventName: K;
	data: EventMap[K];
}

export interface Worker_Env_Set_Logs {
	pid: number;

	logs: Log[];
}

export interface Worker_Env_ProcessInfo {
	pid: number;
}
