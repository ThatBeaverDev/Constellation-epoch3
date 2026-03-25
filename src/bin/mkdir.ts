import { Environment } from "../lib/worker";

export default async function* mkdir(env: Environment, [path]: [string]) {
	await env.fs.mkdir(path);
}
