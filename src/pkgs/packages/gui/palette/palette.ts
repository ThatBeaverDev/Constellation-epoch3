import Fuse from "fuse.js";
import { Environment } from "../../../../util/types/worker";
import GuiWindow from "../lib.gui";
import { WindowContentItem } from "../types/windowContents";
import WindowManager, { PaletteIndex } from "../windows";
import { AppMetadata, getAppMetadata } from "../../../../util/lib/appMetadata";
import { flatPromiseMap } from "../../../../util/lib/arrays";

export const paletteWidth = 500;
export const paletteHeight = 750;

const paletteSearchIdentifier = "paletteSearch";
export default class PaletteHandler {
	#guiLib: GuiWindow;
	#searchTerm: string = "";

	constructor(
		public env: Environment,
		public windowSystem: WindowManager
	) {
		this.#guiLib = new GuiWindow(env);
	}

	async init() {
		await this.#guiLib.init("Palette");

		this.#guiLib.onTextboxCompletion = (contents, reference) => {
			switch (reference) {
				case paletteSearchIdentifier:
					this.#searchTerm = contents;
					this.update();

					const top = this.#topResult;
					if (top?.directory) this.#handleTriggerEntry(top.directory);
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
			this.#handleTriggerEntry(reference);
		};

		this.#guiLib.onKeyPress = () => {};
	}

	#handleTriggerEntry(reference: string) {
		switch (reference) {
			case "gui://showHelp":
				this.windowSystem.showHelp?.();
				break;

			default:
				const entry = this.#indexCache?.find?.(
					(item) => item.directory == reference
				);

				if (!entry) return;

				this.env.execute(entry.directory);
		}

		this.windowSystem.hidePalette();
	}

	resetSearchQuery() {
		this.#guiLib.setTextboxContents(paletteSearchIdentifier, "");
	}

	#indexCache?: PaletteIndex;
	#topResult?: PaletteIndex[0];
	#appMetadataCache: Record<string, AppMetadata | null | void> = {};
	async #appMetadata(directory: string) {
		const cacheValue = this.#appMetadataCache[directory];
		if (cacheValue || (cacheValue == null && cacheValue !== undefined)) {
			return this.#appMetadataCache[directory];
		}

		const metadata = await getAppMetadata(this.env, directory);

		if (metadata) {
			this.#appMetadataCache[directory] = metadata;
		} else {
			this.#appMetadataCache[directory] = null;
		}

		return metadata;
	}

	async update(idx?: PaletteIndex) {
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

		const lineHeight = 25;
		let y = 5;

		const searcher = new Fuse(
			[...index, { name: "Help", directory: "gui://showHelp" }],
			{
				keys: ["name", "directory"],
				isCaseSensitive: false,
				includeScore: true
			}
		);

		const results = searcher.search(this.#searchTerm);
		this.#topResult = results[0]?.item;

		const baseY = y;
		if (this.#searchTerm.trim().length > 2) {
			items.push(
				...(await flatPromiseMap(
					results,
					async (result, i): Promise<WindowContentItem[] | void> => {
						const y = baseY + (i + 1) * lineHeight;

						const metadata = await this.#appMetadata(
							result.item.directory
						);

						if (metadata?.["app-palette-show"] == "false") {
							return undefined;
						}

						return [
							{
								type: "button",
								text:
									metadata?.["app-name"] ?? result.item?.name,
								x: 5,
								y: y,
								identifier: result.item?.directory
							}
						];
					}
				))
			);
		} else {
			y += lineHeight * 3;

			const baseY = y;
			items.push(
				{
					type: "text",
					text: "Apps",
					x: 5,
					y: y - lineHeight,
					fontSize: 30
				},

				...(await flatPromiseMap(
					index,
					async (item, i): Promise<WindowContentItem[] | void> => {
						const y = baseY + (i + 1) * lineHeight;

						const metadata = await this.#appMetadata(
							item.directory
						);

						if (metadata?.["app-palette-show"] == "false") {
							return undefined;
						}

						return [
							{
								type: "button",
								text: metadata?.["app-name"] ?? item?.name,
								x: 5,
								y: y,
								identifier: item?.directory
							}
						];
					}
				))
			);
		}

		this.#guiLib.setPointerPosition(0);
		this.#guiLib.setContents(items);
	}
}
