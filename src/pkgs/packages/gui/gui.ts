import { Environment } from "../../../util/types/worker";
import {
	DEFAULT_WALLAPER,
	focusedWindowStroke,
	GUI_DATA_PATH,
	headerHeight,
	WALLPAPER_INDEX_PATH,
	WALLPAPER_SOURCES,
	windowFill
} from "./constants";
import SocketManager from "./socket";
import { drawLog, measureText, rect, text } from "./util/rendering";
import WindowManager, { WindowInfo } from "./windows";

const lineGap = 15;

export interface GuiState {
	ctx: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	scrollX: number;
}

export default async function* GraphicalEnvironment(env: Environment) {
	const isNew = await env.fs.mkdir(GUI_DATA_PATH);
	await env.fs.mkdir(WALLPAPER_INDEX_PATH);

	async function renderCanvas(
		widthPx: number,
		heightPx: number
	): Promise<GuiState> {
		const lineWidth = widthPx / lineGap;
		const lineHeight = heightPx / lineGap;

		const width = widthPx;
		const height = heightPx;

		const { canvas, id: liveCanvasId } = await env.getLiveCanvas(
			width,
			height
		);

		env.clearLogs();
		env.print([
			{
				type: "liveCanvas",
				id: liveCanvasId,
				width: lineWidth,
				height: lineHeight
			}
		]);

		const ctx = canvas.getContext("2d")!;

		return { ctx, width, height, scrollX: 0 };
	}

	const dimensions = await env.terminalDimensions();
	let state = await renderCanvas(dimensions.width, dimensions.height);

	env.addEventListener("resize", async ({ width, height }) => {
		const result = await renderCanvas(width, height);

		state.ctx = result.ctx;
		state.width = result.width;
		state.height = result.height;
	});

	const windowManager = new WindowManager(env, state);

	const socketManager = new SocketManager(env, windowManager);
	windowManager.socketManager = socketManager;

	await socketManager.init();
	let renderNew = Boolean(isNew);
	await windowManager.init(
		() => {
			renderNew = true;
		},
		() => {
			renderNew = false;
		}
	);

	let bitmap: ImageBitmap | undefined = undefined;
	async function setFilesystemWallpaper(path: string) {
		const contents = await env.fs.readFile(path);
		if (!contents) return;

		const result = await env.network.request("get", contents, "blob");

		if (result.isOk) {
			bitmap = await createImageBitmap(result.response);
		}
	}

	async function setNetworkWallpaper(url: string) {
		const path = await loadNetworkWallpaper(url);

		if (path) await setFilesystemWallpaper(path);
	}

	async function loadNetworkWallpaper(url: string) {
		const fileName = encodeURIComponent(url);
		const wallpaperPath = env.path.join(WALLPAPER_INDEX_PATH, fileName);

		const exists = await env.fs.exists(wallpaperPath);
		if (exists) {
			return wallpaperPath;
		}

		const result = await env.network.request("get", url, "datauri");

		if (result.isOk) {
			await env.fs.writeFile(wallpaperPath, result.response);

			return wallpaperPath;
		}
	}

	async function loadWallpaperList(url: string) {
		const result = await env.network.request<string[]>("get", url, "json");

		if (result.isOk) {
			const arr = result.response;

			const promises = arr.map((url) => loadNetworkWallpaper(url));

			await Promise.all(promises);
		}
	}

	WALLPAPER_SOURCES.forEach((url) => loadWallpaperList(url));

	setNetworkWallpaper(DEFAULT_WALLAPER);

	function drawWallpaper() {
		if (bitmap) {
			state.ctx.drawImage(bitmap, 0, 0, state.width, state.height);
		} else {
			state.ctx.fillStyle = "rgba(0,0,0,1)";
			state.ctx.fillRect(0, 0, state.width, state.height);
		}
	}

	function renderHelp() {
		const ctx = state.ctx;
		const x = 5;
		const y = 5;

		const width = state.width - 10;
		const height = 330;

		const region = new Path2D();
		region.roundRect(x, y, width, height, 7);

		ctx.save();
		ctx.clip(region, "evenodd");

		// Window box
		rect(ctx, x, y, width, height, windowFill, focusedWindowStroke);

		drawLog(
			ctx,
			[
				{
					text: "Constellation is keyboard-only, so we're going to run you through the controls. Here, the "
				},
				{ text: "Navigator Key", colour: "#ff0000" },
				{ text: " is Control or Alt, whichever suits you.\n" },
				{
					text: "Within apps, up/down arrow keys are used to navigate and enter/space can\nbe pressed to activate buttons. Space/enter may have different results, Enter is the primary.\n\n"
				},
				{
					text: "To switch windows within a workspace, hold the Navigator key and press the right or left arrows.\n"
				},
				{
					text: "To open the palette from which you will open apps, hold the Navigator key and press the space key.\n\n"
				},
				{
					text: 'This prompt will close once you press escape or interact with a window and can be re-summoned from the palette under "Help".'
				}
			],
			x + 15,
			y + headerHeight + 15
		);

		// draw header
		rect(ctx, x, y, width, headerHeight, `rgb(95 95 95)`);

		const name = "New to Constellation?";
		const headerDimensions = measureText(ctx, name, "monospace", 20);
		const padding = (headerHeight - headerDimensions.height) / 2;

		text(
			ctx,
			x + padding,
			y + padding,
			name,
			"rgb(255 255 255)",
			"monospace",
			20
		);

		ctx.restore();
	}

	while (true) {
		windowManager.reposition();

		drawWallpaper();

		const drawWindow = (info: WindowInfo, focused?: boolean) => {
			state.ctx.fillStyle = "black";
			state.ctx.strokeStyle = "white";

			const isFocused = focused || windowManager.windowFocused(info);

			info?.window?.render?.(
				state.ctx,
				info.x - state.scrollX,
				info.y,
				info.width,
				info.height,
				isFocused
			);
		};

		for (const info of windowManager.windows) {
			drawWindow(info);
		}

		if (windowManager.palette !== undefined) {
			drawWindow(windowManager.palette, true);
		}

		if (renderNew) renderHelp();

		yield;
	}
}
