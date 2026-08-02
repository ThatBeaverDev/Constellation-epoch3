import { WorkerMessageIntent } from "../../../worker/types/intents";
import UsersManager from "../../security/users";
import Runtime from "../runtime";
import { ProgramStore } from "../types";
import { mainThreadMessageHandler } from "./handler";

export default function handleExecution(
	handle: Awaited<ReturnType<typeof mainThreadMessageHandler>>["handle"],
	getProgram: () => ProgramStore,
	reroot: (path: string) => string,
	users: UsersManager,
	executeProgram: Runtime["executeProgram"],
	onTermination: (data: any) => void
) {
	handle(
		WorkerMessageIntent.execute_program,
		async ({
			path,
			args,
			handoverDisplayPid: executingProgramPid,
			workingDirectory,
			input,
			outputProxy,
			user: loginInfo
		}) => {
			const parent = getProgram();

			if (loginInfo) {
				const user = await users.userByUID(loginInfo.uid);

				if (!user)
					throw new Error(`No user exists by UID ${loginInfo?.uid}`);

				const isValid = await users.verifyPassword(
					user,
					loginInfo.password
				);

				if (!isValid) {
					throw new Error("Password is incorrect.");
				}
			}

			let user = loginInfo
				? await users.userByUID(loginInfo.uid)
				: parent.user;

			const program = await executeProgram(
				reroot(path),
				parent,
				user,
				args,
				{
					displayHandover: { oldOwner: executingProgramPid },
					workingDirectory,
					input,
					outputProxy: outputProxy ? parent.pid : undefined
				}
			);

			return { pid: program.pid };
		}
	);

	handle(WorkerMessageIntent.exit, ({ data }) => {
		onTermination(data);
	});
}
