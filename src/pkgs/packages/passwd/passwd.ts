import { user } from "../../../util/lib/users";
import { Environment } from "../../../util/types/worker";

export default async function* passwd(env: Environment, args: string[]) {
	const targetUID = Number(args[0] ?? (await env.self()).UID);

	const userInfo = await user(env, targetUID);
	if (!userInfo) throw new Error(`User by UID ${targetUID} does not exist!`);

	env.print(`Changing password for ${userInfo.displayName ?? userInfo.name}`);

	let newPassword: string = args[1];

	if (!newPassword) {
		const try1 = await env.input("New Password:", { hideTyping: true });
		const try2 = await env.input("Repeat New Password:", {
			hideTyping: true
		});

		if (try1 !== try2) {
			throw new Error(`Passwords do not match!`);
		}

		newPassword = try1;
	}

	const isOk = await env.users.changePassword(targetUID, newPassword);

	if (!isOk) {
		return `Sorry.`;
	}
}
