import { Log, NormalizedLog } from "../util/types/worker";

export function withOrigin(origin: string, log: NormalizedLog): NormalizedLog {
	log = log ?? [];

	if (!(log instanceof Array)) {
		throw new Error("Normalized log must be provided!");
	}

	return [{ text: `[${origin}] `, colour: "#888888" }, ...log];
}
export function normalizeLog(log: Log, defaultColour?: string): NormalizedLog {
	if (typeof log === "string") {
		return [{ text: log, colour: defaultColour }];
	}

	return log;
}
export function renderConsole(log: NormalizedLog = []) {
	let text = "";
	const styles: string[] = [];

	for (const part of log) {
		switch (part.type) {
			case undefined:
			case "string":
				text += `%c${part.text}`;
				styles.push(part.colour ? `color: ${part.colour};` : "");
				break;

			case "image":
				text += `%c[Image from Location ${"url" in part ? part.url : part.dir}]`;
				styles.push("color: #ffff00");

				break;

			default:
				// @ts-expect-error // trust
				text += `%cError parsing log request, unknown segment type ${part.type}`;
				styles.push("color: #ff0000;");
		}
	}

	return { text, styles };
}
