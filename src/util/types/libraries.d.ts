import { WindowContentItem } from "./windowContents";
import { Environment } from "./worker";

type LibGuiConstructor = {
	new (env: Environment): LibGui;

	readonly windowFill: string;
	readonly focusedWindowStroke: string;
	readonly unfocusedWindowStroke: string;
};

export interface LibGui {
	onTextboxCompletion?: (contents: string, reference: string) => any;
	onTextboxValueChange?: (contents: string, reference: string) => any;
	onButtonPress?: (
		reference: string,
		triggerMethod: "space" | "enter"
	) => any;
	onKeyPress?: (event: { name: string; alt: boolean; shift: boolean }) => any;

	env: Environment;

	dimensions: { width: number; height: number };

	guiAvailable(): Promise<boolean>;

	init(name?: string): Promise<void>;

	setContents(contents: WindowContentItem[]): Promise<void>;

	setPointerPosition(pos?: number): void;

	awaitInputResponse(responder: string): Promise<string>;

	setTextboxContents(reference: string, contents: string): void;

	close(): void;
}

export interface LibraryExports {
	"lib-gui": { default: LibGuiConstructor };
}
