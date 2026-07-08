import { logToString } from "../../../util/lib/logs";
import { Environment, Process } from "../../../util/types/worker";
import { HEIGHT, WIDTH } from "./gui";
import PaletteHandler, { paletteHeight, paletteWidth } from "./palette/palette";
import SocketManager, { Client } from "./socket";
import { measureText, rect, text } from "./util/rendering";
import { WindowContentItem } from "./windowContents";

export interface WindowInfo {
	window: Window;
	x: number;
	y: number;
	width: number;
	height: number;
}

export type PaletteIndex = { directory: string; name: string }[];

const headerHeight = 50;

export default class WindowManager {
	windows: (WindowInfo | undefined)[] = [];
	socketManager?: SocketManager;
	self?: Process;

	#showPalette: boolean = false;
	get paletteVisible() {
		return this.#showPalette;
	}

	windowID: number = 0;

	#paletteHandler: PaletteHandler;
	#palette?: WindowInfo;
	get palette() {
		if (!this.#showPalette) return;

		return this.#palette;
	}

	windowFocused(id: number) {
		if (this.paletteVisible && id !== this.palette?.window?.id) {
			return false;
		}

		const isFocused = this.#currentWindow == this.windows[id];

		return isFocused;
	}

	get #currentWindow(): WindowInfo | undefined {
		return this.windows[this.windowID];
	}

	constructor(public env: Environment) {
		this.#paletteHandler = new PaletteHandler(env, this);

		env.addEventListener("keydown", (e) => {
			if (this.paletteVisible) {
				switch (e.name.trim()) {
					case "Escape":
						this.hidePalette();
						break;

					case "":
						if (e.alt) {
							this.hidePalette();
						}
						break;
				}

				return;
			}

			if (e.alt) {
				const total = this.windows.length;
				const gridSides = Math.ceil(Math.sqrt(total));

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
						this.#currentWindow?.window?.close?.();
						break;

					case "":
						this.showPalette();
						break;
				}

				return;
			}

			const cur = this.#currentWindow;
			const window = cur?.window;

			if (window) {
				const keyName = e.name.trim().toLowerCase();

				switch (keyName) {
					case "arrowup":
						if (window.scrollItem - 1 >= 0) {
							// allow it
							window.scrollItem -= 1;
						}
						return;

					case "arrowdown":
						if (
							window.scrollItem + 1 <=
							window.interactables.length - 1
						) {
							// allow it
							window.scrollItem += 1;
						}
						return;
				}

				const item =
					window.contents[window.interactables[window.scrollItem]];

				switch (item.type) {
					case "button": {
						if (keyName == "") {
							// space key
							// TODO: Trigger it
							return;
						}
						break;
					}

					case "textBox": {
						if (!window.typing[item.identifier]) {
							window.typing[item.identifier] = "";
						}

						const store: string = window.typing[item.identifier]!;

						switch (keyName) {
							case "control":
							case "shift":
							case "meta":
							case "tab":
							case "escape":
							case "delete":
							case "end":
							case "pagedown":
							case "pageup":
							case "insert":
							case "home":
								break;

							case "backspace":
								window.typing[item.identifier] = store?.slice(
									0,
									store.length - 1
								);
								break;

							case "":
								window.typing[item.identifier] += " ";
								break;

							case "enter":
								item.complete = true;
								break;

							default:
								window.typing[item.identifier] += e.name;
						}
					}
				}

				// not caught - send to current app
				if (this.socketManager) {
					this.socketManager.onKeyPress(cur.window, e);
				}
			}
		});
	}

	async init() {
		this.self = await this.env.self();

		await this.#paletteHandler.init();
	}

	showPalette() {
		this.refreshPaletteIndex(["/bin/gui"]);

		this.#showPalette = true;
	}

	hidePalette() {
		this.#showPalette = false;
	}

	refreshPalette() {
		this.#paletteHandler.update(this.#index);
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
		const id = this.windows.length;

		const window = new GuiWindow(this, client, id, name);
		window.close = () => {
			if (this.socketManager) this.socketManager.onWindowExit(window);

			this.windows = this.windows.map((item) => {
				const remove = item?.window !== window;

				if (remove) {
					return undefined;
				} else {
					return item;
				}
			});
		};

		const isPalette = client?.pid == this.self?.pid;
		if (isPalette && this.#palette) {
			throw new Error("2 Palette windows cannot exist at once.");
		}

		// for palette
		const midWidth = WIDTH / 2;
		const midHeight = HEIGHT / 2;

		const paletteHalfWidth = paletteWidth / 2;
		const paletteHalfHeight = paletteHeight / 2;

		const info = {
			window,

			x: midWidth - paletteHalfWidth,
			y: midHeight - paletteHalfHeight,
			width: isPalette ? paletteWidth : 0,
			height: isPalette ? paletteHeight : 0
		};

		if (isPalette) {
			this.#palette = info;
		} else {
			this.windows.push(info);
		}

		return { window, id };
	}

	#index: PaletteIndex = [];
	async refreshPaletteIndex(directories: string[]) {
		const index: PaletteIndex = [];

		for (const directory of directories) {
			const contents = await this.env.fs.readdir(directory);

			for (const child of contents) {
				if (!child.endsWith(".js")) continue;

				const fullPath = this.env.path.join(directory, child);

				const stats = await this.env.fs.stats(fullPath);
				if (!stats) continue;

				if (stats.type == "file") {
					index.push({
						directory: fullPath,
						name: child.textBeforeLast(".js")
					});
				}
			}
		}

		this.#index = index;
	}
}

const debugRendering = false;
export abstract class Window {
	scrollItem: number = 0;
	contents: WindowContentItem[] = [];
	interactables: number[] = [];

	typing: Partial<Record<string, string>> = {};

	constructor(
		public windowManager: WindowManager,
		public associatedClient: Client | undefined,
		public id: number,
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
		} else {
			// to make sure I don't forget
			console.error("DEBUG RENDERING ENABLED");
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
		const headerDimensions = measureText(ctx, this.name, "monospace", 20);
		const padding = (headerHeight - headerDimensions.height) / 2;

		// rendered last so it can't be drawn over

		// dynamic content
		for (const i in this.contents) {
			const item = this.contents[i];
			const idx = Number(i);

			const itemFocused = this.interactables[this.scrollItem] == idx;

			switch (item.type) {
				case "text": {
					const string = logToString(item.text);

					if (isFocused && itemFocused) {
						const measurements = measureText(
							ctx,
							string,
							item.font,
							item.fontSize
						);

						rect(
							ctx,
							x + item.x - 3,
							y + headerHeight + item.y - 3,
							measurements.width + 6,
							measurements.height + 6,
							"rgb(65 65 65)"
						);
					}

					if (typeof item.text == "string") {
						text(
							ctx,
							x + item.x,
							y + headerHeight + item.y,
							item.text,
							"white",
							item.font,
							item.fontSize
						);
					} else {
						let xPos = x + item.x;
						let yPos = y + headerHeight + item.y;

						for (const segment of item.text) {
							switch (segment.type) {
								case undefined:
								case "string": {
									text(
										ctx,
										xPos,
										yPos,
										segment.text,
										segment.colour,
										item.font,
										item.fontSize
									);

									const measurements = measureText(
										ctx,
										segment.text,
										item.font,
										item.fontSize
									);

									xPos += measurements.width;

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

					break;
				}

				case "textBox": {
					if (item.complete) {
						this.windowManager?.socketManager?.onTextboxCompletion?.(
							this,
							item.identifier,
							this.typing[item.identifier] ?? ""
						);
					}

					const displayText = `${item.message} ${this.typing[item.identifier] ?? ""}`;

					if (isFocused && itemFocused) {
						const measurements = measureText(
							ctx,
							displayText,
							item.font,
							item.fontSize
						);

						rect(
							ctx,
							x + item.x - 3,
							y + headerHeight + item.y - 3,
							measurements.width + 6,
							measurements.height + 6,
							"rgb(65 65 65)",
							"white"
						);
					}

					text(
						ctx,
						x + item.x,
						y + headerHeight + item.y,
						displayText
					);

					break;
				}

				default:
					text(
						ctx,
						x + item.x,
						y + headerHeight + item.y,
						`Unknown Component Type: ${item.type}`
					);
			}
		}

		// draw header
		rect(
			ctx,
			x,
			y,
			width,
			headerHeight,
			isFocused ? `rgb(95 95 95)` : `rgb(75 75 75)`
		);

		text(
			ctx,
			x + padding,
			y + padding,
			this.name,
			isFocused ? "rgb(255 255 255)" : "rgb(200 200 200)",
			"monospace",
			20
		);

		if (!debugRendering) ctx.restore();
	}

	// impl in WindowManager
	close() {}
}

class GuiWindow extends Window {}
