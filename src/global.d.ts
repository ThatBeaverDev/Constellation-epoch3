declare module "*.html" {
	const content: string;
	export default content;
}

declare module "*.css" {
	const content: string;
	export default content;
}

declare module "web-worker:*" {
	const WorkerFactory: {
		new (): Worker;
	};
	export default WorkerFactory;
}

declare const process: { cwd(): string; exit(): void };

declare interface Worker {
	on: (event: "message", handler: Function) => void;
}

// fix since `sync-message` uses it but we can't use lib.webworker as it explodes due to lib.dom
declare interface FetchEvent {}
