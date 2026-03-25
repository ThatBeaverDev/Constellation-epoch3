import { Environment } from "../lib/worker";
import { formatTable } from "../usrlib/table";

export default async function* ps(env: Environment) {
	const programs = await env.processes();

	const table: string[][] = [
		["PID", "Name", "Directory", "Uptime", "Worker#"]
	];

	for (const program of programs) {
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
			`Worker${program.core}`
		]);
	}

	const formattedTable = formatTable(table);
	env.print(formattedTable);
}
