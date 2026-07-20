import { Environment } from "../util/types/worker";
import { formatTable } from "../util/lib/table";
import { user } from "../util/lib/users";
import { readableTime } from "../util/lib/time";

export default async function* ps(env: Environment) {
	const programs = await env.processes();

	const table: string[][] = [
		["PID", "Name", "Directory", "Uptime", "UserID"]
	];

	const users = await Promise.all(
		programs.map((item) => user(env, item.UID))
	);

	for (const i in programs) {
		const program = programs[i];

		const user = users[i];
		if (!user) continue;

		const uptime = readableTime(Date.now() - program.startTime.getTime());

		const name = program.directory.textAfterAll("/");

		table.push([
			`${program.pid}`,
			name,
			program.directory,
			uptime,
			`${user.displayName ?? user.name}`
		]);
	}

	const formattedTable = formatTable(table);
	env.print(formattedTable);
}
