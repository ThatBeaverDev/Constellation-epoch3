import { Environment } from "../../../util/types/worker";

export default async function* ResolveCommandGui(
	env: Environment,
	[name]: [string]
) {
	const PATH = ["/bin/gui"];

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
