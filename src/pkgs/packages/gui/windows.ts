import { logToString } from "../../../util/lib/logs";
import { Environment, Process } from "../../../util/types/worker";
import PaletteHandler, { paletteHeight, paletteWidth } from "./palette/palette";
import SocketManager, { Client } from "./socket";
import { drawLog, measureText, rect, text } from "./util/rendering";
import { WindowContentItem } from "./types/windowContents";
import { GuiState } from "./gui";
import { dataURItoBlob } from "../../../util/lib/uri";
import {
	focusedWindowStroke,
	unfocusedWindowStroke,
	windowFill
} from "./constants";

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
	windows: Record<number, WindowInfo | undefined> = {};
	windowIDs: number[] = [];

	refreshWindowIDs() {
		this.windowIDs = Object.keys(this.windows).map((item) => Number(item));
	}

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
		if (this.palette !== undefined && id !== this.palette?.window?.id) {
			return false;
		}

		const isFocused = this.#currentWindow == this.windows[id];

		return isFocused;
	}

	get #currentWindow(): WindowInfo | undefined {
		if (this.#showPalette) return this.#palette;

		return this.windows[this.windowID];
	}

	#handleAltNavigation(key: string): boolean {
		const total = this.windowIDs.length;

		switch (key) {
			case "arrowup":
				console.error("NO_IMPL:WORKSPACE_UP");
				return true;

			case "arrowleft":
				this.windowID = Math.max(0, this.windowID - 1);
				return true;

			case "arrowdown":
				console.error("NO_IMPL:WORKSPACE_DOWN");
				return true;

			case "arrowright":
				this.windowID = Math.min(total - 1, this.windowID + 1);
				return true;

			case "w":
			case "∑":
				this.#currentWindow?.window?.close?.();
				this.windowID -= 1;
				return true;

			case "return":
			case "enter":
				return true;
		}

		return false;
	}

	#handleWindowScroll(window: any, key: string, isShift: boolean): boolean {
		if (key === "arrowup") {
			if (isShift) {
				window.scroll -= 100;
			} else {
				window.scrollItem = Math.max(0, window.scrollItem - 1);
			}
			return true;
		}

		if (key === "arrowdown") {
			if (isShift) {
				window.scroll += 100;
			} else {
				const maxIndex = (window.interactables?.length || 1) - 1;
				window.scrollItem = Math.min(maxIndex, window.scrollItem + 1);
			}
			return true;
		}

		return false;
	}

	#handleItemInteraction(
		window: any,
		item: any,
		key: string,
		rawKey: string,
		e: any
	): boolean {
		if (item.type === "button") {
			if (key === "" || key === "enter" || key === " ") {
				this.socketManager?.onButtonPress?.(window, item.identifier);
				return true;
			}
		}

		if (item.type === "textBox") {
			return this.#handleTextBoxInput(window, item, key, rawKey, e);
		}

		return false;
	}

	#handleTextBoxInput(
		window: any,
		item: any,
		key: string,
		rawKey: string,
		e: any
	): boolean {
		const ignoredKeys = new Set([
			"control",
			"shift",
			"meta",
			"tab",
			"escape",
			"delete",
			"end",
			"pagedown",
			"pageup",
			"insert",
			"home",
			"alt",
			"arrowup",
			"arrowleft",
			"arrowdown",
			"arrowright"
		]);

		if (ignoredKeys.has(key)) return true;

		// make sure the typing entry exists
		if (window.typing[item.identifier] == null) {
			window.typing[item.identifier] = "";
		}

		const notifyChange = () => {
			this.socketManager?.onTextboxValueChange?.(
				window,
				item.identifier,
				window.typing[item.identifier]
			);
		};

		if (key === "backspace") {
			const currentText = window.typing[item.identifier];
			if (currentText.length > 0) {
				const charsToRemove = e.alt ? 2 : 1;
				window.typing[item.identifier] = currentText.slice(
					0,
					-charsToRemove
				);
				notifyChange();
			}
			return true;
		}

		if (key === "enter") {
			item.complete = true;
			return true;
		}

		// add it
		const charToAdd = key === "" ? " " : rawKey;
		window.typing[item.identifier] += charToAdd;
		notifyChange();

		return true;
	}

	constructor(
		public env: Environment,
		public state: GuiState
	) {
		this.#paletteHandler = new PaletteHandler(env, this);

		env.addEventListener("keydown", (e: KeyboardEvent | any) => {
			const rawKey = (e.key || e.name || "").trim();
			const key = rawKey.toLowerCase();
			const isAltOrCtrl = e.alt || e.ctrl;

			if (this.paletteVisible) {
				if (key === "escape" || (key === "" && isAltOrCtrl)) {
					this.hidePalette();
					return;
				}
			}

			if (key === "" && isAltOrCtrl) {
				this.#showPalette ? this.hidePalette() : this.showPalette();
				return;
			}

			if (e.alt && this.#handleAltNavigation(key)) {
				return;
			}

			// get active winow
			const cur = this.#currentWindow;
			const window = cur?.window;

			if (!window) return;

			// handle scrolling of window contents
			if (this.#handleWindowScroll(window, key, e.shift)) {
				return;
			}

			// handle interactivity
			const currentItem =
				window.contents?.[window.interactables?.[window.scrollItem]];

			if (currentItem) {
				const handled = this.#handleItemInteraction(
					window,
					currentItem,
					key,
					rawKey,
					e
				);
				if (handled) return;
			}

			// send unhandled to focused window
			this.socketManager?.onKeyPress?.(cur.window, e);
		});
	}

	async init() {
		this.self = await this.env.self();

		this.#paletteHandler.init();
	}

	showPalette() {
		this.refreshPaletteIndex(["/bin/gui"]).then(() =>
			this.refreshPalette()
		);

		this.#paletteHandler.resetSearchQuery();

		this.refreshPalette();

		this.#showPalette = true;
	}

	hidePalette() {
		this.#showPalette = false;
	}

	refreshPalette() {
		this.#paletteHandler.update(this.#index);
	}

	reposition() {
		const total = this.windowIDs.length;
		const gridSides = Math.ceil(Math.sqrt(total));

		const columnWidth = this.state.width / gridSides;
		const rowHeight = this.state.height / gridSides;

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

		if (this.#palette) {
			// for palette
			const midWidth = this.state.width / 2;
			const midHeight = this.state.height / 2;

			const paletteHalfWidth = paletteWidth / 2;
			const paletteHalfHeight = paletteHeight / 2;

			this.#palette.x = midWidth - paletteHalfWidth;
			this.#palette.y = midHeight - paletteHalfHeight;
			this.#palette.width = paletteWidth;
			this.#palette.height = paletteHeight;
		}
	}

	newWindow(client: Client | undefined, name: string) {
		const id = this.windowIDs.length;

		const window = new GuiWindow(this, client, id, name);
		window.close = () => {
			this.windows[window.id] = undefined;
			this.refreshWindowIDs();

			try {
				if (this.socketManager) this.socketManager.onWindowExit(window);
			} catch {}
		};

		const isPalette = client?.pid == this.self?.pid;
		if (isPalette && this.#palette) {
			throw new Error("2 Palette windows cannot exist at once.");
		}

		// for palette
		const midWidth = this.state.width / 2;
		const midHeight = this.state.height / 2;

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
			this.windows[window.id] = info;
			this.refreshWindowIDs();
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
						name: child.substring(0, child.length - 3)
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
	#currentItemHeight?: number;

	contents: Partial<WindowContentItem[]> = [];
	interactables: number[] = [];

	typing: Partial<Record<string, string>> = {};
	images: Partial<
		Record<
			string,
			{ state: "loaded"; bitmap: ImageBitmap } | { state: "loading" }
		>
	> = {};
	scroll: number = 0;
	lastTime: number = 0;

	constructor(
		public windowManager: WindowManager,
		public associatedClient: Client | undefined,
		public id: number,
		public name: string,
		public description?: string
	) {
		this.lastTime = performance.now();
	}

	#oldWidth: number = 0;
	#oldHeight: number = 0;
	render(
		ctx: OffscreenCanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
		isFocused: boolean
	) {
		const currentTime = performance.now();
		this.lastTime = currentTime;

		if (this.#oldWidth !== width || this.#oldHeight !== height) {
			this.#oldWidth = width;
			this.#oldHeight = height;

			this.windowManager?.socketManager?.onWindowResize?.(
				this,
				width,
				height
			);
		}

		if (!debugRendering) {
			const region = new Path2D();
			region.rect(x, y, width, height);

			ctx.save();
			ctx.clip(region, "evenodd");
		} else {
			// to make sure I don't forget
			console.error("DEBUG RENDERING ENABLED");
		}

		this.#currentItemHeight = undefined;

		// Window box
		rect(
			ctx,
			x,
			y,
			width,
			height,
			windowFill,
			isFocused ? focusedWindowStroke : unfocusedWindowStroke
		);

		// Window header
		const headerDimensions = measureText(ctx, this.name, "monospace", 20);
		const padding = (headerHeight - headerDimensions.height) / 2;

		// rendered last so it can't be drawn over

		const yRoot = y - this.scroll;

		// dynamic content
		for (const i in this.contents) {
			const item = this.contents[i];
			if (!item) continue;

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
							yRoot + headerHeight + item.y - 3,
							measurements.width + 6,
							measurements.height + 6,
							"rgb(65 65 65)"
						);

						this.#currentItemHeight =
							item.y + measurements.height + 6;
					}

					drawLog(
						ctx,
						item.text,
						x + item.x,
						yRoot + headerHeight + item.y,
						item.font,
						item.fontSize
					);

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

					const displayText = `${item.message ? `${item.message} ` : ""}${this.typing[item.identifier] || (item.backText ?? "")}`;

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
							yRoot + headerHeight + item.y - 3,
							measurements.width + 6,
							measurements.height + 6,
							"rgb(65 65 65)",
							"white"
						);

						this.#currentItemHeight =
							item.y + measurements.height + 6;
					}

					text(
						ctx,
						x + item.x,
						yRoot + headerHeight + item.y,
						displayText
					);

					break;
				}

				case "button": {
					const string = logToString(item.text);

					const measurements = measureText(
						ctx,
						string,
						item.font,
						item.fontSize
					);

					rect(
						ctx,
						x + item.x - 3,
						yRoot + headerHeight + item.y - 3,
						measurements.width + 6,
						measurements.height + 6,
						itemFocused ? "rgb(100 100 100)" : "rgb(75 75 75)"
					);

					this.#currentItemHeight = item.y + measurements.height + 6;

					drawLog(
						ctx,
						item.text,
						x + item.x,
						yRoot + headerHeight + item.y,
						item.font,
						item.fontSize
					);

					break;
				}

				case "box": {
					rect(
						ctx,
						x + item.x,
						yRoot + headerHeight + item.y,
						item.width,
						item.height,
						item.fill ?? "rgb(45 45 45)",
						item.stroke ?? "rgb(55 55 55)"
					);

					break;
				}

				case "image": {
					const ref = `${item.sourceType}:${item.source}`;

					const image = this.images[ref];

					if (!image) {
						this.images[ref] = { state: "loading" };

						(async () => {
							switch (item.sourceType) {
								case "file":
									const data =
										await this.windowManager.env.fs.readFile(
											item.source
										);

									if (data) {
										const blob = dataURItoBlob(data);

										const bitmap =
											await createImageBitmap(blob);

										this.images[ref] = {
											state: "loaded",
											bitmap
										};
									}

									break;

								case "url":
									const request =
										await this.windowManager.env.network.request(
											"get",
											item.source,
											"blob"
										);

									if (request.isOk) {
										const blob = request.response;

										const bitmap =
											await createImageBitmap(blob);

										this.images[ref] = {
											state: "loaded",
											bitmap
										};
									} else {
									}

									break;

								default:
									console.error(
										`Unhandled image sourceType: '${item.sourceType}'`
									);
							}
						})();
					}

					switch (image?.state) {
						case undefined:
						case "loading":
							const colour =
								150 + 37.5 * Math.sin(currentTime / 500);

							rect(
								ctx,
								x + item.x,
								yRoot + headerHeight + item.y,
								item.width,
								item.height,
								`rgb(${colour} ${colour} ${colour})`,
								"rgb(200 200 200)"
							);

							break;

						case "loaded":
							ctx.drawImage(
								image.bitmap,
								x + item.x,
								yRoot + headerHeight + item.y,
								item.width,
								item.height
							);

							break;
					}

					break;
				}

				default:
					text(
						ctx,
						// @ts-expect-error
						x + item.x,
						// @ts-expect-error
						yRoot + headerHeight + item.y,
						// @ts-expect-error
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

		const contentHeight = height - headerHeight;

		const focused = this.contents[this.interactables[this.scrollItem]];
		if (focused) {
			const targetVisibleTop = focused.y - this.scroll;
			const targetVisibleBottom =
				(this.#currentItemHeight ?? focused.y + 15) - this.scroll;

			if (targetVisibleBottom > contentHeight) {
				this.scroll += Math.abs(targetVisibleBottom - contentHeight);
			}
			if (targetVisibleTop < headerHeight) {
				this.scroll -= Math.abs(targetVisibleTop - headerHeight);
			}

			if (this.scroll < 0) {
				this.scroll = 0;
			}
		}
	}

	// impl in WindowManager
	close() {}
}

class GuiWindow extends Window {}
