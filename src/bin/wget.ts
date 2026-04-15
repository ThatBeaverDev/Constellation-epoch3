import { Environment } from "../types/worker";

export default async function* wget(
	env: Environment,
	[url, path]: [string | undefined, string | undefined]
) {
	if (!url) return "URL to fetch is required";
	if (!path) path = url.textAfterAll("/");

	path = env.path.resolve(env.workingDirectory, path);

	const contents = await env.network.request("get", url);

	await env.fs.writeFile(path, contents);
}
