import { Environment } from "../../../../util/types/worker";
import GraphicalUIManager from "../lib.gui";
import { WindowContentItem } from "../windowContents";
import WindowManager, { PaletteIndex } from "../windows";

export const paletteWidth = 500;
export const paletteHeight = 750;

export default class PaletteHandler {
	#guiLib: GraphicalUIManager;

	constructor(
		public env: Environment,
		public windowSystem: WindowManager
	) {
		this.#guiLib = new GraphicalUIManager(env);
	}

	async init() {
		await this.#guiLib.init("Palette");
	}

	update(index: PaletteIndex) {
		const items: WindowContentItem[] = [];

		items.push({
			type: "textBox",
			message: "Search Constellation",
			identifier: "paletteSearch",

			x: 5,
			y: 5
		});

		const lineHeight = 20;
		let y = 5;

		items.push(
			...index.map((item): WindowContentItem => {
				y += lineHeight;

				return { type: "text", text: item.name, x: 5, y: y };
			})
		);
	}
}
