import { Environment } from "../../../util/types/worker";
import GraphicalUIManager from "../gui/lib.gui";
import { WindowContentItem } from "../gui/types/windowContents";

function header(width: number, path: string) {
	const height = 50;

	const contents: WindowContentItem[] = [
		{ type: "box", x: 0, y: 0, width, height },
		{ type: "text", x: 5, y: 5, text: path }
	];

	return { height, contents };
}

export default async function* FilesApp(env: Environment) {
	const lib = new GraphicalUIManager(env);
	await lib.init("Files");

	let path = "/";

	async function updateUI() {
		const contents = await env.fs.readdir(path);

		const ui: WindowContentItem[] = [];
		const { height: headerHeight, contents: headerContents } = header(
			lib.dimensions.width,
			path
		);
		ui.push(...headerContents);

		let y = 5 + headerHeight;

		for (const item of contents) {
			const row: WindowContentItem[] = [
				{
					type: "box",
					x: 5,
					y: (y += 50),
					width: lib.dimensions.width - 20,
					height: 40
				},
				{ type: "text", text: item, x: 5, y: y + 5 }
			];

			ui.push(...row);
		}

		lib.setContents(ui);
	}

	updateUI();

	while (true) {
		yield;
	}
}
