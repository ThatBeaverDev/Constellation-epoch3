//import { env } from "../lib/utils";

import { Session } from "../runtime";

export interface UiManager {
	log(source: string, message: string): void;
	warn(source: string, message: string): void;
	error(source: string, message: string, console?: boolean): void;

	clear(): void;
	input(
		message?: string,
		hideTyping?: boolean
	): Promise<{ response: string; displayText: string }>;

	controller?: Session;

	exit(): Promise<void> | void;
}

class DomManager implements UiManager {
	#container: HTMLDivElement;
	#logbox: HTMLDivElement;

	mode: "tui" | "gui" = "tui";

	controller?: Session;

	constructor() {
		this.#container = document.createElement("div");
		this.#container.classList.add("DomUI");

		this.#container.innerHTML = `<style>
html {
	position: absolute;

	top: 0px;
	left: 0px;

	width: 100vw;
	min-height: 100vh;
}

div.DomUI {
    position: absolute;

    top: 0px;
    left: 0px;

    width: 100vw;
	min-height: 100vh;

    background-color: black;
}

div.LogBox {
    position: relative;
    display: flex;
    flex-direction: column;

	overflow-y: scroll;

    top: 0px;
    left: 0px;

    width: 100vw;

	white-space: break-spaces;
}

div.LogBox > p {
    width: 100%;

    margin: 0px;
    padding: 0px;

    color: white;
    font-family: monospace;
}

div.LogBox > p.warning {
    color: yellow;
}

div.LogBox > p.error {
    color: red;
}

div.LogBox > div.input {
	width: 100%;
	height: 15px;

	display: flex;
	flex-direction: row;

    margin: 0px;
    padding: 0px;

    color: white;
    font-family: monospace;	
}

div.LogBox > div.input > p {
	margin: 0px;
}

div.LogBox > div.input > input.reqInput {
	width: max-content;
	background: transparent;

	border: none !important;
	outline: none !important;
	padding: none !important;
	margin: none !important;

	color: white;
	font-family: monospace;
}
</style>`;

		this.#logbox = document.createElement("div");
		this.#logbox.classList.add("LogBox");
		this.#container.appendChild(this.#logbox);

		document.body.innerHTML = "";
		document.body.appendChild(this.#container);
	}

	#formatLog(origin: string, message: string) {
		if (this.controller) return message;

		return `[${origin}] ${message}`;
	}

	#newLog(element: HTMLParagraphElement) {
		const html = document.scrollingElement as HTMLElement;
		const isScrolledToBottom =
			html.scrollTop === html.scrollHeight - html.offsetHeight;

		this.#logbox.appendChild(element);

		if (isScrolledToBottom) {
			// if that Y value is ever too little, it's not my problem.
			html.scroll(0, 100000000000);
		}
	}

	#post(message: string) {
		console.log(message);

		const text = document.createElement("p");
		text.innerText = message;

		this.#newLog(text);
	}
	log(origin: string, message: string) {
		const data = this.#formatLog(origin, message);
		console.log(data);

		const text = document.createElement("p");
		text.innerText = data;

		this.#newLog(text);
	}
	warn(origin: string, message: string) {
		const data = this.#formatLog(origin, message);
		console.warn(data);

		const text = document.createElement("p");
		text.classList.add("warning");
		text.innerText = data;

		this.#newLog(text);
	}
	error(origin: string, message: string, consoleLog: boolean = true) {
		const data = this.#formatLog(origin, message);
		if (consoleLog) console.error(data);

		const text = document.createElement("p");
		text.classList.add("error");
		text.innerText = data;

		this.#newLog(text);
	}

	input(prompt: string, hideTyping: boolean = false) {
		return new Promise<{ response: string; displayText: string }>(
			(resolve) => {
				const text = document.createElement("p");
				text.classList.add("log");
				text.innerText = prompt;

				const input = document.createElement("input");
				input.classList.add("reqInput");
				input.type = hideTyping ? "password" : "text";

				const div = document.createElement("div");
				div.classList.add("input");
				div.appendChild(text);
				div.appendChild(input);

				input.addEventListener("keydown", (e) => {
					if (e.key == "Enter") {
						const response = input.value;

						div.remove();
						const displayText = `${prompt}${response}`;
						this.#post(displayText);

						resolve({ response, displayText });
					}
				});

				this.#newLog(div);
				input.focus();
			}
		);
	}

	clear() {
		this.#logbox.innerHTML = "";
	}

	exit() {}
}

//class CLIManager implements UiManager {}

const Ui: new () => UiManager =
	DomManager; /*env == "web" ? DomManager : CLIManager; */
export default Ui;
