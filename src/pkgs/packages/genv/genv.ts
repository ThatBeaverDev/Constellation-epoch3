import { Environment } from "../../../util/types/worker";

export default async function* ResolveCommandGui(
	env: Environment,
	[name]: [string | undefined]
) {
	const PATH = ["/bin/gui"];

	if (!name) return "Usage: genv [name]";

	for (const dir of PATH) {
		try {
			const contents = await env.fs.readdir(dir);

			const filename = `${name}.js`;
			const searchPath = `${dir}/${filename}`;

			if (contents.includes(filename)) {
				return searchPath;
			}
		} catch (e) {
			console.warn(e);
		}
	}
}
