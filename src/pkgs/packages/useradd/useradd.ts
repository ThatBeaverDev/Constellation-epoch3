import finishGenerator from "../../../util/lib/generator";
import { getUserData, writeUserData } from "../../../util/lib/users";
import { Environment, User } from "../../../util/types/worker";
import passwd from "../passwd/passwd";

export default async function* useradd(env: Environment, args: string[]) {
	if (args.length !== 2) {
		env.print(`Usage: useradd [username] [password]`);

		return;
	}

	const data = await getUserData(env);

	const user: User = {
		name: args[0],

		UID: data.nextUID++,
		GUIDs: []
	};

	data.users[user.UID] = user;

	await writeUserData(env, data);

	await finishGenerator(passwd(env, [`${user.UID}`, args[1]]));
}
