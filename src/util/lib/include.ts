import { LibraryExports } from "../types/libraries";
import { Environment } from "../types/worker";
import { encodeBase64 } from "./base64";

async function getLibraryPath(env: Environment, name: string) {
	const PATH = ["/lib", "/slib"];

	for (const dir of PATH) {
		const contents = await env.fs.readdir(dir);

		const filename = `${name}.js`;

		if (contents.includes(filename)) {
			return env.path.resolve(dir, filename);
		}
	}
}

export default async function include<K extends keyof LibraryExports>(
	env: Environment,
	name: K
): Promise<LibraryExports[K]> {
	const path = await getLibraryPath(env, name);
	if (!path) throw new Error(`${name} is not installed on this system.`);

	const contents = await env.fs.readFile(path);
	if (!contents) throw new Error(`${name} is not installed on this system.`);

	const dataURL = `data:text/javascript;base64,${encodeBase64(contents)}`;
	const exports = await import(dataURL);

	return exports;
}
