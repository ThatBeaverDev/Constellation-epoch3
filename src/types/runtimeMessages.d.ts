import { EventMap, EventName, InputConfig, Log } from "../util/types/worker";
import {
	Worker_Sockets_Client_endConnection,
	Worker_Sockets_Client_newConnection,
	Worker_Sockets_Client_sendPacket,
	Worker_Sockets_Server_endServer,
	Worker_Sockets_Server_newServer,
	Worker_Sockets_Server_sendPacket
} from "./workerMessages";

// Types for messages sent by runtime.

export interface RuntimeExecuteProgram {
	directory: string;
	pid: number;

	args?: string[];
	workingDirectory: string;
	input?: Log[];
}

/* ========== Sockets ========== */

// Client connecting
export interface Runtime_Sockets_Client_newConnection extends Worker_Sockets_Client_newConnection {
	socketId: number;
	initiatorPid: number;
}

// Client disconnecting
export interface Runtime_Sockets_Client_endConnection extends Worker_Sockets_Client_endConnection {
	initiatorPid: number;
}

// Client sending packet
export interface Runtime_Sockets_Client_sendPacket extends Worker_Sockets_Client_sendPacket {
	initiatorPid: number;
}

// Server initialisation

export interface Runtime_Sockets_Server_newServer extends Worker_Sockets_Server_newServer {}

// Server disconnecting
export interface Runtime_Sockets_Server_endServer extends Worker_Sockets_Server_endServer {}

// Server sending packet
export interface Runtime_Sockets_Server_sendPacket extends Worker_Sockets_Server_sendPacket {}

export interface Runtime_Events_Trigger<K extends EventName> {
	pid: number;
	name: K;
	data: EventMap[K];
}

export interface Runtime_Env_Get_LiveCanvas {
	canvas: OffscreenCanvas;
	id: number;
}

export interface Runtime_Proxy_Log {
	handlerPid: number;
	subjectPid: number;

	log: {
		type: "log" | "warning" | "error";
		data: Log;
	};
}

export interface Runtime_Proxy_Input {
	handlerPid: number;
	subjectPid: number;

	message: string;
	config?: InputConfig;
}

export interface Runtime_Proxy_Set_Logs {
	handlerPid: number;
	subjectPid: number;

	logs: Log[];
}

export interface Runtime_Sound_Stopped_ID {
	time: number;
}

export interface Runtime_Proxy_Get_Dimensions {
	handlerPid: number;
	subjectPid: number;
}
