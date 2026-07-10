import { clamp } from "../util/lib/maths";
import { Environment } from "../util/types/worker";
import { blobToDataURL, dataURItoBlob } from "../util/lib/uri";
import { sleep } from "../util/lib/time";

function line(
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

function rect(
	ctx: OffscreenCanvasRenderingContext2D,
	color: string,
	topLeft: [number, number],
	dimensions: [number, number]
) {
	ctx.fillStyle = color;

	ctx.fillRect(topLeft[0], topLeft[1], dimensions[0], dimensions[1]);
}

function invertHex(hex: string) {
	const noHash = hex.trim().substring(1);

	const segments: string[] = [
		noHash.substring(0, 2),
		noHash.substring(2, 4),
		noHash.substring(4, 6)
		// any more will be ignored
	];

	const numbers = segments.map((item) => Number(`0x${item}`));

	const inverted = numbers.map((item) => 255 - item);

	return "#" + inverted.join("");
}

export default async function* microsoftPaint(
	env: Environment,
	[file = ".__non_entered"]: [string]
) {
	const canvasWidth = 1000;
	const canvasHeight = 1000;

	const canvasPenScaling = 50;
	const canvasIncrementX = canvasWidth / canvasPenScaling;
	const canvasIncrementY = canvasHeight / canvasPenScaling;

	const drawingCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const drawingCtx = drawingCanvas.getContext("2d");
	if (!drawingCtx) throw new Error("CTX not given.");
	drawingCtx.fillStyle = "black";
	drawingCtx.fillRect(0, 0, canvasWidth, canvasHeight);

	// draw file contents to drawing canvas
	const filepath = env.path.resolve(env.workingDirectory, file);
	if (!filepath.endsWith(".__non_entered")) {
		const filecontents = await env.fs.readFile(filepath);
		if (!filecontents) return "File does not exist!";

		const blob = dataURItoBlob(filecontents);
		const bitmap = await createImageBitmap(blob);

		drawingCtx.drawImage(bitmap, 0, 0, canvasWidth, canvasHeight);
	}

	const { canvas: displayedCanvas, id: canvasId } = await env.getLiveCanvas(
		canvasWidth + canvasIncrementX,
		canvasWidth + canvasIncrementY
	);
	const displayCtx = displayedCanvas.getContext("2d");
	if (!displayCtx) throw new Error("CTX not given.");

	let penDown: boolean = false;
	let penX = 0;
	let penY = 0;
	let exit = false;
	let penColour = "red";

	function penPosToCanvasPos(
		penXPos: number = penX,
		penYPos: number = penY
	): [number, number] {
		return [
			(penXPos + 1) * canvasIncrementX,
			(penYPos + 1) * canvasIncrementY
		];
	}

	let input = false;
	let allowNext = 0;
	env.addEventListener("keydown", async (event) => {
		if (input) return;
		const now = Date.now();
		if (allowNext > now) await sleep(allowNext - now);
		allowNext = now + 25;

		switch (event.name) {
			case "w":
				penY = clamp(penY - 1, 0, 50);
				break;
			case "a":
				penX = clamp(penX - 1, 0, 50);
				break;
			case "s":
				penY = clamp(penY + 1, 0, 50);
				break;
			case "d":
				penX = clamp(penX + 1, 0, 50);
				break;

			case "q":
				penDown = true;
				break;
			case "e":
				penDown = false;
				break;

			case "c":
				input = true;
				const newColour = await env.input("Enter a hex colour: ");
				input = false;
				penColour = newColour;
				break;

			case "r":
				const blob = await drawingCanvas.convertToBlob({
					type: "image/png"
				});
				const dataUrl = await blobToDataURL(blob);

				input = true;
				const savePath = await env.input(
					"Enter the directory to save to: "
				);
				input = false;

				await env.fs.writeFile(savePath, dataUrl);

				break;

			case "x":
				const sure = await env.input("Exit? (no autosave) (y/N) ", {
					leaveInputOnCompletion: false
				});
				if (sure.toLowerCase().trim() == "y") {
					exit = true;
				} else {
					// don't exit
				}
				return;

			default:
				return;
		}

		if (penDown == true) {
			// draw rect in that pixel
			const penCanvasX = penX * canvasIncrementX;
			const penCanvasY = penY * canvasIncrementX;

			rect(
				drawingCtx,
				penColour,
				[penCanvasX, penCanvasY],
				[canvasIncrementX, canvasIncrementX]
			);
		}

		/* ----- Ready display canvas to be displayed ----- */

		displayCtx.clearRect(
			0,
			0,
			displayedCanvas.width,
			displayedCanvas.height
		);
		displayCtx.drawImage(drawingCanvas, canvasIncrementX, canvasIncrementY);

		const gridColour = "#333333";
		displayCtx.lineWidth = 0.5;

		const cursorPos = penPosToCanvasPos();
		// boxes to indicate cursor position
		rect(
			displayCtx,
			"white",
			[0, cursorPos[1]],
			[canvasIncrementX, canvasIncrementY]
		);
		rect(
			displayCtx,
			"white",
			[cursorPos[0], 0],
			[canvasIncrementX, canvasIncrementY]
		);

		let i = 0;
		for (let x = 0; x < displayedCanvas.width; x += canvasIncrementX) {
			line(displayCtx, gridColour, [x, 0], [x, displayedCanvas.height]);

			if (penX == x / canvasIncrementX) {
				displayCtx.fillStyle = invertHex("#7e7e7e");
			} else displayCtx.fillStyle = "#7e7e7e";

			displayCtx.fillText(
				`${i++}`,
				x + canvasIncrementX / 2,
				canvasIncrementY / 2
			);
		}

		i = 0;
		for (let y = 0; y < displayedCanvas.height; y += canvasIncrementY) {
			line(displayCtx, gridColour, [0, y], [displayedCanvas.width, y]);

			if (penY == y / canvasIncrementY) {
				displayCtx.fillStyle = invertHex("#7e7e7e");
			} else displayCtx.fillStyle = "#7e7e7e";

			displayCtx.fillText(
				`${i++}`,
				canvasIncrementX / 2,
				y + canvasIncrementY / 2
			);
		}

		rect(displayCtx, "#ffffff55", cursorPos, [
			canvasIncrementX,
			canvasIncrementY
		]);
	});

	env.print([
		{
			text: "Commands:\n\n- W: Move cursor up by one\n- A: Move cursor left by one\n- S: Move cursor down by one\n- D: Move cursor right by one\n\n- Q - Move Brush Down (start drawing)\n- E - Move Brush Up (stop drawing)\n- C - Set colour\n\n- X - Exit\n- R - Save image.\n"
		},
		{ type: "liveCanvas", id: canvasId, width: 50, height: 50 }
	]);

	env.triggerEvent("keydown", { alt: false, name: "e", shift: false });
	while (true) {
		// @ts-expect-error
		if (exit == true) break;

		yield;
	}
}
