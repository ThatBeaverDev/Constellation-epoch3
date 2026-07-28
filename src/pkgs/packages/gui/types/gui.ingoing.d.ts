import { AppMetadata } from "../../../../util/lib/appMetadata";
import { WindowContentItem } from "./windowContents";

export interface GuiBaseIngoing {
	responder: string;
}

export interface GuiNewWindowIngoing {
	intent: "newWindow";

	name?: string;
	metadata?: AppMetadata;
}

export interface GuiSetWindowContentsIngoing {
	intent: "setWindowContents";
	contents: Partial<WindowContentItem[]>;
	windowID: number;
}

export interface GuiSetTextboxContentsIngoing {
	intent: "setTextboxContents";
	reference: string;
	contents: string;
	windowID: number;
}

export interface GuiResetPointerIngoing {
	intent: "resetPointer";
	windowID: number;
	pos?: number;
}

export interface GuiScreenInfoIngoing {
	intent: "screenInfo";
}

export type GuiIngoing =
	| GuiNewWindowIngoing
	| GuiSetWindowContentsIngoing
	| GuiSetTextboxContentsIngoing
	| GuiResetPointerIngoing
	| GuiScreenInfoIngoing;
