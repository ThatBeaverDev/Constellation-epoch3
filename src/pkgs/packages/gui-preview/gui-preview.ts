import {
	directoryColour,
	executableColour,
	socketColour
} from "../../../util/lib/colours";
import { logToString } from "../../../util/lib/logs";
import { sleep } from "../../../util/lib/time";
import { Environment, Log } from "../../../util/types/worker";
import GuiWindow from "../gui/lib.gui";
import { WindowContentItem, WindowText } from "../gui/types/windowContents";

// @app-name: Preview
// @app-palette-show: false

async function getData(env: Environment, file?: string, input?: Log) {
	if (file) {
		return await env.fs.readFile(file);
	} else if (input) {
		return logToString(input);
	} else {
		return "";
	}
}

async function getType(env: Environment, data: string, dir?: string) {
	if (dir) {
		const stats = await env.fs.stats(dir);

		switch (stats?.type) {
			case "directory":
				return "directory";
			case "socket":
				return "socket";
		}
	}

	if (!data.startsWith("data:")) {
		return "text";
	}

	const noPrefix = data.substring(5);

	if (noPrefix.startsWith("text/")) {
		return "image";
	}

	if (noPrefix.startsWith("image/")) {
		return "image";
	}

	if (noPrefix.startsWith("audio/")) {
		return "audio";
	}

	if (noPrefix.startsWith("video/")) {
		return "video";
	}

	return "text";
}

export default async function* previewFile(
	env: Environment,
	[file]: [string | undefined],
	input?: Log
) {
	const windowName = file ? file.textAfterAll("/") : "Preview";

	const gui = new GuiWindow(env);
	const guiInit = gui.init(windowName);

	const data = (await getData(env, file, input)) ?? "";

	const type = await getType(env, data, file);

	await guiInit;

	async function render() {
		const { width, height } = gui.dimensions;

		switch (type) {
			case "text": {
				let y = 5;
				gui.setContents([
					...data.split("\n").map((item): WindowText => {
						y += 20;

						return { type: "text", x: 5, y: y - 20, text: item };
					})
				]);
				break;
			}

			case "image":
				if (file) {
					gui.setContents([
						{
							type: "image",
							x: 5,
							y: 5,
							width,
							height,
							sourceType: "file",
							source: file
						}
					]);
				} else {
					gui.setContents([{ type: "text", x: 5, y: 5, text: data }]);
				}

				break;

			case "directory":
				const children = await env.fs.readdir(file!);

				let y = 45;
				const childGap = 45;

				gui.setContents([
					{
						type: "text",
						x: 5,
						y: 5,
						text: `${file}`,
						fontSize: 30
					},
					{
						type: "text",
						x: 5,
						y: 45,
						text:
							children.length == 1
								? "1 Child"
								: `${children.length} Children`
					},
					...(
						await Promise.all(
							children.map(
								async (child): Promise<WindowContentItem[]> => {
									const path = env.path.join(file!, child);
									const stats = await env.fs.stats(path);

									const colour = (() => {
										switch (stats?.type) {
											case "file":
												if (path.endsWith(".js")) {
													return executableColour;
												}
												return undefined;

											case "directory":
												return directoryColour;

											case "socket":
												return socketColour;
										}
									})();

									return [
										{
											type: "text",
											x: 15,
											y: (y += childGap),
											text: [{ text: child, colour }]
										},
										{
											type: "text",
											x: 315,
											y,
											text: stats?.type ?? "Unknown"
										},

										{
											type: "box",
											x: 15,
											y: y - 10,
											width: width - 30,
											height: 1,
											fill: "rgb(150 150 150)"
										}
									];
								}
							)
						)
					).flat()
				]);
				break;

			default:
				gui.setContents([
					{
						type: "text",
						x: 5,
						y: 5,
						text: `Type not supported (${type})`
					}
				]);
		}
	}

	render();

	while (true) {
		await sleep(5000);
		render();
		yield;
	}
}
