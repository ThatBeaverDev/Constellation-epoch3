//import { env } from "../lib/utils";

import { FilesystemInterface } from "../lib/fs";
import { ProgramStore } from "../runtime";
import { onPasteData } from "../types/worker";

const lineHeight = 15;
function linesToPx(lines: number) {
	return lineHeight * lines;
}

export interface KeyPressModifiers {
	/**
	 * Whether Control on Windows/Linux is pressed, Command on macOS. Also returns whether 'Meta' (super/windows) was pressed, due to implementation.
	 */
	control: boolean;
	/**
	 * Whether Alt on Windows/Linux is pressed, Option on macOS
	 */
	alt: boolean;
	/**
	 * Shift is pressed
	 */
	shift: boolean;
}

export interface UiManager {
	log(source: string, message: Log): void;
	warn(source: string, message: Log): void;
	error(source: string, message: Log, console?: boolean): void;

	clear(): void;
	input(
		message?: string,
		hideTyping?: boolean,
		keepInput?: boolean,
		onPaste?: (data: onPasteData) => void
	): Promise<{ response: string; displayText: string }>;

	controller?: ProgramStore;

	exit(): Promise<void> | void;
}

type HexColour = string;
type LogSegment =
	| {
			type?: "string";
			text: string;
			colour?: HexColour;
	  }
	| {
			type: "image";
			url: string;

			/**
			 * width in lines
			 */
			width: number;

			/**
			 * height in lines
			 */
			height?: number;
	  }
	| {
			type: "image";
			dir: string;

			/**
			 * width in lines
			 */
			width: number;

			/**
			 * height in lines
			 */
			height?: number;
	  };

export type ArrayLog = LogSegment[];
export type Log = string | ArrayLog;

type NormalizedLog = LogSegment[];

function normalizeLog(log: Log): NormalizedLog {
	if (typeof log === "string") {
		return [{ text: log }];
	}

	return log;
}

function escapeHtml(text: string) {
	return String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
		.replaceAll("\n", "<br>");
}

function renderConsole(log: NormalizedLog = []) {
	let text = "";
	const styles: string[] = [];

	for (const part of log) {
		switch (part.type) {
			case undefined:
			case "string":
				text += `%c${part.text}`;
				styles.push(part.colour ? `color: ${part.colour};` : "");
				break;

			case "image":
				text += `%c[Image from Location ${"url" in part ? part.url : part.dir}.]`;
				styles.push("color: #ffff00");

				break;

			default:
				// @ts-expect-error // trust
				text += `%cError parsing log request, unknown segment type ${part.type}`;
				styles.push("color: #ff0000;");
		}
	}

	return { text, styles };
}

const urlRegex = /https?:\/\/[^\s"'\\]+[^\s"']+/g;
async function renderHtml(
	log: NormalizedLog = [],
	readFile: FilesystemInterface["readFile"]
) {
	const partPromises = log.map(async (part) => {
		switch (part.type) {
			case undefined:
			case "string": {
				const escaped = escapeHtml(part.text);

				const URLs = escaped.match(urlRegex);

				const segments = [];
				let text = escaped;

				for (const url of URLs ?? []) {
					const beforeURL = text.textBefore(url);
					segments.push(
						beforeURL,
						`<a target="_blank" rel="noopener noreferrer" href="${url}">${url}</a>`
					);

					text = text.textAfter(url);
				}
				segments.push(text);

				const result = segments.join("");

				return `<span style="color: ${part.colour ?? "inherit"};">${result}</span>`;
			}

			case "image":
				let src = "";
				if ("url" in part) src = part.url;
				else src = (await readFile(part.dir)) ?? "";

				if (
					typeof part.height !== "number" &&
					part.height !== undefined &&
					part.height !== "auto"
				) {
					return `<span style="color: #ff0000;">Image height must be number or "auto", was given ${escapeHtml(part.height)}</span>`;
				}

				return `<img src="${src}" style="width: ${linesToPx(Number(part.width))}px; height: ${part.height ? `${linesToPx(part.height)}px` : "auto"}" />`;

			default:
				// @ts-expect-error // trust
				return `<span style="color: #ff0000;">Error parsing log request, unknown segment type ${escapeHtml(part.type)}</span>`;
		}
	});

	const parts = await Promise.all(partPromises);

	return parts.join("");
}

function withOrigin(
	origin: string,
	log: NormalizedLog,
	includeOrigin: boolean
): NormalizedLog {
	if (!includeOrigin) return log;

	return [{ text: `[${origin}] `, colour: "#888888" }, ...log];
}

const maxLogLines = 500;
class DomManager implements UiManager {
	#container: HTMLDivElement;
	#logbox: HTMLDivElement;

	mode: "tui" | "gui" = "tui";
	controller?: ProgramStore;
	lines: {
		element: HTMLElement;
	}[] = [];
	#fs: FilesystemInterface;
	#focusInterval: number = 0;
	#input?: HTMLInputElement;

	constructor(fs: FilesystemInterface) {
		this.#fs = fs;
		this.#container = document.createElement("div");
		this.#container.classList.add("DomUI");

		this.#container.innerHTML = `<style>
html {
	position: absolute;
	top: 0;
	left: 0;
	width: 100vw;
	min-height: 100vh;
}

body {
	margin: 0;
	padding: 0;
}

div.DomUI {
	position: absolute;
	top: 0;
	left: 0;
	width: 100vw;
	min-height: 100vh;
	background-color: black;
}

div.LogBox {
	position: relative;
	display: flex;
	flex-direction: column;
	overflow-y: auto;
	width: 100vw;
	white-space: break-spaces;
}

div.LogBox > p {
	width: 100%;
	line-height: ${lineHeight}px;

	margin: 0;
	padding: 0;
	color: white;
	font-family: monospace;
}

div.LogBox > p.warning {
	color: yellow;
}

div.LogBox > p.error {
	color: red;
}

div.LogBox > p > img {
	overflow: hidden;
	filter: saturate(0.68) contrast(1.2);
	image-rendering: pixelated;
}

div.LogBox > p > span > a {
	color: inherit;
	text-decoration: none;
}

div.LogBox > p > span > a:hover {
	text-decoration: underline;
}

div.LogBox > div.input {
	width: 100%;
	height: 15px;
	display: flex;
	flex-direction: row;
	order: 999999;
	margin: 0;
	padding: 0;
	color: white;
	font-family: monospace;
}

div.LogBox > div.input > p {
	margin: 0;
}

div.LogBox > div.input > input.reqInput {
	flex: 1;
	background: transparent;
	border: none !important;
	outline: none !important;
	padding: 0 !important;
	margin: 0 !important;
	color: white;
	font-family: monospace;
}
</style>`;

		this.#logbox = document.createElement("div");
		this.#logbox.classList.add("LogBox");

		this.#container.appendChild(this.#logbox);

		this.#focusInterval = setInterval(() => {
			if (this.#input) this.#input.focus();
		}, 500);

		document.body.innerHTML = "";
		document.body.appendChild(this.#container);
	}

	#includeOrigin() {
		return !this.controller;
	}

	#elementQueue: { element: HTMLElement; onAddition?: Function }[] = [];
	#commitScheduled = false;

	#newLog(element: HTMLElement, onAddition?: Function) {
		this.#elementQueue.push({ element, onAddition });
		this.lines.push({ element });

		if (!this.#commitScheduled) {
			this.#commitScheduled = true;

			requestAnimationFrame(() => {
				const fragment = document.createDocumentFragment();
				const html = document.scrollingElement as HTMLElement;
				const isScrolledToBottom =
					html.scrollTop >= html.scrollHeight - html.offsetHeight - 5;

				for (const item of this.#elementQueue) {
					fragment.appendChild(item.element);

					// insure not too many lines
					if (this.lines.length > maxLogLines) {
						const removed = this.lines.shift();
						removed?.element.remove();
					}
				}

				this.#logbox.appendChild(fragment);
				this.#elementQueue.forEach((item) => {
					if (item.onAddition) item.onAddition();
				});

				if (isScrolledToBottom) {
					html.scrollTo(0, html.scrollHeight);
				}

				this.#elementQueue = [];
				this.#commitScheduled = false;
			});
		}
	}

	/**
	 * The queue of logs, waiting to be displayed.
	 */

	#postPlain(message: string, className?: string) {
		const text = document.createElement("p");
		if (className) text.classList.add(className);

		text.innerText = message;
		this.#newLog(text);
	}

	#postRich(log: NormalizedLog) {
		const p = document.createElement("p");
		p.innerHTML = "...";
		this.#newLog(p);

		renderHtml(log, this.#fs.readFile.bind(this.#fs)).then((html) => {
			const containerHTML = document.scrollingElement as HTMLElement;
			const isScrolledToBottom =
				containerHTML.scrollTop >=
				containerHTML.scrollHeight - containerHTML.offsetHeight - 5;

			p.innerHTML = html;

			if (isScrolledToBottom) {
				containerHTML.scrollTo(0, containerHTML.scrollHeight);
			}
		});
	}

	log(origin: string, message: Log) {
		const normalized = withOrigin(
			origin,
			normalizeLog(message),
			this.#includeOrigin()
		);

		const consoleData = renderConsole(normalized);
		console.log(consoleData.text, ...consoleData.styles);

		this.#postRich(normalized);
	}

	warn(origin: string, message: string) {
		const data = this.#includeOrigin() ? `[${origin}] ${message}` : message;
		console.warn(data);
		this.#postPlain(data, "warning");
	}

	error(origin: string, message: string, consoleLog: boolean = true) {
		const data = this.#includeOrigin() ? `[${origin}] ${message}` : message;
		if (consoleLog) console.error(data);
		this.#postPlain(data, "error");
	}

	input(
		prompt: string,
		hideTyping: boolean = false,
		showLogAfter: boolean = true,
		onPaste?: (result: {
			type: "image" | "text" | "file";
			data: string;
		}) => void
	) {
		return new Promise<{ response: string; displayText: string }>(
			(resolve) => {
				const text = document.createElement("p");
				text.innerText = prompt;

				const input = document.createElement("input");
				input.classList.add("reqInput");
				input.type = hideTyping ? "password" : "text";
				this.#input = input;

				input.addEventListener("paste", (event) => {
					const clipboardData = event.clipboardData;
					if (!clipboardData || !onPaste) return;

					for (let i = 0; i < clipboardData.items.length; i++) {
						const item = clipboardData.items[i];
						const { type } = item;

						if (type === "text/plain") {
							item.getAsString((text) => {
								onPaste({ type: "text", data: text });
							});
							return;
						} else {
							event.preventDefault();

							const isSvg = type == "application/svg+xml";
							const isImage = isSvg || type.startsWith("image/");

							const file = item.getAsFile();
							if (!file) continue;

							const reader = new FileReader();
							reader.onload = (e) => {
								const result =
									typeof e.target?.result === "string"
										? e.target.result
										: "";

								onPaste({
									type: isImage ? "image" : "file",
									data: result
								});
							};

							reader.readAsDataURL(file);
							return;
						}
					}
				});

				const div = document.createElement("div");
				div.classList.add("input");
				div.appendChild(text);
				div.appendChild(input);

				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						const response = input.value;
						div.remove();

						const displayText = `${prompt}${response}`;
						if (showLogAfter) this.#postPlain(displayText);

						this.#input = undefined;
						resolve({ response, displayText });
					}
				});

				this.#newLog(div, () => input.focus());
			}
		);
	}

	clear() {
		this.lines.forEach((line) => line.element.remove());
		this.lines = [];

		this.#elementQueue.forEach((item) => item.element.remove());
		this.#elementQueue = [];

		this.#logbox.innerHTML = "";
	}

	exit() {
		clearInterval(this.#focusInterval);
	}
}

//class CLIManager implements UiManager {}

const Ui: new (fs: FilesystemInterface) => UiManager =
	DomManager; /*env == "web" ? DomManager : CLIManager; */
export default Ui;
