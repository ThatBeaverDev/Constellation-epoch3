import { Environment } from "../../../util/types/worker";

export default async function* ResolveCommandGui(
	env: Environment,
	[name]: [string | undefined]
) {
	const GPATH = ["/bin/gui", "/sbin/gui"];

	if (!name) return "Usage: genv [name]";

	for (const dir of GPATH) {
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
