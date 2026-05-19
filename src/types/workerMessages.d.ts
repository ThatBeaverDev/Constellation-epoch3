// Types for messages sent by workers.

import { InputConfig_BoolOnPaste, Log } from "../ui/ui";
import { NetworkRequestType } from "./worker";
import { Sound } from "../ui/ui";

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
}

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
