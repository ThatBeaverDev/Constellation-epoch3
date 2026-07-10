import { Environment, SocketConnection } from "../../../util/types/worker";
import { GUI_SOCKET_PATH } from "./constants";
import { GuiIngoing } from "./types/gui.ingoing";
import { GuiOutgoing } from "./types/gui.outgoing";
import { WindowContentItem } from "./types/windowContents";

export default class GraphicalUIManager {
	#socketConnection?: SocketConnection<GuiIngoing, GuiOutgoing>;

	#textboxes: Partial<
		Record<
			string,
			{ promise: Promise<string>; resolve: (data: string) => void }
		>
	> = {};

	constructor(public env: Environment) {}

	async guiAvailable() {
		const stats = await this.env.fs.stats(GUI_SOCKET_PATH);

		return stats?.type == "socket";
	}

	async init(windowName: string) {
		const isOk = await this.guiAvailable();
		if (!isOk) {
			console.warn("GUI not running.");
			return;
		}

		this.#socketConnection =
			await this.env.sockets.connectToSocket(GUI_SOCKET_PATH);

		this.#socketConnection.onMessage = (msg) => {
			switch (msg.intent) {
				case "keypress":
					// TODO: Handle Keypresses
					break;

				case "windowClose":
					this.env.exit();
					break;

				case "textboxComplete":
					const store = this.#textboxes[msg.reference];
					if (store) {
						store.resolve(msg.contents);
					}
					break;
			}
		};

		this.#socketConnection.sendMessage({
			intent: "newWindow",
			name: windowName
		});
	}

	async setContents(contents: WindowContentItem[]) {
		if (!this.#socketConnection) {
			return;
		}

		this.#socketConnection?.sendMessage({
			intent: "setWindowContents",
			contents
		});
	}

	async awaitInputResponse(responder: string) {
		if (!this.#textboxes[responder]) {
			const obj = {
				promise: new Promise<string>(() => {}),
				resolve: (_: string) => {}
			};

			obj.promise = new Promise<string>((resolve) => {
				obj.resolve = resolve;
			});

			this.#textboxes[responder] = obj;
		}

		return await this.#textboxes[responder].promise;
	}
}
