import { Environment } from "../types/worker";
import { logToString } from "./logs";

class SearchError extends Error {
	constructor(e: string) {
		super(e);

		this.name = "SearchError";
	}
}

export async function resolveName(env: Environment, name: string) {
	const envExec = await env.execute("/sbin/env.js", [name]);
	const { return: programDirectory } = await envExec.onExit;
	if (!programDirectory) {
		throw new SearchError(`Not found: ${name}`);
	}

	return logToString(programDirectory);
}

export async function execName(
	env: Environment,
	name: string,
	args?: string[],
	config?: Parameters<Environment["execute"]>[2]
) {
	const programDirectory = await resolveName(env, name);

	const programExec = env.execute(programDirectory, args, config);

	return programExec;
}
