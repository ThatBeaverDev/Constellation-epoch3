import { Log } from "../ui/ui";

export function logsToString(log: Log): string {
	if (typeof log == "string") return String(log);

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
