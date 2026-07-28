import {
	directoryColour,
	executableColour,
	socketColour
} from "../../../util/lib/colours";
import { logToString } from "../../../util/lib/logs";
import { sleep } from "../../../util/lib/time";
import { Environment, Log } from "../../../util/types/worker";
import { WindowContentItem, WindowText } from "../gui/types/windowContents";
import include from "../../../util/lib/include";

// @app-name: Preview
// @app-palette-show: false
// @app-icon: data:image/png;base64,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

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

	const { default: GuiWindow } = await include(env, "lib-gui");

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
