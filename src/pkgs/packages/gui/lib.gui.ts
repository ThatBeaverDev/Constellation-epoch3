import { Environment, SocketConnection } from "../../../util/types/worker";
import { GuiIngoing } from "./gui.ingoing";
import { GuiOutgoing } from "./gui.outgoing";
import { WindowContentItem } from "./windowContents";

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
		const stats = await this.env.fs.stats("/data/gui/conn.sock");

		return stats?.type == "socket";
	}

	async init(windowName: string) {
		const isOk = await this.guiAvailable();
		if (!isOk) {
			return;
		}

		this.#socketConnection = await this.env.sockets.connectToSocket(
			"/data/gui/conn.sock"
		);

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
