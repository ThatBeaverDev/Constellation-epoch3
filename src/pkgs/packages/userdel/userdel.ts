import { getUserData, user, writeUserData } from "../../../util/lib/users";
import { Environment } from "../../../util/types/worker";

export default async function* userdel(env: Environment, args: string[]) {
	const targetUID = Number(args[0] ?? (await env.self()).UID);

	const userInfo = await user(env, targetUID);
	if (!userInfo) throw new Error(`User by UID ${targetUID} does not exist!`);

	const ok =
		(
			await env.input(
				`Confirm deletion of user ${userInfo.displayName ?? userInfo.name} [y/N]: `
			)
		).toLowerCase() == "y";

	if (!ok) return;

	const data = await getUserData(env);
	delete data.users[targetUID];

	await writeUserData(env, data);
}
