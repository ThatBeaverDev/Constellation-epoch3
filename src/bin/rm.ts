import { Environment } from "../lib/worker";

export default async function* rm(env: Environment, [path]: [string]) {
	await env.fs.rm(path);
}
