import Fuse from "fuse.js";
import { Environment } from "../../../../util/types/worker";
import type GuiWindow from "../../lib-gui/lib-gui";
import {
	WindowBox,
	WindowContentItem,
	WindowImage,
	WindowText
} from "../types/windowContents";
import WindowManager, { PaletteIndex } from "../windows";
import { AppMetadata, getAppMetadata } from "../../../../util/lib/appMetadata";
import { flatPromiseMap } from "../../../../util/lib/arrays";
import include from "../../../../util/lib/include";

export const paletteWidth = 500;
export const paletteHeight = 750;

const paletteSearchIdentifier = "paletteSearch";
export default class PaletteHandler {
	#guiLib?: GuiWindow;
	#searchTerm: string = "";

	constructor(
		public env: Environment,
		public windowSystem: WindowManager
	) {}

	async init() {
		const { default: GuiWindow } = await include(this.env, "lib-gui");

		this.#guiLib = new GuiWindow(this.env);
		await this.#guiLib.init("Search");

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
		if (!this.#guiLib) return;

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

		const lineHeight = 30;
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

		const appPaletteEntry = async (
			y: number,
			item: { directory: string; name: string }
		) => {
			const metadata = await this.#appMetadata(item.directory);

			if (metadata?.["app-palette-show"] == "false") {
				return undefined;
			}

			const icon = metadata?.["app-icon"];
			const name = metadata?.["app-name"] ?? item?.name;

			return [
				{
					type: "box",
					x: 5,
					y: y - 5,
					width: (this.#guiLib?.dimensions.width ?? 100) - 10,
					height: lineHeight,

					identifier: item?.directory
				} as WindowBox,
				{
					type: "text",
					text: name,
					x: icon ? 35 : 5,
					y: y
				} as WindowText,
				icon
					? ({
							type: "image",
							x: 10,
							y: y - 1,
							width: 20,
							height: 20,
							sourceType: "url",
							source: icon
						} as WindowImage)
					: undefined
			].filter((item) => item !== undefined);
		};

		const baseY = y;
		if (this.#searchTerm.trim().length > 2) {
			items.push(
				...(await flatPromiseMap(
					results,
					async (result, i): Promise<WindowContentItem[] | void> => {
						const y = baseY + (i + 1) * lineHeight;

						return await appPaletteEntry(y, result.item);
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

						return await appPaletteEntry(y, item);
					}
				))
			);
		}

		if (!this.#guiLib) return;

		this.#guiLib.setPointerPosition(0);
		this.#guiLib.setContents(items);
	}
}
