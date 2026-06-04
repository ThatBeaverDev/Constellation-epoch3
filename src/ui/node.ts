import { ProgramStore } from "../runtime";
import { UiManager } from "./ui";
import { InputConfig, Log } from "../util/types/worker";
import { normalizeLog, renderConsole, withOrigin } from "./shared";

// @ts-expect-error
import readline_import from "node:readline";
const readline: any = readline_import;

declare const process: any;

export default class NodeUI implements UiManager {
	controller?: ProgramStore;
	cancelInput?: () => void;

	constructor() {
		this.#interface = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
	}

	plain(message: Log) {
		const normalized = normalizeLog(message);

		const rendered = renderConsole(normalized);

		console.log(rendered.text, ...rendered.styles);
	}

	log(origin: string, message: Log) {
		const normalized = normalizeLog(message);
		const originated = withOrigin(origin, normalized);

		const rendered = renderConsole(
			this.controller ? normalized : originated
		);

		console.log(rendered.text, ...rendered.styles);
	}

	warn(origin: string, message: Log) {
		const normalized = normalizeLog(message, "#ffd900");
		const originated = withOrigin(origin, normalized);

		const rendered = renderConsole(
			this.controller ? normalized : originated
		);

		console.warn(rendered.text, ...rendered.styles);
	}

	error(origin: string, message: Log) {
		const normalized = normalizeLog(message, "#ff0000");
		const originated = withOrigin(origin, normalized);

		const rendered = renderConsole(
			this.controller ? normalized : originated
		);

		console.error(rendered.text, ...rendered.styles);
	}

	clear() {
		console.clear();
	}

	#interface: any;
	input(
		prompt: string,
		config: InputConfig
	): Promise<
		| { response: string; displayText: string; finished: true }
		| { finished: false }
	> {
		return new Promise((resolve) => {
			const controller = new AbortController();
			const signal = controller.signal;

			this.cancelInput = () => {
				controller.abort();
				resolve({ finished: false });
			};

			this.#interface.question(
				prompt,
				(response: string) => {
					if (!config.leaveInputOnCompletion)
						readline.moveCursor(process.stdout, 0, -1);

					const displayText = `${prompt}${response}`;
					if (config.leaveInputOnCompletion) this.plain(displayText);

					this.cancelInput = undefined;

					resolve({
						response: response,
						finished: true,
						displayText
					});
				},
				{ signal }
			);

			if (config.initialText) this.#interface.write(config.initialText);
		});
	}

	exit(): Promise<void> | void {
		this.#interface.close();
	}
}
