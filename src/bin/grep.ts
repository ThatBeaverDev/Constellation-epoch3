import { Environment, Log } from "../util/types/worker";
import { logsToString } from "../util/lib/logs";

export default function grep(
	env: Environment,
	[searchTerm]: [string | undefined],
	inputLogs?: Log[]
) {
	if (!searchTerm) return "usage: program | grep [searchterm]";

	const log = logsToString(inputLogs ?? []);
	const logLines = log.split("\n");

	for (const line of logLines) {
		if (line.includes(searchTerm)) {
			env.print(line);
		}
	}
}
