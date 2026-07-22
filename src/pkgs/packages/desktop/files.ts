import { logToString } from "../../../util/lib/logs";
import { Environment } from "../../../util/types/worker";
import GuiWindow from "../gui/lib.gui";
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
	async function fileColour(path: string) {
		const stats = await env.fs.stats(path);

		if (!stats) return "rgb(255 255 255)";

		switch (stats.type) {
			case "directory":
				return "rgb(255 255 0)";

			case "file":
				if (path.endsWith(".js")) {
					return "rgb(138, 150, 255)";
				} else {
					return "rgb(255 255 255)";
				}

			case "socket":
				return "rgb(130, 161, 130)";
		}
	}

	const lib = new GuiWindow(env);
	await lib.init("Files");

	let path = "/";

	lib.onButtonPress = async (reference) => {
		if (reference.startsWith("button:/")) {
			const buttonPath = reference.substring(7);

			const stats = await env.fs.stats(buttonPath);

			switch (stats?.type) {
				case "directory":
					path = buttonPath;
					updateUI();
					break;

				case "file":
					if (buttonPath.endsWith(".js")) {
						const genvExec = await env.execute("/bin/genv.js", [
							"terminal"
						]);

						const { return: result } = await genvExec.onExit;
						if (!result) return;

						const terminalPath = logToString(result);
						await env.execute(terminalPath, [buttonPath]);
					}

					break;

				case "socket":
					break;
			}
		}
	};

	async function updateUI() {
		const contents = await env.fs.readdir(path);

		if (path !== "/") {
			contents.splice(0, 0, "..");
		}

		const ui: WindowContentItem[] = [];
		const { height: headerHeight, contents: headerContents } = header(
			lib.dimensions.width,
			path
		);
		ui.push(...headerContents);

		let y = 5 + headerHeight;

		for (const item of contents) {
			const dir = env.path.join(path, item);
			const stats = await env.fs.stats(dir);
			if (!stats) continue;

			const isDirectory = stats.type == "directory";

			const row: WindowContentItem[] = [
				{
					type: "box",
					x: 5,
					y: (y += 50),
					width: lib.dimensions.width - 20,
					height: 40,

					fill: "rgb(35 35 35)"
				},
				{
					type: "button",
					text: [
						{
							text: isDirectory ? item + "/" : item,
							colour: await fileColour(dir)
						}
					],
					x: 5,
					y: y + 5,
					identifier: `button:${dir}`
				}
			];

			ui.push(...row);
		}

		lib.setContents(ui);
		lib.setPointerPosition();
	}

	updateUI();

	while (true) {
		yield;
	}
}
