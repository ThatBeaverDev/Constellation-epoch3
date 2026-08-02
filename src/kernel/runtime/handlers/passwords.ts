import { WorkerMessageIntent } from "../../../worker/types/intents";
import { mainThreadMessageHandler } from "../../../workerUtils";
import UsersManager, { insurePrivilege } from "../../security/users";
import { ProgramStore } from "../types";

export default function handlePasswords(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	getProgram: () => ProgramStore,
	users: UsersManager
) {
	handle(WorkerMessageIntent.change_password, async (msg) => {
		await insurePrivilege(getProgram(), users);

		return users.changePassword(msg.uid, msg.newPassword);
	});

	handle(WorkerMessageIntent.validate_password, async (msg) => {
		const user = await users.userByUID(msg.uid);
		if (!user) throw new Error(`User by UID ${msg.uid} does not exist.`);

		return users.verifyPassword(user, msg.password);
	});
}
