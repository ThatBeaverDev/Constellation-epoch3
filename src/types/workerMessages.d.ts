// Types for messages sent by workers.

import {
	InputConfig_BoolOnPaste,
	Log,
	NetworkRequestType,
	Sound
} from "../util/types/worker";

export interface WorkerEnv_Exec {
	path: string;
	args?: string[];
	input?: Log[];

	parentPid: number;
	handoverDisplayPid?: number;

	workingDirectory: string;
}

export interface WorkerEnv_Input {
	pid: number;
	message: string;
	config: InputConfig_BoolOnPaste;
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
	initiatorPid: number;
	socketDirectory: string;
}

// Client disconnecting
export interface Worker_Sockets_Client_endConnection {
	initiatorPid: number;
	socketId: number;
}

// Client sending packet
export interface Worker_Sockets_Client_sendPacket {
	initiatorPid: number;
	socketId: number;
	payload: unknown;
}

// Server initialisation

export interface Worker_Sockets_Server_newServer {
	initiatorPid: number;
	socketDirectory: string;
}

// Server disconnecting
export interface Worker_Sockets_Server_endServer {
	initiatorPid: number;
	socketId: number;
}

// Server sending packet
export interface Worker_Sockets_Server_sendPacket {
	initiatorPid: number;
	socketId: number;
	targetPid: number;
	payload: unknown;
}

export interface Worker_Env_Get_LiveCanvas {
	width: number;
	height: number;
}
