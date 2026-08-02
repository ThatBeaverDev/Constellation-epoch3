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
