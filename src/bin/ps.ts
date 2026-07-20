import { Environment } from "../util/types/worker";
import { formatTable } from "../util/lib/table";

export default async function* ps(env: Environment) {
	const programs = await env.processes();

	const table: string[][] = [
		["PID", "Name", "Directory", "Uptime", "UserID"]
	];

	const users = await Promise.all(
		programs.map((item) => env.users.user(item.UID))
	);

	for (const i in programs) {
		const program = programs[i];
		const user = users[i];
		if (!user) continue;

		let uptime = Date.now() - program.startTime.getTime();
		let uptimeUnits = "ms";

		if (uptime > 1000) {
			uptime /= 1000;
			uptimeUnits = "secs";

			if (uptime > 60) {
				uptime /= 60;
				uptimeUnits = "mins";

				if (uptime > 60) {
					uptime /= 60;
					uptimeUnits = "hrs";

					if (uptime > 24) {
						uptime /= 24;
						uptimeUnits = "days";
					}
				}
			}
		}

		const roundedUptime = Math.round(uptime * 1000) / 1000;

		const name = program.directory.textAfterAll("/");

		table.push([
			`${program.pid}`,
			name,
			program.directory,
			`${roundedUptime}${uptimeUnits}`,
			`${user.displayName ?? user.name}`
		]);
	}

	const formattedTable = formatTable(table);
	env.print(formattedTable);
}
