export interface PaintState {
	canvasWidth: number;
	canvasHeight: number;

	sideBlocks: number;

	incrementX: number;
	incrementY: number;

	penDown: boolean;
	penColour: string;

	penX: number;
	penY: number;

	drawingCanvas: OffscreenCanvas;
	drawingCtx: OffscreenCanvasRenderingContext2D;

	displayCanvas: OffscreenCanvas;
	displayCtx: OffscreenCanvasRenderingContext2D;

	exit: boolean;
}
