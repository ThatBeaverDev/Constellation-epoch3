import { KeyPressModifiers, Log } from "../ui/ui";
import { onPasteData } from "./worker";

// Types for messages sent by runtime.

export interface RuntimeProgramLogEvent {
	type: "log" | "warning" | "error";
	data: Log;
	handler: number;
	origin: number;
}
export interface RuntimeExecuteProgram {
	directory: string;
	pid: number;

	args?: string[];
	workingDirectory: string;
}

export interface RuntimeProgramInputEvent {
	origin: number;
	handler: number;

	message: string;
}

export interface RuntimeProgramInputOnPaste {
	pid: number;

	data: onPasteData;
}
