import { Environment, SocketConnection } from "../../../util/types/worker";
import { GuiIngoing } from "./gui.ingoing";
import { GuiOutgoing } from "./gui.outgoing";
import { WindowContentItem } from "./windowContents";

export default class GraphicalUIManager {
	#socketConnection?: SocketConnection<GuiIngoing, GuiOutgoing>;

	constructor(public env: Environment) {}

	async init(windowName: string) {
		this.#socketConnection = await this.env.sockets.connectToSocket(
			"/data/gui/conn.sock"
		);

		this.#socketConnection.onMessage = (msg) => {
			switch (msg.intent) {
				case "keypress":
					console.debug(msg.data.name);
					break;

				case "windowClose":
					this.env.exit();
					break;
			}
		};

		this.#socketConnection.sendMessage({
			intent: "newWindow",
			name: windowName
		});
	}

	async setContents(contents: WindowContentItem[]) {
		this.#socketConnection?.sendMessage({
			intent: "setWindowContents",
			contents
		});
	}
}
