import { InputConfig, Log, Sound } from "@/types/worker";
import { ProgramStore } from "../runtime/types";
import { PlaySoundResponse } from "./dom";

export interface UiManager {
	log(source: string, message: Log): void;
	warn(source: string, message: Log): void;
	error(source: string, message: Log, console?: boolean): void;

	clear(): void;
	cancelInput?(): void;
	input(
		message: string,
		config: InputConfig
	): Promise<{ response: string; finished: true } | { finished: false }>;

	controller?: ProgramStore;

	playSound?(config: Sound): Promise<PlaySoundResponse>;
	cancelSounds?(): void;

	getLiveCanvas?(
		width: number,
		height: number,
		onRemoval?: () => void
	): { canvas: OffscreenCanvas; id: number };
	removeLiveCanvas?(id: number): void;

	exit(): Promise<void> | void;
}
