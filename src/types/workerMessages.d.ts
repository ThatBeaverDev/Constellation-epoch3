// Types for messages sent by workers.

import {
	EventMap,
	EventName,
	InputConfig,
	Log,
	NetworkRequestType,
	Sound
} from "../util/types/worker";

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
