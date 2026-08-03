import {
	directoryColour,
	executableColour,
	socketColour
} from "../../util/lib/colours";
import { logToString } from "../../util/lib/logs";
import { sleep } from "../../util/lib/time";
import { Environment, Log } from "../../util/types/worker";
import { WindowContentItem } from "@/types/windowContents";
import { WindowText } from "@/types/windowContents";
import include from "../../util/lib/include";

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
