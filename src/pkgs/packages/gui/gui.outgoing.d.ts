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

export type GuiOutgoing = GuiKeypressOutgoing | GuiWindowCloseOutgoing;
