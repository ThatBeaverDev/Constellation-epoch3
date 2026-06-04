import { Environment } from "../util/types/worker";

export default async function* wget(
	env: Environment,
	[url, path]: [string | undefined, string | undefined]
) {
	if (!url) return "URL to fetch is required";
	if (!path) path = url.textAfterAll("/");

	path = env.path.resolve(env.workingDirectory, path);

	const request = await env.network.request("get", url);

	if (!request.isOk) {
		throw new Error(
			`Failed to fetch data: response code ${request.statusCode} (${request.statusText})`
		);
	}

	const contents = request.response;

	await env.fs.writeFile(path, contents);
}
