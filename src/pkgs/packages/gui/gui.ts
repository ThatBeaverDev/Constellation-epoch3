import { Environment } from "../../../util/types/worker";
import SocketManager from "./socket";
import WindowManager from "./windows";

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

	windowManager.newWindow(undefined, "GUI Test");
	windowManager.newWindow(undefined, "silly");
	windowManager.newWindow(undefined, "files");

	while (true) {
		windowManager.reposition();

		ctx.fillStyle = "red";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);

		const current = windowManager.currentWindow;
		for (const info of windowManager.windows) {
			ctx.fillStyle = "black";
			ctx.strokeStyle = "white";

			info?.window?.render?.(
				ctx,
				info.x,
				info.y,
				info.width,
				info.height,
				info.window == current?.window
			);
		}

		yield;
	}
}
