import { KeyPressModifiers, Log } from "../ui/ui";
import { EventMap, EventName, onPasteData } from "./worker";
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

export interface RuntimeProgramInputOnPaste {
	pid: number;

	data: onPasteData;
}

/* ========== Sockets ========== */

// Client connecting
export interface Runtime_Sockets_Client_newConnection extends Worker_Sockets_Client_newConnection {
	socketId: number;
}

// Client disconnecting
export interface Runtime_Sockets_Client_endConnection extends Worker_Sockets_Client_endConnection {}

// Client sending packet
export interface Runtime_Sockets_Client_sendPacket extends Worker_Sockets_Client_sendPacket {}

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
