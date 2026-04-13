import { Environment } from "../types/worker";

export default async function* mkdir(env: Environment, [path]: [string]) {
	await env.fs.mkdir(path);
}
