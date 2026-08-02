import { Environment, KeyPressData } from "@/types/worker";
import { PaintState } from "./types";
import { sleep } from "@/lib/time";
import { clamp } from "@/lib/maths";
import { blobToDataURL } from "@/lib/uri";
import { line, rect } from "./rendering";
import { invertHex } from "./colours";

export function inputHandler(env: Environment, s: PaintState) {
	let input = false;
	let allowNext = 0;
	const blanks = new Set(["transparent", "blank", "none"]);

	function penPosToCanvasPos(
		penXPos: number = s.penX,
		penYPos: number = s.penY
	): [number, number] {
		return [(penXPos + 1) * s.incrementX, (penYPos + 1) * s.incrementY];
	}

	return async (event: KeyPressData) => {
		if (input) return;
		const now = Date.now();
		if (allowNext > now) await sleep(allowNext - now);
		allowNext = now + 25;

		switch (event.name) {
			case "w":
				s.penY = clamp(s.penY - 1, 0, s.sideBlocks - 1);
				break;
			case "a":
				s.penX = clamp(s.penX - 1, 0, s.sideBlocks - 1);
				break;
			case "s":
				s.penY = clamp(s.penY + 1, 0, s.sideBlocks - 1);
				break;
			case "d":
				s.penX = clamp(s.penX + 1, 0, s.sideBlocks - 1);
				break;

			case "q":
				s.penDown = true;
				break;
			case "e":
				s.penDown = false;
				break;

			case "c":
				input = true;
				const newColour = await env.input("Enter a hex colour: ", {
					leaveInputOnCompletion: false
				});
				input = false;
				s.penColour = newColour;
				break;

			case "r":
				const blob = await s.drawingCanvas.convertToBlob({
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
					s.exit = true;
				} else {
					// don't exit
				}
				return;

			default:
				return;
		}

		if (s.penDown == true) {
			// draw rect in that pixel
			const penCanvasX = s.penX * s.incrementX;
			const penCanvasY = s.penY * s.incrementX;

			if (blanks.has(s.penColour)) {
				s.drawingCtx.clearRect(
					penCanvasX,
					penCanvasY,
					s.incrementX,
					s.incrementY
				);
			} else {
				rect(
					s.drawingCtx,
					s.penColour,
					[penCanvasX, penCanvasY],
					[s.incrementX, s.incrementY]
				);
			}
		}

		/* ----- Ready display canvas to be displayed ----- */

		s.displayCtx.clearRect(
			0,
			0,
			s.displayCanvas.width,
			s.displayCanvas.height
		);
		s.displayCtx.drawImage(s.drawingCanvas, s.incrementX, s.incrementY);

		const gridColour = "#333333";
		s.displayCtx.lineWidth = 0.5;

		const cursorPos = penPosToCanvasPos();
		// boxes to indicate cursor position
		rect(
			s.displayCtx,
			"white",
			[0, cursorPos[1]],
			[s.incrementX, s.incrementY]
		);
		rect(
			s.displayCtx,
			"white",
			[cursorPos[0], 0],
			[s.incrementX, s.incrementY]
		);

		let i = 0;
		for (let x = 0; x < s.displayCanvas.width; x += s.incrementX) {
			line(s.displayCtx, gridColour, [x, 0], [x, s.displayCanvas.height]);

			if (s.penX == x / s.incrementX) {
				s.displayCtx.fillStyle = invertHex("#7e7e7e");
			} else s.displayCtx.fillStyle = "#7e7e7e";

			s.displayCtx.fillText(
				`${i++}`,
				x + s.incrementX / 2,
				s.incrementY / 2
			);
		}

		i = 0;
		for (let y = 0; y < s.displayCanvas.height; y += s.incrementY) {
			line(s.displayCtx, gridColour, [0, y], [s.displayCanvas.width, y]);

			if (s.penY == y / s.incrementY) {
				s.displayCtx.fillStyle = invertHex("#7e7e7e");
			} else s.displayCtx.fillStyle = "#7e7e7e";

			s.displayCtx.fillText(
				`${i++}`,
				s.incrementX / 2,
				y + s.incrementY / 2
			);
		}

		rect(s.displayCtx, "#ffffff55", cursorPos, [
			s.incrementX,
			s.incrementY
		]);
	};
}
