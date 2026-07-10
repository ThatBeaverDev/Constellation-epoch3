export interface GuiKeypressOutgoing {
	intent: "keypress";
	data: {
		name: string;
		alt: boolean;
		shift: boolean;
	};
}

export interface GuiWindowCloseOutgoing {
	intent: "windowClose";
	windowID: number;
}

export interface GuiTextboxCompleteOutgoing {
	intent: "textboxComplete";
	windowID: number;

	reference: string;
	contents: string;
}

export interface GuiTextboxValueChangeOutgoing {
	intent: "textboxValueChange";
	windowID: number;

	reference: string;
	contents: string;
}

export interface GuiButtonPressOutgoing {
	intent: "onButtonPress";
	windowID: number;

	reference: string;
}

export type GuiOutgoing =
	| GuiKeypressOutgoing
	| GuiWindowCloseOutgoing
	| GuiTextboxCompleteOutgoing
	| GuiTextboxValueChangeOutgoing
	| GuiButtonPressOutgoing;
