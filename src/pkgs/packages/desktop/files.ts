import { Environment } from "../../../util/types/worker";
import GraphicalUIManager from "../gui/lib.gui";
import { WindowContentItem } from "../gui/types/windowContents";

export default async function* FilesApp(env: Environment) {
	const lib = new GraphicalUIManager(env);
	await lib.init("Files");

	let path = "/";

	async function updateUI() {
		const contents = await env.fs.readdir(path);

		const ui: WindowContentItem[] = [];

		let y = 5;

		for (const item of contents) {
			ui.push({ type: "text", text: item, x: 5, y: (y += 20) });
		}

		lib.setContents(ui);
	}

	updateUI();

	while (true) {
		yield;
	}
}
