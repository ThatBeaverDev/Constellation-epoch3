import { Environment } from "../../../util/types/worker";

export default async function* ResolveCommand(
	env: Environment,
	[name]: [string | undefined]
) {
	const PATH = ["/bin", "/sbin"];

	if (!name) return "Usage: env [name]";

	if ([".", "/"].includes(name[0])) {
		// resolve it
		const path = env.path.resolve(env.workingDirectory, name);

		const exists = await env.fs.exists(path);
		if (exists) {
			return path;
		}
	}

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
