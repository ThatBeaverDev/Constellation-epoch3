export function line(
	ctx: OffscreenCanvasRenderingContext2D,
	colour: string,
	...points: [number, number][]
) {
	ctx.strokeStyle = colour;
	ctx.beginPath();

	let isFirst = true;
	for (const pos of points) {
		if (isFirst) {
			ctx.moveTo(pos[0] ?? 0, pos[1] ?? 0);
			isFirst = false;
		} else {
			ctx.lineTo(pos[0] ?? 0, pos[1] ?? 0);
		}
	}

	ctx.stroke();
}

export function rect(
	ctx: OffscreenCanvasRenderingContext2D,
	color: string,
	topLeft: [number, number],
	dimensions: [number, number]
) {
	ctx.fillStyle = color;

	ctx.fillRect(topLeft[0], topLeft[1], dimensions[0], dimensions[1]);
}
