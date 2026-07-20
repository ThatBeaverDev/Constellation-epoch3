import { sleep } from "../../../util/lib/time";
import { Environment } from "../../../util/types/worker";
import GraphicalUIManager from "../gui/lib.gui";

export default async function* DesktopEnv(env: Environment) {
	await env.execute("/sbin/gui.js", undefined, { handOverDisplay: true });

	// let socket init
	// TODO: Make less 'flimsy'
	await sleep(250);

	const lib = new GraphicalUIManager(env);
	await lib.init("Desktop Tester");

	let i = 0;
	while (true) {
		const range = 250;
		const val = i++ % range;
		if (val == 0) {
			lib.setContents([
				{ type: "text", text: "Hello, world!", x: 0, y: 0 }
			]);
		} else if (val == Math.floor(range / 2)) {
			lib.setContents([
				{ type: "text", text: "Hello, planet!", x: 0, y: 0 }
			]);
		}

		yield;
	}
}
