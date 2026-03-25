import { Environment } from "../lib/worker";

export default async function* ListDirectory(
	env: Environment,
	[path = "."]: [string]
) {
	const realPath = env.path.resolve(env.workingDirectory, path);

	const contents = await env.fs.readdir(realPath);

	return contents.join("\n");
}
