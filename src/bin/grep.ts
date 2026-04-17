import { Environment } from "../types/worker";
import { Log } from "../ui/ui";
import { logsToString } from "../usrlib/logs";

export default function* grep(
	env: Environment,
	[searchTerm]: [string | undefined],
	inputLogs?: Log[]
) {
	if (!searchTerm) return "usage: program | grep [searchterm]";

	console.debug(inputLogs, inputLogs ?? []);
	const log = logsToString(inputLogs ?? []);
	const logLines = log.split("\n");

	for (const line of logLines) {
		if (line.includes(searchTerm)) {
			env.print(line);
		}
	}
}
