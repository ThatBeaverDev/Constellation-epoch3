import { Environment } from "../types/worker";

export default async function* cat(env: Environment, paths: string[]) {
	const strings = await Promise.all(
		paths.map(async (path) => {
			const contents = await env.fs.readFile(path);

			return contents ?? "";
		})
	);

	env.print(strings.join("\n"));
}
