import { Environment } from "../util/types/worker";

export default async function* liveCanvasTester(env: Environment) {
	const canvasWidth = 1600;
	const canvasHeight = 900;
	const canvasAspect = canvasHeight / canvasWidth;

	const { canvas, id: canvasId } = await env.getLiveCanvas(
		canvasWidth,
		canvasHeight
	);

	const ctx = canvas.getContext("2d");
	if (!ctx) return "no ctx given";

	ctx.fillStyle = "red";
	ctx.fillText("Hello, World!", 500, 500);

	const perfectFrameTime = 1000 / 60;
	let deltaTime = 0;
	let lastTimestamp = 0;

	env.print([
		{
			type: "liveCanvas",
			id: canvasId,
			width: 100,
			height: 100 * canvasAspect
		}
	]);

	function update(timestamp: number) {
		if (!ctx) return;

		requestAnimationFrame(update);
		deltaTime = (timestamp - lastTimestamp) / perfectFrameTime;
		lastTimestamp = timestamp;

		ctx.clearRect(0, 0, canvasWidth, canvasHeight);
		ctx.font = "30px monospace";

		const text = `${Date.now()}`;

		ctx.fillText(text, 0, 30);
	}
	requestAnimationFrame(update);

	while (true) yield;
}
