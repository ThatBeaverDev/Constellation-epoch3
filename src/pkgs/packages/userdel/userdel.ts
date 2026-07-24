import {
	getUserData,
	user,
	usersByName,
	writeUserData
} from "../../../util/lib/users";
import { Environment } from "../../../util/types/worker";

export default async function* userdel(env: Environment, args: string[]) {
	async function deleteDirectory(dir: string) {
		const contents = await env.fs.readdir(dir);

		for (const name of contents) {
			const path = env.path.join(dir, name);

			const stats = await env.fs.stats(path);
			if (!stats) continue;

			if (stats.type == "directory") {
				await deleteDirectory(path);
			} else {
				await env.fs.rm(path);
			}
		}

		await env.fs.rm(dir);
	}

	if (args.length !== 1) {
		return `Usage: sudo userdel [name]`;
	}

	const target =
		(await usersByName(env, args[0]))[0] ??
		(await user(env, (await env.self()).UID));

	if (!target) throw new Error(`User by Name ${args[0]} does not exist!`);

	const input = await env.input(
		`Confirm deletion of user ${target.displayName ?? target.name} [y/N]: `
	);
	const ok = input.toLowerCase() == "y";

	if (!ok) return;

	const data = await getUserData(env);

	const home = data.users[target.UID]?.home;
	if (home) await deleteDirectory(home);

	delete data.users[target.UID];

	await writeUserData(env, data);
}
