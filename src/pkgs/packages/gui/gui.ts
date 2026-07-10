import { Environment } from "../../../util/types/worker";
import SocketManager from "./socket";
import WindowManager, { WindowInfo } from "./windows";

export const WIDTH = 3200;
export const HEIGHT = 1800;

export default async function* GraphicalEnvironment(env: Environment) {
	const { canvas, id: liveCanvasId } = await env.getLiveCanvas(WIDTH, HEIGHT);

	env.print([
		{ type: "liveCanvas", id: liveCanvasId, width: 160, height: 90 }
	]);

	const ctx = canvas.getContext("2d")!;

	const windowManager = new WindowManager(env);

	const socketManager = new SocketManager(env, windowManager);
	windowManager.socketManager = socketManager;

	await socketManager.init();
	await windowManager.init();

	while (true) {
		windowManager.reposition();

		ctx.fillStyle = "red";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const drawWindow = (info: WindowInfo, focused?: boolean) => {
			ctx.fillStyle = "black";
			ctx.strokeStyle = "white";

			const isFocused =
				focused || windowManager.windowFocused(info.window.id);

			info?.window?.render?.(
				ctx,
				info.x,
				info.y,
				info.width,
				info.height,
				isFocused
			);
		};

		for (const info of windowManager.windows) {
			if (info == undefined) continue;
			if (windowManager.palette?.window?.id == info.window.id) continue; // rendered explicitly later

			drawWindow(info);
		}

		if (windowManager.palette !== undefined) {
			windowManager.refreshPalette();

			drawWindow(windowManager.palette, true);
		}

		yield;
	}
}
