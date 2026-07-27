import { Environment } from "../types/worker";

const metadataKeys = new Set(["app-name", "app-palette-show"]);

export interface AppMetadata {
	"app-name"?: string;
	"app-palette-show"?: string;
}

export async function getAppMetadata(
	env: Environment,
	directory: string
): Promise<AppMetadata | void> {
	const contents = await env.fs.readFile(directory);
	if (!contents) {
		return;
	}

	const lines = contents.split("\n");
	const result: AppMetadata = {};

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.startsWith("// @") || trimmed.startsWith("//@")) {
			const after = trimmed.textAfter("@");

			if (after.includes(":")) {
				// key-value pair
				const key = after.textBefore(":");

				if (metadataKeys.has(key)) {
					const value = after.textAfter(":").trim();
					// @ts-expect-error
					result[key] = value;
				}
			}
		}
	}

	return result;
}
