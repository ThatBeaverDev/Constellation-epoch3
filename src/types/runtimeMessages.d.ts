import { KeyPressModifiers, Log } from "../ui/ui";
import { onPasteData } from "./worker";

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
