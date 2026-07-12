import { EventMap, EventName, InputConfig, Log } from "../util/types/worker";
import {
	Worker_Proxy_Input_Response,
	Worker_Sockets_Client_endConnection,
	Worker_Sockets_Client_newConnection,
	Worker_Sockets_Client_sendPacket,
	Worker_Sockets_Server_endServer,
	Worker_Sockets_Server_newServer,
	Worker_Sockets_Server_sendPacket
} from "./workerMessages";

// Types for messages sent by runtime.

interface RuntimeMessageDataTypes {
	executeProgram: {
		data: RuntimeExecuteProgram;
		return: boolean;
	};

	execLoop: {
		data: undefined;
		return: RuntimeExecLoopResponse;
	};

	program_exit: {
		data: { pid: number; data?: any; logs: Log[] };
		return: void;
	};

	// sockets
	// client
	"Sockets/Client/newConnection": {
		data: Runtime_Sockets_Client_newConnection;
		return: void;
	};
	"Sockets/Client/endConnection": {
		data: Runtime_Sockets_Client_endConnection;
		return: void;
	};
	"Sockets/Client/sendPacket": {
		data: Runtime_Sockets_Client_sendPacket;
		return: void;
	};
	// server
	"Sockets/Server/newServer": {
		data: void;
		return: void;
	};
	"Sockets/Server/endServer": {
		data: Runtime_Sockets_Server_endServer;
		return: void;
	};
	"Sockets/Server/sendPacket": {
		data: Runtime_Sockets_Server_sendPacket;
		return: void;
	};

	event_trigger: {
		data: Runtime_Events_Trigger<any>;
		return: void;
	};

	// output proxies
	proxy_log: {
		data: Runtime_Proxy_Log;
		return: void;
	};
	proxy_input: {
		data: Runtime_Proxy_Input;
		return: Worker_Proxy_Input_Response;
	};
	proxy_clear: {
		data: Runtime_Proxy_ClearLogs;
		return: void;
	};
}

export type RuntimeMessageMap = RuntimeMessageDataTypes;
export type RuntimeMessageIntent = keyof RuntimeMessageMap;

export interface RuntimeExecLoopResponse {
	programs: {
		pid: number;
		directory: string;
	}[];
	completePrograms: { pid: number }[];
	computePercentage: number;
}

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

export interface Runtime_Proxy_ClearLogs {
	handlerPid: number;
	subjectPid: number;
}
