// Types for messages sent by workers.

import { InputConfig_BoolOnPaste } from "../ui/ui";
import { NetworkRequestType } from "./worker";

export interface WorkerEnv_Exec {
	path: string;
	args?: string[];

	parentPid: number;
	handoverDisplayPid?: number;

	workingDirectory: string;

	outputProxy: boolean;
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
}
