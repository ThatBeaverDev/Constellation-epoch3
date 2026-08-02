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
} from "@/types/worker";
import { WorkerMessageIntent } from "./intents";

interface WorkerMessageMap {
	[WorkerMessageIntent.log]: {
		data: { data: Log };
		return: void;
	};
	[WorkerMessageIntent.warn]: {
		data: { data: Log };
		return: void;
	};
	[WorkerMessageIntent.error]: {
		data: { data: Log };
		return: void;
	};

	[WorkerMessageIntent.execute_program]: {
		data: {
			path: string;
			args?: string[];
			input?: Log[];

			handoverDisplayPid?: number;
			outputProxy: boolean;

			workingDirectory: string;
			user?: { uid: number; password: string };
		};
		return: { pid: number };
	};
	[WorkerMessageIntent.get_all_processes]: {
		data: void;
		return: Process[];
	};
	[WorkerMessageIntent.get_self_process]: {
		data: void;
		return: Process;
	};
	[WorkerMessageIntent.get_parent_process]: {
		data: void;
		return: Process | undefined;
	};
	[WorkerMessageIntent.env_network_get]: {
		data: WorkerEnv_Network_Get;
		return: NetworkDataResponse;
	};
	[WorkerMessageIntent.get_input]: {
		data: WorkerEnv_Input;
		return: string;
	};
	[WorkerMessageIntent.set_logs]: {
		data: Worker_Env_Set_Logs;
		return: void;
	};
	[WorkerMessageIntent.terminal_dimensions]: {
		data: undefined;
		return: { width: number; height: number };
	};
	[WorkerMessageIntent.kernel_uptime]: {
		data: void;
		return: number;
	};
	[WorkerMessageIntent.kernel_version]: {
		data: void;
		return: string;
	};
	[WorkerMessageIntent.ping]: {
		data: void;
		return: void;
	};
	[WorkerMessageIntent.play_sound]: {
		data: WorkerEnv_PlaySound;
		return: { id: number; duration: number };
	};
	[WorkerMessageIntent.pause_sound]: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	[WorkerMessageIntent.resume_sound]: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	[WorkerMessageIntent.remove_sound]: {
		data: WorkerEnv_SoundAction;
		return: void;
	};
	[WorkerMessageIntent.get_live_canvas]: {
		data: Worker_Env_Get_LiveCanvas;
		return: {
			canvas: OffscreenCanvas;
			id: number;
		};
	};
	[WorkerMessageIntent.remove_live_canvas]: {
		data: { id: number };
		return: void;
	};

	// sockets
	[WorkerMessageIntent.socket_connect]: {
		data: Worker_Sockets_Client_newConnection;
		return: number;
	};
	[WorkerMessageIntent.socket_disconnect]: {
		data: Worker_Sockets_Client_endConnection;
		return: void;
	};
	[WorkerMessageIntent.send_socket_packet_to_server]: {
		data: Worker_Sockets_Client_sendPacket;
		return: void;
	};
	[WorkerMessageIntent.create_socket]: {
		data: Worker_Sockets_Server_newServer;
		return: number;
	};
	[WorkerMessageIntent.end_socket]: {
		data: Worker_Sockets_Server_endServer;
		return: void;
	};
	[WorkerMessageIntent.send_socket_packet_to_client]: {
		data: Worker_Sockets_Server_sendPacket;
		return: void;
	};

	// proxies
	[WorkerMessageIntent.trigger_proxy_event]: {
		data: Worker_Proxy_Trigger_Event<any>;
		return: void;
	};

	[WorkerMessageIntent.exit]: {
		data: { data?: any };
		return: void;
	};

	// workerFS
	[WorkerMessageIntent.fs_readFile]: {
		data: { path: string; format?: "text" | "json" };
		return: string | any | void;
	};
	[WorkerMessageIntent.fs_writeFile]: {
		data: { path: string; contents: string };
		return: void;
	};
	[WorkerMessageIntent.fs_unlink]: {
		data: { path: string };
		return: void;
	};
	[WorkerMessageIntent.fs_get_metadata_entry]: {
		data: { path: string; entry: string };
		return: string | void;
	};
	[WorkerMessageIntent.fs_set_metadata_entry]: {
		data: { path: string; entry: string; value: string | undefined };
		return: void;
	};
	[WorkerMessageIntent.fs_list_metadata_entries]: {
		data: { path: string };
		return: string[] | void;
	};
	[WorkerMessageIntent.fs_mkdir]: {
		data: { path: string; options?: { recursive?: boolean } };
		return: boolean;
	};
	[WorkerMessageIntent.fs_createAlias]: {
		data: { path: string; targetPath: string };
		return: boolean;
	};
	[WorkerMessageIntent.fs_readdir]: {
		data: { path: string };
		return: string[];
	};
	[WorkerMessageIntent.fs_rmdir]: {
		data: { path: string };
		return: void;
	};
	[WorkerMessageIntent.fs_rm]: {
		data: { path: string };
		return: void;
	};
	[WorkerMessageIntent.fs_isdir]: {
		data: { path: string };
		return: boolean;
	};
	[WorkerMessageIntent.fs_exists]: {
		data: { path: string };
		return: boolean;
	};
	[WorkerMessageIntent.fs_stats]: {
		data: { path: string };
		return: FileStats | undefined;
	};

	[WorkerMessageIntent.change_password]: {
		data: { uid: number; newPassword: string };
		return: boolean;
	};
	[WorkerMessageIntent.validate_password]: {
		data: { uid: number; password: string };
		return: boolean;
	};
}

export interface WorkerEnv_Input {
	message: string;
	config: InputConfig;
}

export interface WorkerEnv_Network_Get {
	type: NetworkRequestType;
	url: string;
	format: "text" | "json" | "datauri" | "blob";
	body?: Object;
	headers?: Record<string, string>;
	options: {
		cache?: boolean;
	};
}

// sound types

export interface WorkerEnv_PlaySound {
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
	logs?: Log[];
}

export interface Worker_Env_ProcessInfo {
	pid: number;
}
