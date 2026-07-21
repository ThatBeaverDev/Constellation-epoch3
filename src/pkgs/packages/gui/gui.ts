import { Environment } from "../../../util/types/worker";
import {
	GUI_DATA_PATH,
	WALLPAPER_INDEX_PATH,
	WALLPAPER_SOURCES
} from "./constants";
import SocketManager from "./socket";
import WindowManager, { WindowInfo } from "./windows";

const lineGap = 15;

export interface GuiState {
	ctx: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
}

export default async function* GraphicalEnvironment(env: Environment) {
	await env.fs.mkdir(GUI_DATA_PATH);
	await env.fs.mkdir(WALLPAPER_INDEX_PATH);

	async function renderCanvas(widthPx: number): Promise<GuiState> {
		const lineWidth = widthPx / lineGap;

		const width = widthPx;
		const height = width / 1.777777777777777;

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
				height: lineWidth / 1.777777777777777
			}
		]);

		const ctx = canvas.getContext("2d")!;

		return { ctx, width, height };
	}

	let state = await renderCanvas((await env.terminalDimensions()).width);

	env.addEventListener("resize", async ({ width }) => {
		const result = await renderCanvas(width);

		state.ctx = result.ctx;
		state.width = result.width;
		state.height = result.height;
	});

	const windowManager = new WindowManager(env, state);

	const socketManager = new SocketManager(env, windowManager);
	windowManager.socketManager = socketManager;

	await socketManager.init();
	await windowManager.init();

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

	setNetworkWallpaper(
		"https://raw.githubusercontent.com/Mistium/Origin-OS/main/Wallpapers/originOS%20Rift.png"
	);

	function drawWallpaper() {
		if (bitmap) {
			state.ctx.drawImage(bitmap, 0, 0, state.width, state.height);
		} else {
			state.ctx.fillStyle = "rgba(0,0,0,1)";
			state.ctx.fillRect(0, 0, state.width, state.height);
		}
	}

	while (true) {
		windowManager.reposition();

		drawWallpaper();

		const drawWindow = (info: WindowInfo, focused?: boolean) => {
			state.ctx.fillStyle = "black";
			state.ctx.strokeStyle = "white";

			const isFocused =
				focused || windowManager.windowFocused(info.window.id);

			info?.window?.render?.(
				state.ctx,
				info.x,
				info.y,
				info.width,
				info.height,
				isFocused
			);
		};

		for (const id in windowManager.windows) {
			const info = windowManager.windows[id];
			if (info == undefined) continue;

			drawWindow(info);
		}

		if (windowManager.palette !== undefined) {
			drawWindow(windowManager.palette, true);
		}

		yield;
	}
}
