import { Environment } from "../../../util/types/worker";
import { HEIGHT, WIDTH } from "./gui";
import SocketManager, { Client } from "./socket";
import { measureText, rect, text } from "./util/rendering";
import { WindowContentItem } from "./windowContents";

interface WindowInfo {
	window: Window;
	x: number;
	y: number;
	width: number;
	height: number;
}

export default class WindowManager {
	windows: WindowInfo[] = [];
	socketManager?: SocketManager;

	windowID: number = 0;

	get currentWindow(): WindowInfo | undefined {
		return this.windows[this.windowID];
	}

	constructor(public env: Environment) {
		env.addEventListener("keydown", (e) => {
			const total = this.windows.length;
			const gridSides = Math.ceil(Math.sqrt(total));

			if (e.alt) {
				switch (e.name.trim().toLowerCase()) {
					case "arrowup":
						if (this.windowID - gridSides >= 0) {
							// allow it
							this.windowID -= gridSides;
						}
						return;

					case "arrowleft":
						if (this.windowID - 1 >= 0) {
							// allow it
							this.windowID -= 1;
						}
						return;

					case "arrowdown":
						if (this.windowID + gridSides <= total - 1) {
							// allow it
							this.windowID += gridSides;
						}
						return;

					case "arrowright":
						if (this.windowID + 1 <= total - 1) {
							// allow it
							this.windowID += 1;
						}
						return;

					case "w":
					case "∑":
						this.currentWindow?.window?.close?.();
						break;

					case "":
						console.debug("Command pallette");
						break;
				}

				return;
			}

			// not caught - send to current app
			const cur = this.currentWindow;
			if (this.socketManager && cur !== undefined) {
				this.socketManager.onKeyPress(cur.window, e);
			}
		});
	}

	reposition() {
		const total = this.windows.length;
		const gridSides = Math.ceil(Math.sqrt(total));

		const columnWidth = WIDTH / gridSides;
		const rowHeight = HEIGHT / gridSides;

		let windowID = 0;

		for (let y = 0; y < gridSides; y++) {
			for (let x = 0; x < gridSides; x++) {
				const info = this.windows[windowID++];
				if (!info) return;

				info.x = x * columnWidth;
				info.y = y * rowHeight;

				info.width = columnWidth;
				info.height = rowHeight;
			}
		}
	}

	newWindow(client: Client | undefined, name: string) {
		const window = new GuiWindow(client, name);
		window.close = () => {
			if (this.socketManager) this.socketManager.onWindowExit(window);

			this.windows = this.windows.filter(
				(item) => item.window !== window
			);
		};

		const info = {
			window,

			x: 0,
			y: 0,
			width: 200,
			height: 120
		};

		this.windows.push(info);

		return window;
	}
}

const debugRendering = true;
export abstract class Window {
	contents: WindowContentItem[] = [];

	constructor(
		public associatedClient: Client | undefined,
		public name: string,
		public description?: string
	) {}

	render(
		ctx: OffscreenCanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		isFocused: boolean
	) {
		if (!debugRendering) {
			const region = new Path2D();
			region.rect(x, y, width, height);

			ctx.save();
			ctx.clip(region, "evenodd");
		}

		// Window box
		rect(
			ctx,
			x,
			y,
			width,
			height,
			`rgb(25 25 25)`,
			isFocused ? `rgb(170 170 170)` : "rgb(150 150 150)"
		);

		// Window header
		const headerHeight = 50;

		rect(
			ctx,
			x,
			y,
			width,
			headerHeight,
			isFocused ? `rgb(95 95 95)` : `rgb(75 75 75)`
		);

		const headerDimensions = measureText(ctx, this.name, "monospace", 20);
		const padding = (headerHeight - headerDimensions.height) / 2;

		text(
			ctx,
			x + padding,
			y + padding,
			this.name,
			"white",
			"monospace",
			20
		);

		// dynamic content
		for (const item of this.contents) {
			switch (item.type) {
				case "text":
					text(
						ctx,
						x + item.x,
						y + headerHeight + item.y,
						item.text,
						"white",
						item.font,
						item.fontSize
					);

					break;

				case "image":
					break;

				case "button":
					break;
			}
		}

		if (!debugRendering) ctx.restore();
	}

	// impl in WindowManager
	close() {}
}

class GuiWindow extends Window {}
