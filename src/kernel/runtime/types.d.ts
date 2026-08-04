import { FileStats, InputConfig, Log, User } from "@/types/worker";
import { UiManager } from "../ui/ui";
import { RuntimeMessageMap } from "../types/messages";
import { RuntimeMessageIntent } from "../types/intents";
import { PlaySoundResponse } from "../ui/dom";
import { Channel } from "sync-message";

export interface ProgramLog {
	type: "log" | "warning" | "error";
	data: Log;
}
export interface ProgramInputLog {
	type: "input";
	message: string;
	config: InputConfig;
	callback(value: Awaited<ReturnType<UiManager["input"]>>): void;
}

export interface ProgramStore {
	readonly worker: WorkerStore;

	parent?: ProgramStore;
	children: Set<ProgramStore>;

	readonly pid: number;
	readonly user: User;
	readonly directory: string;
	readonly startTime: Date;

	onExit: (data?: any) => void;

	logs: (ProgramLog | ProgramInputLog)[];

	onLog(type: "log" | "warning" | "error", data: Log): void;
	onInput(message: string, config: InputConfig): Promise<string>;
	onSetLogs(logs?: Log[]): void;
	getTerminalDimensions(): Promise<{ width: number; height: number }>;

	liveCanvasIds: number[];
}

export interface WorkerStore {
	worker: Worker;
	totalPrograms: number;

	sharedArrayBuffer: SharedArrayBuffer;
	atomicChannel: Channel;

	id: number;
	name: string;
	lock: boolean;

	program?: ProgramStore;

	sendMessage: <Intent extends RuntimeMessageIntent>(
		intent: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	) => Promise<RuntimeMessageMap[Intent]["return"]>;
	emit: <Intent extends RuntimeMessageIntent>(
		event: Intent,
		data: RuntimeMessageMap[Intent]["data"]
	) => void;
	exit(): void;
}

interface ProgramConfig {
	displayHandover?: { oldOwner?: number };
	workingDirectory: string;
	input?: Log[];
	outputProxy?: number;
}

export type RuntimeSoundsStore = Map<
	number,
	{ program: ProgramStore; info: PlaySoundResponse }
>;

export interface SyncReadFileResponse {
	contents: string | undefined;
}

export interface SyncReaddirResponse {
	contents: string[] | undefined;
}

export interface SyncStatResponse {
	stats: FileStats | undefined;
}
