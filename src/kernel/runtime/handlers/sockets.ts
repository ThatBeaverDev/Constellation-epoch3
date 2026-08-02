import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "./handler";
import SocketManager from "../sockets";
import { ProgramStore } from "../types";

export default function handleSockets(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	getProgram: () => ProgramStore,
	reroot: (path: string) => string,
	sockets: SocketManager
) {
	handle(WorkerMessageIntent.socket_connect, (packet) => {
		const client = getProgram();

		return sockets.newClientConnection(client, {
			...packet,
			socketDirectory: reroot(packet.socketDirectory)
		});
	});
	handle(WorkerMessageIntent.socket_disconnect, (packet) => {
		const disconnectingClient = getProgram();

		return sockets.endClientConnection(disconnectingClient, packet);
	});
	handle(WorkerMessageIntent.send_socket_packet_to_server, (packet) => {
		const client = getProgram();

		return sockets.clientSendMessage(client, packet);
	});

	handle(WorkerMessageIntent.create_socket, (packet) => {
		const server = getProgram();

		return sockets.newServerInstance(server, {
			...packet,
			socketDirectory: reroot(packet.socketDirectory)
		});
	});
	handle(WorkerMessageIntent.end_socket, (packet) => {
		const server = getProgram();

		return sockets.endServerInstance(server, packet);
	});
	handle(WorkerMessageIntent.send_socket_packet_to_client, (packet) => {
		const server = getProgram();

		return sockets.serverSendMessage(server, packet);
	});
}
