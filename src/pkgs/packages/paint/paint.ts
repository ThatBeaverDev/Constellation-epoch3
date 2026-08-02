import { Environment } from "@/types/worker";
import { PaintState } from "./types";
import { inputHandler } from "./input";
import { initCanvas } from "./initCanvas";

export default async function* microsoftPaint(
	env: Environment,
	[file = ".__non_entered"]: [string]
) {
	const sideBlocks = Number(await env.input("Side lengths: "));
	if (isNaN(sideBlocks)) {
		return "Side length must be a number.";
	}

	const s: PaintState = {
		canvasWidth: 1024,
		canvasHeight: 1024,

		sideBlocks: sideBlocks,

		incrementX: 0,
		incrementY: 0,

		penDown: true,
		penColour: "red",

		penX: 0,
		penY: 0,

		drawingCanvas: undefined as any,
		drawingCtx: undefined as any,

		displayCanvas: undefined as any,
		displayCtx: undefined as any,

		exit: false
	};

	s.incrementX = s.canvasWidth / s.sideBlocks;
	s.incrementY = s.canvasHeight / s.sideBlocks;

	const {
		drawingCanvas,
		drawingCtx,

		displayCanvas,
		displayCtx,

		canvasId
	} = await initCanvas(
		env,
		s.canvasWidth,
		s.canvasHeight,
		s.incrementX,
		s.incrementY,
		file
	);

	s.drawingCanvas = drawingCanvas;
	s.drawingCtx = drawingCtx;

	s.displayCanvas = displayCanvas;
	s.displayCtx = displayCtx;

	env.addEventListener("keydown", inputHandler(env, s));

	env.addEventListener("resize", async (dimensions) => {
		env.clearLogs();
		env.print([
			{
				text: "Commands:\n\n- W: Move cursor up by one\n- A: Move cursor left by one\n- S: Move cursor down by one\n- D: Move cursor right by one\n\n- Q - Move Brush Down (start drawing)\n- E - Move Brush Up (stop drawing)\n- C - Set colour\n\n- X - Exit\n- R - Save image.\n"
			},
			{
				type: "liveCanvas",
				id: canvasId,
				width: dimensions.width / 15,
				height: dimensions.height / 15 - 13
			}
		]);
	});

	env.triggerEvent("resize", await env.terminalDimensions());
	env.triggerEvent("keydown", {
		name: "e",
		alt: false,
		shift: false,
		ctrl: false,
		super: false
	});
	while (true) {
		if (s.exit == true) break;

		yield;
	}
}
