import { Log } from "../../../../util/types/worker";

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

export const defaultFont = "monospace";
export const defaultFontSize = 20;

export function text(
	ctx: OffscreenCanvasRenderingContext2D,
	x: number,
	y: number,
	text: string,
	colour: string = "white",
	font: string = defaultFont,
	fontSize: number = defaultFontSize
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
	font: string = defaultFont,
	fontSize: number = defaultFontSize
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

export function drawLog(
	ctx: OffscreenCanvasRenderingContext2D,
	log: Log,
	x: number,
	y: number,
	font: string = defaultFont,
	fontSize: number = defaultFontSize
) {
	if (typeof log == "string") {
		text(ctx, x, y, log, "white", font, fontSize);
	} else {
		let xPos = x;
		let yPos = y;

		for (const segment of log) {
			switch (segment.type) {
				case undefined:
				case "string": {
					const parts = segment.text.split("\n");

					for (const part of parts) {
						text(
							ctx,
							xPos,
							yPos,
							part,
							segment.colour,
							font,
							fontSize
						);

						const measurements = measureText(
							ctx,
							part,
							font,
							fontSize
						);

						if (parts.length == 1) {
							xPos += measurements.width;
						} else {
							xPos = x;
							yPos += 20;
						}
					}

					break;
				}

				case "image": {
					const txt = `[Image]`;
					text(ctx, xPos, yPos, txt, "white");

					const measurements = measureText(ctx, txt);

					xPos += measurements.width;

					break;
				}
			}
		}
	}
}
