import { Environment } from "../types/worker";

export default async function* display(
	env: Environment,
	[file]: [string | undefined]
) {
	if (!file) return "File does not exist!";

	const realpath = env.path.resolve(env.workingDirectory, file);
	env.print([{ type: "image", dir: realpath, width: 30 }]);
}
