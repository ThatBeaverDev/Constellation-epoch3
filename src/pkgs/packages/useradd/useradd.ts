import { USER_FOLDERS } from "../../../constants";
import finishGenerator from "../../../util/lib/generator";
import { getUserData, writeUserData } from "../../../util/lib/users";
import { Environment, User } from "../../../util/types/worker";
import passwd from "../passwd/passwd";

export default async function* useradd(env: Environment, args: string[]) {
	const self = await env.self();
	if (args.length !== 2 || self.UID !== 0) {
		env.print(`Usage: sudo useradd [username] [password]`);
		if (self.UID !== 0) env.print("Must be ran as root.");

		return;
	}

	const data = await getUserData(env);

	const home = `/users/${args[0]}`;
	const user: User = {
		name: args[0],

		UID: data.nextUID++,
		GUIDs: [],
		home
	};

	await env.fs.mkdir(home);
	for (const name of USER_FOLDERS) {
		const dir = env.path.join(home, name);

		await env.fs.mkdir(dir);
	}
	await env.fs.createAlias(env.path.join(home, "sbin"), "/bin");

	data.users[user.UID] = user;

	await writeUserData(env, data);

	await finishGenerator(passwd(env, [`${user.UID}`, args[1]]));
}
