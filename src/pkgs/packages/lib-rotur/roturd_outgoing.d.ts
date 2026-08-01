export interface out_PrivateMessagePacket {
	intent: "privateMessage";
	sender: {
		systemName: string;
		systemVersion: string;
		websocketName: string;
		roturName: string;

		incomingPort: string;
		outgoingPort: string;
	};
	timestamp: number;
	payload: any;
}

export interface out_ErrorPacket {
	intent: "error";
	message: string;
	responder?: string;
}

export interface out_SuccessPacket<T = any> {
	intent: "success";
	message: T;
	responder?: string;
}

export interface out_NeedAuthenticationPacket {
	intent: "needToken";
}

export type out_Packet =
	| out_PrivateMessagePacket
	| out_ErrorPacket
	| out_SuccessPacket
	| out_NeedAuthenticationPacket;
