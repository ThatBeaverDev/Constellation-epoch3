interface BasePacket {
	responder?: string;
}

interface in_claimPortPacket extends BasePacket {
	intent: "claimPort";
	port: string;
}

interface in_releasePortPacket extends BasePacket {
	intent: "releasePort";
	port: string;
}

interface in_sendPrivateMessage extends BasePacket {
	intent: "sendPrivateMessage";
	targetSocketUser: string;
	payload: string;
	targetPort: string;
	outgoingPort: string;
}

interface in_ListUsers extends BasePacket {
	intent: "listUsers";
}

interface in_Get_User extends BasePacket {
	intent: "getUser";
}

interface in_Token extends BasePacket {
	intent: "token";
	token: string;
}

interface in_awaitInit extends BasePacket {
	intent: "awaitInit";
}

export type in_Message =
	| in_claimPortPacket
	| in_releasePortPacket
	| in_sendPrivateMessage
	| in_ListUsers
	| in_Get_User
	| in_Token
	| in_awaitInit;
