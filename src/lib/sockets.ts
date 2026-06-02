import Runtime, { ProgramStore, WorkerStore } from "../runtime";
import {
	Runtime_Sockets_Client_endConnection,
	Runtime_Sockets_Client_newConnection,
	Runtime_Sockets_Client_sendPacket,
	Runtime_Sockets_Server_sendPacket
} from "../types/runtimeMessages";
import {
	Worker_Sockets_Client_endConnection,
	Worker_Sockets_Client_newConnection,
	Worker_Sockets_Client_sendPacket,
	Worker_Sockets_Server_endServer,
	Worker_Sockets_Server_newServer,
	Worker_Sockets_Server_sendPacket
} from "../types/workerMessages";
import { Log } from "../util/types/worker";
import { FilesystemInterface } from "./fs";

interface Socket {
	directory: string;
	id: number;

	server: ProgramStore;
	clients: Set<ProgramStore>;
}

export default class SocketManager {
	#runtime: Runtime;
	#log: (data: Log) => void;
	#fs: FilesystemInterface;
	constructor(
		runtime: Runtime,
		log: (data: Log) => void,
		fs: FilesystemInterface
	) {
		this.#runtime = runtime;
		this.#log = log;
		this.#fs = fs;
	}

	#socketsById = new Map<number, Socket>();
	#socketDirectoryMap = new Map<string, number>();
	#nextSocketId = 0;

	#socketByDirectory(directory: string) {
		const id = this.#socketDirectoryMap.get(directory);

		if (id === undefined)
			throw new Error(`No socket exists at directory '${directory}'`);

		return this.#socketById(id);
	}

	sockets() {
		return this.#socketDirectoryMap.entries();
	}

	#socketById(id: number) {
		const socket = this.#socketsById.get(id);
		if (socket) return socket;

		throw new Error(`No socket exists by ID '${id}'`);
	}

	newClientConnection(packet: Worker_Sockets_Client_newConnection) {
		this.#log(`New connection: ${JSON.stringify(packet)}`);
		const client = this.#runtime.programByPid(packet.initiatorPid);

		const socket = this.#socketByDirectory(packet.socketDirectory);

		if (socket.clients.has(client)) {
			throw new Error(
				`Client is already connected to socket at ${packet.socketDirectory}`
			);
		}

		// add the client to the connection list
		socket.clients.add(client);

		// inform the server
		socket.server.worker.emit<Runtime_Sockets_Client_newConnection>(
			"Sockets/Client/newConnection",
			{ ...packet, socketId: socket.id }
		);

		return socket.id;
	}
	endClientConnection(packet: Worker_Sockets_Client_endConnection) {
		this.#log(`Ended connection: ${JSON.stringify(packet)}`);
		const socket = this.#socketById(packet.socketId);

		const server = socket.server;
		const disconnectingClient = this.#runtime.programByPid(
			packet.initiatorPid
		);

		// remove the client from the connection list
		socket.clients.delete(disconnectingClient);

		// inform the server
		server.worker.emit<Runtime_Sockets_Client_endConnection>(
			"Sockets/Client/endConnection",
			packet
		);
	}

	clientSendMessage(packet: Worker_Sockets_Client_sendPacket) {
		this.#log(`Client Message: ${JSON.stringify(packet)}`);
		const socket = this.#socketById(packet.socketId);

		const client = this.#runtime.programByPid(packet.initiatorPid);
		if (!socket.clients.has(client))
			throw new Error("Not connected to this websocket."); // not connected. it must connect first.

		socket.server.worker.emit<Runtime_Sockets_Client_sendPacket>(
			"Sockets/Client/sendPacket",
			packet
		);
	}
	serverSendMessage(packet: Worker_Sockets_Server_sendPacket) {
		this.#log(`Server Message: ${JSON.stringify(packet)}`);
		const socket = this.#socketById(packet.socketId);

		const packetServer = this.#runtime.programByPid(packet.initiatorPid);
		if (packetServer !== socket.server) return; // not the right program

		const target = this.#runtime.programByPid(packet.targetPid);
		if (!socket.clients.has(target))
			throw new Error("Target not connected to socket"); // not connected. this PID must connect first.

		target.worker.emit<Runtime_Sockets_Server_sendPacket>(
			"Sockets/Server/sendPacket",
			packet
		);
	}

	newServerInstance(packet: Worker_Sockets_Server_newServer) {
		this.#log(`New Server: ${JSON.stringify(packet)}`);

		let socketEmpty = false;
		try {
			// throws if no socket is there
			this.#socketByDirectory(packet.socketDirectory);
		} catch {
			// there's already a socket here
			socketEmpty = true;
		}

		if (!socketEmpty) {
			throw new Error(
				`Socket already exists at ${packet.socketDirectory}`
			);
		}

		const server = this.#runtime.programByPid(packet.initiatorPid);

		const socket: Socket = {
			directory: packet.socketDirectory,
			server,
			clients: new Set(),
			id: this.#nextSocketId++
		};

		this.#socketsById.set(socket.id, socket);
		this.#socketDirectoryMap.set(socket.directory, socket.id);

		this.#fs.registerSocket(packet.socketDirectory, socket.id);

		return socket.id;
	}
	endServerInstance(packet: Worker_Sockets_Server_endServer) {
		this.#log(`Ended Server: ${JSON.stringify(packet)}`);

		const socket = this.#socketById(packet.socketId);

		const packetServer = this.#runtime.programByPid(packet.initiatorPid);
		const socketServer = socket.server;

		if (packetServer !== socketServer) return; // not the right program

		const messagedWorkers: WorkerStore[] = [];

		for (const client of socket.clients) {
			// no need to message twice
			if (messagedWorkers.includes(client.worker)) continue;

			messagedWorkers.push(client.worker);

			client.worker.emit<Worker_Sockets_Server_endServer>(
				"Sockets/Server/endServer",
				packet
			);
		}

		this.#socketsById.delete(packet.socketId);
		this.#socketDirectoryMap.delete(socket.directory);
	}
}
