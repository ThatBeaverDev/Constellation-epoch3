import { getUserData } from "../../../util/lib/users";
import { Environment } from "../../../util/types/worker";

export default async function* userlist(env: Environment) {
	const data = await getUserData(env);

	for (const UID in data.users) {
		const user = data.users[UID];
		if (!user) continue;

		env.print(user?.displayName ?? user?.name);
	}
}
