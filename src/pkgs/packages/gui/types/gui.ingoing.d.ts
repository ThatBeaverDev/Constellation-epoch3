import { WindowContentItem } from "./windowContents";

export interface GuiBaseIngoing {
	responder: string;
}

export interface GuiNewWindowIngoing {
	intent: "newWindow";

	name: string;
}

export interface GuiSetWindowContentsIngoing {
	intent: "setWindowContents";
	contents: Partial<WindowContentItem[]>;
	windowID?: number;
}

export interface GuiSetTextboxContentsIngoing {
	intent: "setTextboxContents";
	reference: string;
	contents: string;
	windowID?: number;
}

export type GuiIngoing =
	| GuiNewWindowIngoing
	| GuiSetWindowContentsIngoing
	| GuiSetTextboxContentsIngoing;
