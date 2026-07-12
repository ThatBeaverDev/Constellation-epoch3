import { Environment } from "../../../util/types/worker";
import SocketManager from "./socket";
import WindowManager, { WindowInfo } from "./windows";

const lineGap = 15;

export interface GuiState {
	ctx: OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
}

export default async function* GraphicalEnvironment(env: Environment) {
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

	while (true) {
		windowManager.reposition();

		state.ctx.fillStyle = "red";
		state.ctx.fillRect(0, 0, state.width, state.height);

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
