import { FilesystemInterface } from "../lib/fs";
import { triggerProgramEvent } from "../lib/triggerProgramEvent";
import { clamp } from "../util/lib/maths";
import { ProgramStore } from "../runtime";
import styles from "./styles.css";
import { InputConfig, Log, NormalizedLog, Sound } from "../util/types/worker";

const lineHeight = 15;
function linesToPx(lines: number) {
	return lineHeight * lines;
}

export interface UiManager {
	log(source: string, message: Log): number;
	warn(source: string, message: Log): number;
	error(source: string, message: Log, console?: boolean): number;

	clear(): void;
	cancelInput?(): void;
	input(
		message: string,
		config: InputConfig
	): Promise<
		| { response: string; displayText: string; finished: true }
		| { finished: false }
	>;

	controller?: ProgramStore;

	playSound(config: Sound): Promise<PlaySoundResponse>;

	exit(): Promise<void> | void;
}

export interface PlaySoundResponse {
	duration: number;
	onStop: Promise<number>;

	pause(): void;
	play(): void;
	remove(): void;
}

function normalizeLog(log: Log, defaultColour?: string): NormalizedLog {
	if (typeof log === "string") {
		return [{ text: log, colour: defaultColour }];
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
				text += `%c[Image from Location ${"url" in part ? part.url : part.dir}]`;
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

export function consoleLog(origin: string, message: Log) {
	const normalized = withOrigin(origin, normalizeLog(message));

	const consoleData = renderConsole(normalized);

	console.log(consoleData.text, ...consoleData.styles);
}
export function consoleWarn(origin: string, message: Log) {
	const normalized = withOrigin(origin, normalizeLog(message));

	const consoleData = renderConsole(normalized);

	console.warn(consoleData.text, ...consoleData.styles);
}
export function consoleError(origin: string, message: Log) {
	const normalized = withOrigin(origin, normalizeLog(message));

	const consoleData = renderConsole(normalized);

	console.error(consoleData.text, ...consoleData.styles);
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
				const raw = part.text;

				const segments: string[] = [];

				let lastIndex = 0;

				for (const match of raw.matchAll(urlRegex)) {
					const url = match[0];
					const index = match.index ?? 0;

					const before = raw.slice(lastIndex, index);

					segments.push(escapeHtml(before));

					const escapedURL = escapeHtml(url);

					segments.push(
						`<a target="_blank" rel="noopener noreferrer" href="${escapedURL}">${escapedURL}</a>`
					);

					lastIndex = index + url.length;
				}

				segments.push(escapeHtml(raw.slice(lastIndex)));

				return `<span style="color: ${escapeHtml(part.colour ?? "inherit")};">${segments.join("")}</span>`;
			}

			case "image":
				let src =
					"url" in part
						? part.url
						: ((await readFile(part.dir)) ?? "");

				if (
					typeof part.height !== "number" &&
					part.height !== undefined &&
					part.height !== "auto"
				) {
					return `<span style="color: #ff0000;">Image height must be number or "auto", was given ${escapeHtml(part.height)}</span>`;
				}

				const width = linesToPx(Number(part.width));

				const height =
					part.height === undefined || part.height === "auto"
						? "auto"
						: `${linesToPx(part.height)}px`;

				return `<img src="${escapeHtml(src)}" style="width: ${width}px; height: ${escapeHtml(height)}" />`;

			default:
				// @ts-expect-error // trust
				return `<span style="color: #ff0000;">Error parsing log request, unknown segment type ${escapeHtml(part.type)}</span>`;
		}
	});

	const parts = await Promise.all(partPromises);

	return parts.join("");
}

function withOrigin(origin: string, log: NormalizedLog): NormalizedLog {
	log = log ?? [];

	if (!(log instanceof Array)) {
		throw new Error("Normalized log must be provided!");
	}

	return [{ text: `[${origin}] `, colour: "#888888" }, ...log];
}

function scrollContainer(container: HTMLElement | null): () => void {
	if (!container) return () => {};
	// @ts-expect-error
	if (typeof process !== "undefined") return () => {};

	const containerHTML = container;
	const isScrolledToBottom =
		containerHTML.scrollTop >=
		containerHTML.scrollHeight - containerHTML.offsetHeight - 5;

	return () => {
		if (isScrolledToBottom) {
			containerHTML.scrollTo(0, containerHTML.scrollHeight);
		}
	};
}

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
	cancelInput?(): void;

	constructor(fs: FilesystemInterface) {
		this.#fs = fs;
		this.#container = document.createElement("div");
		this.#container.classList.add("DomUI");

		this.#container.innerHTML = `<style>${styles as string}</style>`;

		this.#logbox = document.createElement("div");
		this.#logbox.classList.add("LogBox");

		this.#container.appendChild(this.#logbox);

		this.#focusInterval = setInterval(() => {
			if (this.#input) this.#focusInput(this.#input);
		}, 500);

		this.#container.addEventListener("pointerdown", () => {
			if (this.#input) {
				this.#focusInput(this.#input);
			}
		});
		window.addEventListener("keydown", this.#onKeyDown);

		document.body.innerHTML = "";
		document.body.appendChild(this.#container);
	}

	#onKeyDown = (event: KeyboardEvent) => {
		if (!this.controller) return;

		triggerProgramEvent(this.controller, "keydown", {
			name: event.key,

			alt: event.altKey,
			shift: event.shiftKey
		});
	};

	#elementQueue: { element: HTMLElement; onAddition?: Function }[] = [];
	#commitScheduled = false;
	#commitFrame?: number;

	#newLog(
		element: HTMLElement,
		onAddition?: Function,
		addLine: boolean = true
	): number {
		this.#elementQueue.push({ element, onAddition });
		const line = this.lines.length;
		if (addLine) this.lines.push({ element });

		if (!this.#commitScheduled) {
			this.#commitScheduled = true;

			this.#commitFrame = requestAnimationFrame(() => {
				const fragment = document.createDocumentFragment();
				const scrollComplete = scrollContainer(this.#logbox);

				for (const item of this.#elementQueue) {
					fragment.appendChild(item.element);
				}

				this.#logbox.appendChild(fragment);
				this.#elementQueue.forEach((item) => {
					if (item.onAddition) item.onAddition();
				});

				scrollComplete();

				this.#elementQueue = [];
				this.#commitScheduled = false;
			});
		}

		if (addLine) return line;
		else return 0;
	}

	/**
	 * The queue of logs, waiting to be displayed.
	 */

	#postPlain(message: string, className?: string): number {
		const text = document.createElement("p");
		if (className) text.classList.add(className);

		text.innerText = message;
		return this.#newLog(text);
	}

	#postRich(log: NormalizedLog): number {
		const p = document.createElement("p");
		p.innerText = "...";

		const result = this.#newLog(p);

		const token = this.#nextRenderToken();
		(p as any).__renderToken = token;

		renderHtml(log, this.#fs.readFile.bind(this.#fs)).then((html) => {
			if ((p as any).__renderToken !== token) return;

			const scrollComplete = scrollContainer(this.#logbox);

			p.innerHTML = html;

			scrollComplete();
		});

		return result;
	}

	#nextRenderToken() {
		return Symbol();
	}

	log(origin: string, message: Log) {
		const normalized = normalizeLog(message);
		const originated = withOrigin(origin, normalized);

		const consoleData = renderConsole(originated);
		console.log(consoleData.text, ...consoleData.styles);

		return this.#postRich(normalized);
	}

	warn(origin: string, message: Log) {
		const normalized = normalizeLog(message, "#ffd900");
		const originated = withOrigin(origin, normalized);

		const consoleData = renderConsole(originated);
		console.warn(consoleData.text, ...consoleData.styles);

		return this.#postRich(normalized);
	}

	error(origin: string, message: Log, consoleLog: boolean = true) {
		const normalized = normalizeLog(message, "#ff0000");
		const originated = withOrigin(origin, normalized);

		if (consoleLog) {
			const consoleData = renderConsole(originated);
			console.error(consoleData.text, ...consoleData.styles);
		}

		return this.#postRich(normalized);
	}

	#focusInput(input: HTMLInputElement) {
		const active = document.activeElement;

		const isTyping =
			active === input && input.selectionStart !== input.selectionEnd;

		const isMouseSelecting =
			window.getSelection()?.toString().length ?? 0 > 0;

		if (isTyping || isMouseSelecting) return;

		input.focus({ preventScroll: true });
	}

	input(prompt: string, config: InputConfig) {
		const inputPromise = new Promise<
			| {
					response: string;
					displayText: string;
					finished: true;
			  }
			| { finished: false }
		>((resolve) => {
			this.cancelInput = () => {
				resolve({ finished: false });
			};

			const text = document.createElement("p");
			text.innerText = prompt;

			const input = document.createElement("input");
			input.classList.add("reqInput");
			input.type = config.hideTyping ? "password" : "text";
			this.#input = input;

			input.autocomplete = "off";
			input.autocorrect = false;
			input.autocapitalize = "off";
			input.spellcheck = false;
			input.enterKeyHint = "Send";

			input.value = config.initialText;

			input.addEventListener("paste", (event) => {
				const clipboardData = event.clipboardData;
				if (!clipboardData) return;

				for (let i = 0; i < clipboardData.items.length; i++) {
					const item = clipboardData.items[i];
					const { type } = item;

					if (type === "text/plain") {
						item.getAsString((text) => {
							config.onPaste({
								type: "text",
								data: text
							});
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

							config.onPaste({
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
			if (config.inline) div.classList.add("inline");
			div.appendChild(text);
			div.appendChild(input);

			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					const response = input.value;
					div.remove();
					// remove from lines

					const displayText = `${prompt}${response}`;
					if (config.leaveInputOnCompletion)
						this.#postPlain(displayText);

					this.#input = undefined;
					this.cancelInput = undefined;

					resolve({ response, displayText, finished: true });
				}
			});

			input.addEventListener("focus", () => {
				setTimeout(() => {
					input.scrollIntoView({
						block: "nearest"
					});
				}, 100);
			});

			this.#newLog(div, () => this.#focusInput(input), false);
		});

		return inputPromise;
	}

	clear() {
		this.lines.forEach((line) => line.element.remove());
		this.lines = [];

		this.#elementQueue.forEach((item) => item.element.remove());
		this.#elementQueue = [];
		this.#commitScheduled = false;
		if (this.#commitFrame !== undefined) {
			cancelAnimationFrame(this.#commitFrame);
			this.#commitFrame = undefined;
		}

		this.#logbox.innerHTML = "";
	}

	async playSound(config: Sound): Promise<PlaySoundResponse> {
		const volume = clamp(config.volume ?? 0.5, 0, 1);

		const sound = new Audio();

		const srcText = "url" in config ? config.url : config.file;

		if ("url" in config) {
			sound.src = config.url;
		} else {
			const fileContents = await this.#fs.readFile(config.file);

			if (!fileContents) {
				throw new Error(`Audio file at ${config.file} does not exist.`);
			}

			sound.src = fileContents;
		}

		sound.volume = volume;

		if (config.start !== undefined) {
			sound.currentTime = config.start;
		}

		return new Promise<PlaySoundResponse>((resolve) => {
			let onStopResolve: ((time: number) => void) | undefined;

			function stopSound() {
				sound.pause();
				sound.remove();

				onStopResolve?.(sound.currentTime);
			}

			if (navigator.mediaSession && MediaMetadata)
				navigator.mediaSession.metadata = new MediaMetadata({
					title: config.metadata?.title ?? srcText,
					artist: config.metadata?.artist,
					album: config.metadata?.album
					//artwork: [
					//	{
					//		src: config.metadata?.artwork
					//	}
					//] //the album art associated with the media
				});

			const loaded = () => {
				sound.removeEventListener("loadeddata", loaded);

				sound.addEventListener("ended", stopSound);

				resolve({
					duration: sound.duration,

					onStop: new Promise<number>((resolve) => {
						onStopResolve = resolve;
					}),

					pause() {
						sound.pause();
					},

					play() {
						sound.play().catch(() => {});
					},

					remove() {
						stopSound();
					}
				});

				sound.play().catch((err) => {
					console.warn("Failed to play sound:", err);
				});
			};

			sound.addEventListener("loadeddata", loaded);

			if (sound.readyState >= 2) {
				loaded();
			}
		});
	}

	cancelSounds() {}

	exit() {
		this.cancelSounds();
		clearInterval(this.#focusInterval);
		window.removeEventListener("keydown", this.#onKeyDown);
	}
}

const Ui: new (fs: FilesystemInterface) => UiManager = DomManager;
export default Ui;
