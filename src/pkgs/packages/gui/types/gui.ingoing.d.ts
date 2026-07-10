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
	contents: WindowContentItem[];
	windowID?: number;
}

export type GuiIngoing = GuiNewWindowIngoing | GuiSetWindowContentsIngoing;
