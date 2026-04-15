import { Environment } from "../types/worker";
import { sleep } from "../usrlib/time";

// Source - https://stackoverflow.com/a/12300351
// Posted by devnull69, modified by community. See post 'Timeline' for change history
// Retrieved 2026-04-11, License - CC BY-SA 3.0

function dataURItoBlob(dataURI: string) {
	// convert base64 to raw binary data held in a string
	// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
	const byteString = atob(dataURI.split(",")[1]);

	// separate out the mime component
	const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

	// write the bytes of the string to an ArrayBuffer
	const ab = new ArrayBuffer(byteString.length);

	// create a view into the buffer
	const ia = new Uint8Array(ab);

	// set the bytes of the buffer to the correct values
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}

	// write the ArrayBuffer to a blob, and you're done
	const blob = new Blob([ab], { type: mimeString });
	return blob;
}

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

	const displayedCanvas = new OffscreenCanvas(
		canvasWidth + canvasIncrementX,
		canvasWidth + canvasIncrementY
	);
	const displayCtx = displayedCanvas.getContext("2d");
	if (!displayCtx) throw new Error("CTX not given.");

	const URLs: string[] = [];
	async function getCanvasURL(canvas: OffscreenCanvas) {
		const blob = await canvas.convertToBlob();
		const url = URL.createObjectURL(blob);

		URLs.push(url);

		// return the url, allow it to be manually expired.
		return {
			url,
			expire() {
				URLs.splice(URLs.indexOf(url), 1);
				URL.revokeObjectURL(url);
			}
		};
	}

	let penDown: boolean = false;
	let penX = 0;
	let penY = 0;
	let exit = false;
	let expireLastCanvas: (() => void) | undefined = undefined;
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

	while (true) {
		env.clearLogs();
		if (expireLastCanvas) expireLastCanvas();

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

		const canvasData = await getCanvasURL(displayedCanvas);
		expireLastCanvas = canvasData.expire;

		env.print([
			{
				type: "image",
				url: canvasData.url,
				width: 100
			}
		]);

		const unformattedActions = await env.input(
			"Action(s) [W, A, S, D, Q, E, C, H, R]: "
		);
		const actions = unformattedActions.toLowerCase().trim().split("");

		if (actions.length == 0) {
			const sure = await env.input("Exit? (no autosave) (y/N) ", {
				leaveInputOnCompletion: false
			});
			if (sure.toLowerCase().trim() == "y") {
				exit = true;
			} else {
				// don't exit
			}
		}

		for (const action of actions) {
			switch (action) {
				case "h":
					env.clearLogs();

					env.print(
						"Commands:\n\n- W: Move cursor up by one\n- A: Move cursor left by one\n- S: Move cursor down by one\n- D: Move cursor right by one\n\n- Q - Move Brush Down (start drawing)\n- E - Move Brush Up (stop drawing)\n- C - Set colour\n\n- None - Exit\n- R - Save image."
					);

					await sleep(2000);

					break;

				case "w":
					penY -= 1;
					break;
				case "a":
					penX -= 1;
					break;
				case "s":
					penY += 1;
					break;
				case "d":
					penX += 1;
					break;

				case "q":
					penDown = true;
					break;
				case "e":
					penDown = false;
					break;

				case "c":
					const newColour = await env.input("Enter a hex colour: ");
					penColour = newColour;
					break;

				case "r":
					const blob = await drawingCanvas.convertToBlob({
						type: "image/png"
					});
					const dataUrl = `data:${blob.type};base64,${btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))}`; // Complex base64 logic

					const savePath = await env.input(
						"Enter the directory to save to: "
					);

					await env.fs.writeFile(savePath, dataUrl);

					break;
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

			if (exit == true) break;
		}

		if (exit == true) break;
	}

	// the URLs will just have to stay
}
