export function rect(
	ctx: OffscreenCanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	fill?: string,
	stroke?: string
) {
	if (fill) {
		ctx.fillStyle = fill;

		ctx.fillRect(x, y, width, height);
	}
	if (stroke) {
		ctx.strokeStyle = stroke;

		ctx.strokeRect(x, y, width, height);
	}
}

export function text(
	ctx: OffscreenCanvasRenderingContext2D,
	x: number,
	y: number,
	text: string,
	colour: string = "white",
	font: string = "monospace",
	fontSize: number = 20
) {
	ctx.font = `${fontSize}px ${font}`;
	ctx.fillStyle = colour;
	ctx.textBaseline = "top";
	ctx.textAlign = "left";

	ctx.fillText(text, x, y);
}

export function measureText(
	ctx: OffscreenCanvasRenderingContext2D,
	text: string,
	font: string = "monospace",
	fontSize: number = 10
) {
	ctx.font = `${fontSize}px ${font}`;
	ctx.textBaseline = "top";
	ctx.textAlign = "left";
	const metrics = ctx.measureText(text);

	return {
		width: metrics.width,
		height:
			metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent
	};
}
