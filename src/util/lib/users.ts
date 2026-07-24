import { USER_FILE } from "../../constants";
import {
	Environment,
	Group,
	SemiRecord,
	User,
	UsersFile
} from "../types/worker";

type UsersStore = SemiRecord<number, User>;
type GroupsStore = SemiRecord<number, Group>;

interface UsersData {
	users: UsersStore;
	groups: GroupsStore;

	rootUsers: Set<number>;

	nextUID: number;
	nextGUID: number;
}

export async function getUserData(env: Environment): Promise<UsersData> {
	const userJson = await env.fs.readFile<UsersFile>(USER_FILE, "json");

	if (!userJson) {
		throw new Error(`Users file does not exist.`);
	}

	return {
		users: userJson.users,
		groups: userJson.groups,

		rootUsers: new Set<number>(userJson.rootUsers),

		nextUID: userJson.nextUID,
		nextGUID: userJson.nextGUID
	};
}

export async function writeUserData(env: Environment, data: UsersData) {
	const userJson: UsersFile = {
		users: data.users,
		groups: data.groups,

		rootUsers: [...data.rootUsers],

		nextUID: data.nextUID,
		nextGUID: data.nextGUID
	};

	await env.fs.writeFile(USER_FILE, JSON.stringify(userJson));
}

export async function user(env: Environment, uid: number) {
	const data = await getUserData(env);

	return data.users[uid];
}

export async function usersByName(
	env: Environment,
	name: string
): Promise<Partial<User[]>> {
	const data = await getUserData(env);

	const results: User[] = [];

	for (const uid in data.users) {
		const user = data.users[uid];

		if (user?.name == name || user?.displayName == name) {
			results.push(user);
		}
	}

	return results;
}
