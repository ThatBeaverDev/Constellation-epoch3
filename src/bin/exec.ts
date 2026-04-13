import { Environment } from "../types/worker";

export default async function* exec(env: Environment, args: string[]) {
	const path = args[0];
	const programArgs = args.slice(1);

	const exec = await env.execute(path, programArgs, {
		handOverDisplay: true
	});

	const { return: returnValue, logs } = await exec.onExit;

	for (const log of logs) {
		env.print(log);
	}

	return returnValue;
}
