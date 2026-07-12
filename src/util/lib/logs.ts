import { ArrayLog, Log } from "../types/worker";

export function logToString(log: Log): string {
	if (typeof log == "string") return String(log);
	if (typeof log !== "object")
		throw new Error(
			`Cannot convert non-log to string. (tried converting ${typeof log})`
		);

	let workingString = "";
	for (const part of log) {
		switch (part.type) {
			case undefined:
			case "string":
				workingString += part.text;
				break;

			case "image":
				if ("dir" in part) {
					workingString += ` [image from ${part.dir}] `;
				} else {
					workingString += ` [image from ${part.url}] `;
				}
				break;
		}
	}

	return workingString;
}

export function logsToString(logs: Log[]): string {
	return logs
		.filter((item) => (typeof item == "string" ? item.trim() : item))
		.map((log) => logToString(log))
		.join("\n");
}

export function logToArrayLog(log: Log): ArrayLog {
	if (typeof log == "string") return [{ text: log }];

	return log;
}

export function logsToArrayLog(logs: Log[]): ArrayLog[] {
	return logs.map((log) => logToArrayLog(log));
}
