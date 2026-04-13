import { Environment } from "../types/worker";

export default async function* cat(env: Environment, [path]: [string]) {
	env.print((await env.fs.readFile(path)) ?? "");
}
