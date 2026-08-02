// Types for messages sent by runtime.

import { EventMap, EventName, InputConfig, Log } from "@/types/worker";
import {
	Worker_Proxy_Input_Response,
	Worker_Sockets_Client_endConnection,
	Worker_Sockets_Client_newConnection,
	Worker_Sockets_Client_sendPacket,
	Worker_Sockets_Server_endServer,
	Worker_Sockets_Server_newServer,
	Worker_Sockets_Server_sendPacket
} from "../../worker/types/messages";
import { RuntimeMessageIntent } from "./intents";

interface RuntimeMessageMap {
	[RuntimeMessageIntent.begin_execution]: {
		data: RuntimeExecuteProgram;
		return: boolean;
	};

	[RuntimeMessageIntent.dispatch_frame]: {
		data: undefined;
		return: RuntimeExecLoopResponse;
	};

	[RuntimeMessageIntent.program_exit_inform]: {
		data: { pid: number; data?: any; logs: Log[] };
		return: void;
	};

	// sockets
	// client
	[RuntimeMessageIntent.socket_client_connected]: {
		data: Runtime_Sockets_Client_newConnection;
		return: void;
	};
	[RuntimeMessageIntent.socket_client_disconnected]: {
		data: Runtime_Sockets_Client_endConnection;
		return: void;
	};
	[RuntimeMessageIntent.socket_client_sent_packet]: {
		data: Runtime_Sockets_Client_sendPacket;
		return: void;
	};
	// server
	[RuntimeMessageIntent.socket_server_ended]: {
		data: Runtime_Sockets_Server_endServer;
		return: void;
	};
	[RuntimeMessageIntent.socket_server_sent_packet]: {
		data: Runtime_Sockets_Server_sendPacket;
		return: void;
	};

	[RuntimeMessageIntent.trigger_event]: {
		data: Runtime_Events_Trigger<any>;
		return: void;
	};

	// output proxies
	[RuntimeMessageIntent.proxy_log]: {
		data: Runtime_Proxy_Log;
		return: void;
	};
	[RuntimeMessageIntent.proxy_input]: {
		data: Runtime_Proxy_Input;
		return: Worker_Proxy_Input_Response;
	};
	[RuntimeMessageIntent.proxy_set_logs]: {
		data: Runtime_Proxy_Set_Logs;
		return: void;
	};
	[RuntimeMessageIntent.proxy_get_dimensions]: {
		data: Runtime_Proxy_Get_Dimensions;
		return?: { width: number; height: number };
	};
}

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
	code: string;
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
