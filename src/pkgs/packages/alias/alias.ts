import { Environment } from "../../../util/types/worker";

export default async function* alias(
	env: Environment,
	[path, targetPath]: [string, string]
) {
	if (!path || !targetPath) {
		return "usage: alias [path] [targetPath]";
	}

	await env.fs.createAlias(path, targetPath);
}
