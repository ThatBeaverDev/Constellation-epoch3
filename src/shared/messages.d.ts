export type RequestMessage = {
	kind: "request";
	id: number;
	intent: string | number;
	data?: any;
};

export type ResponseMessage = {
	kind: "response";
	id: number;
	success: boolean;
	result?: any;
	error?: string;
	errorName: string;
};

export type EventMessage = {
	kind: "event";
	event: string | number;
	data?: any;
};

export type Message = RequestMessage | ResponseMessage | EventMessage;

export type Pending = {
	intent: string | number;

	resolve: (v: any) => void;
	reject: (e: any) => void;
};

export type RequestHandler<T = any, K = any> = (data: T) => Promise<K> | K;
