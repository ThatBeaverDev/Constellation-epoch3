import { Environment, SocketServer } from "../../../util/types/worker";
import { GuiIngoing } from "./gui.ingoing";
import { GuiKeypressOutgoing, GuiOutgoing } from "./gui.outgoing";
import { WindowContentItem } from "./windowContents";
import WindowManager, { Window } from "./windows";

export interface Client {
	pid: number;
	windows: Window[];
}

export default class SocketManager {
	socketServer!: SocketServer<GuiOutgoing, GuiIngoing>;

	clients: Record<number, Client> = {};

	constructor(
		public env: Environment,
		public windowManager: WindowManager
	) {}

	onKeyPress(currentWindow: Window, event: GuiKeypressOutgoing["data"]) {
		const pid = currentWindow?.associatedClient?.pid;

		if (pid) {
			this.socketServer.sendMessage(pid, {
				intent: "keypress",
				data: event
			});
		} else {
			// no where to send it to, so ignore
		}
	}

	onWindowExit(window: Window) {
		const client = window.associatedClient;
		const pid = client?.pid;

		if (pid) {
			this.socketServer.sendMessage(pid, {
				intent: "windowClose",
				windowID: client ? client.windows.indexOf(window) : 0
			});
		}
	}

	onTextboxCompletion(window: Window, reference: string, contents: string) {
		const client = window.associatedClient;
		const pid = client?.pid;

		if (pid) {
			this.socketServer.sendMessage(pid, {
				intent: "textboxComplete",
				windowID: client ? client.windows.indexOf(window) : 0,
				reference,
				contents
			});
		}
	}

	async init() {
		await this.env.fs.mkdir("/data/gui");

		this.socketServer = await this.env.sockets.createSocket(
			"/data/gui/conn.sock"
		);

		this.socketServer.onClientConnect = (client) => {
			this.clients[client.pid] = { pid: client.pid, windows: [] };
		};

		this.socketServer.onClientDisconnect = ({ pid }) => {
			const client = this.clients[pid];

			for (const window of client.windows) {
				window.close();
			}
		};

		this.socketServer.onMessage = ({ pid }, msg) => {
			const client = this.clients[pid];

			switch (msg.intent) {
				case "newWindow": {
					const { window } = this.windowManager.newWindow(
						client,
						msg.name
					);

					client.windows.push(window);

					break;
				}

				case "setWindowContents": {
					const window = client.windows[msg.windowID ?? 0];

					window.contents = msg.contents;
					const interactableTypes = new Set<
						WindowContentItem["type"]
					>(["button", "textBox"]);

					const interactables: number[] = [];

					for (const i in msg.contents) {
						const idx = Number(i);
						const item = msg.contents[idx];

						if (interactableTypes.has(item.type)) {
							interactables.push(idx);
						}
					}

					window.interactables = interactables;

					break;
				}

				default: {
					// @ts-expect-error
					console.warn("Unknown message intent:", msg.intent);
				}
			}
		};
	}
}
