import { Environment } from "../lib/worker";

export default async function* ResolveCommand(
	env: Environment,
	[name]: [string]
) {
	const PATH = ["/bin"];

	for (const dir of PATH) {
		const contents = await env.fs.readdir(dir);

		const filename = `${name}.js`;
		const searchPath = `${dir}/${filename}`;

		if (contents.includes(filename)) {
			return searchPath;
		}
	}
}
