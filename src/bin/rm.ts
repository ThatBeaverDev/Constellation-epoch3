import { Environment } from "../types/worker";

export default async function* rm(env: Environment, files: string[]) {
	for (const path of files) await env.fs.rm(path);
}
