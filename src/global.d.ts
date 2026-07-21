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
