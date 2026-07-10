import Fuse from "fuse.js";
import { Environment } from "../../../../util/types/worker";
import GraphicalUIManager from "../lib.gui";
import { WindowContentItem } from "../types/windowContents";
import WindowManager, { PaletteIndex } from "../windows";

export const paletteWidth = 500;
export const paletteHeight = 750;

const paletteSearchIdentifier = "paletteSearch";
export default class PaletteHandler {
	#guiLib: GraphicalUIManager;
	#searchTerm: string = "";

	constructor(
		public env: Environment,
		public windowSystem: WindowManager
	) {
		this.#guiLib = new GraphicalUIManager(env);
	}

	async init() {
		await this.#guiLib.init("Palette");

		this.#guiLib.onTextboxCompletion = (contents, reference) => {
			switch (reference) {
				case paletteSearchIdentifier:
					this.#searchTerm = contents;
					this.update();

					const top = this.#topResult;
					if (!top?.directory) return;

					this.env.execute(top.directory);
					this.windowSystem.hidePalette();
					break;
			}
		};

		this.#guiLib.onTextboxValueChange = (contents, reference) => {
			switch (reference) {
				case paletteSearchIdentifier:
					this.#searchTerm = contents;
					this.update();
					break;
			}
		};

		this.#guiLib.onButtonPress = (reference) => {
			const entry = this.#indexCache?.find?.(
				(item) => item.directory == reference
			);

			if (!entry) return;

			this.env.execute(entry.directory);
		};

		this.#guiLib.onKeyPress = () => {};
	}

	#indexCache?: PaletteIndex;
	#topResult?: PaletteIndex[0];
	update(idx?: PaletteIndex) {
		const items: WindowContentItem[] = [];

		const index = idx ?? this.#indexCache;
		if (!index) return;
		this.#indexCache = index;

		items.push({
			type: "textBox",
			message: "",
			backText: "Search Constellation",
			identifier: paletteSearchIdentifier,

			x: 5,
			y: 5
		});

		const lineHeight = 20;
		let y = 5;

		const searcher = new Fuse(index, {
			keys: ["name", "directory"],
			isCaseSensitive: false,
			includeScore: true
		});

		const results = searcher.search(this.#searchTerm);
		this.#topResult = results[0].item;

		items.push(
			...results.map((result): WindowContentItem => {
				y += lineHeight;

				return {
					type: "button",
					text: result.item.name,
					x: 5,
					y: y,
					identifier: result.item.directory
				};
			})
		);

		this.#guiLib.setContents(items);
	}
}
