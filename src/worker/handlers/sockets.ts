import { WorkerProgramStore } from "@/types/worker";
import { ConstellationWorker } from "../worker";
import { workerMessageHandler } from "./handler";
import { RuntimeMessageIntent } from "../../kernel/types/intents";

export function handleSockets(
	handle: Awaited<ReturnType<typeof workerMessageHandler>>["handle"],
	worker: ConstellationWorker
) {
	const socketServerBySocketId = (
		id: number
	): WorkerProgramStore["socketServers"][0] | undefined => {
		for (const program of worker.programs) {
			const ids = program.socketServers.map((server) => server.socketId);
			const index = ids.indexOf(id);

			if (index !== -1) {
				return program.socketServers[index];
			}
		}

		return undefined;
	};

	const clientConnectionsBySocketId = (id: number) => {
		const connections: WorkerProgramStore["socketConnections"] = [];
		for (const program of worker.programs) {
			const ids = program.socketConnections.map(
				(connection) => connection.socketId
			);
			const index = ids.indexOf(id);

			if (index !== -1) {
				connections.push(program.socketConnections[index]);
			}
		}

		return connections;
	};

	handle(RuntimeMessageIntent.socket_client_connected, (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientConnect?.({ pid: packet.initiatorPid });
	});

	handle(RuntimeMessageIntent.socket_client_disconnected, (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onClientDisconnect?.({
			pid: packet.initiatorPid
		});
	});

	handle(RuntimeMessageIntent.socket_client_sent_packet, (packet) => {
		const server = socketServerBySocketId(packet.socketId);

		server?.server?.onMessage?.(
			{ pid: packet.initiatorPid },
			packet.payload
		);
	});

	handle(RuntimeMessageIntent.socket_server_ended, (packet) => {
		// a server has terminated, so we need to disconnect clients.
		const connections = clientConnectionsBySocketId(packet.socketId);

		for (const connection of connections) {
			connection.connection.onClose?.();
			connection.connection.exit();
		}
	});

	handle(RuntimeMessageIntent.socket_server_sent_packet, (packet) => {
		// recieve server packet
		const recipient = worker.programByPid(packet.targetPid);

		const ids = recipient.socketConnections.map(
			(connection) => connection.socketId
		);
		const index = ids.indexOf(packet.socketId);

		if (index == -1) return; // not connected

		const { connection } = recipient.socketConnections[index];

		connection.onMessage?.(packet.payload);
	});
}
