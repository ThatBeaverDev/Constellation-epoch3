import { dataURItoBlob } from "@/lib/uri";
import { Environment } from "@/types/worker";

export async function initCanvas(
	env: Environment,

	canvasWidth: number,
	canvasHeight: number,

	incrementX: number,
	incrementY: number,

	file: string
) {
	const drawingCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const drawingCtx = drawingCanvas.getContext("2d");
	if (!drawingCtx) throw new Error("CTX not given.");
	drawingCtx.fillStyle = "black";
	drawingCtx.fillRect(0, 0, canvasWidth, canvasHeight);

	// draw file contents to drawing canvas
	const filepath = env.path.resolve(env.workingDirectory, file);
	if (!filepath.endsWith(".__non_entered")) {
		const filecontents = await env.fs.readFile(filepath);
		if (!filecontents) {
			throw new Error(`File '${file}' to load does not exist!`);
		}

		const blob = dataURItoBlob(filecontents);
		const bitmap = await createImageBitmap(blob);

		drawingCtx.drawImage(bitmap, 0, 0, canvasWidth, canvasHeight);
	}

	const { canvas: displayCanvas, id: canvasId } = await env.getLiveCanvas(
		canvasWidth + incrementX,
		canvasWidth + incrementY
	);
	const displayCtx = displayCanvas.getContext("2d");
	if (!displayCtx) throw new Error("CTX not given.");

	return {
		drawingCanvas,
		drawingCtx,
		displayCanvas,
		displayCtx,
		canvasId
	};
}
