import { Environment } from "../util/types/worker";

export default async function* display(
	env: Environment,
	[file]: [string | undefined]
) {
	if (!file) return `File '${file}' to display does not exist!`;

	const realpath = env.path.resolve(env.workingDirectory, file);
	env.print([{ type: "image", dir: realpath, width: 30 }]);
}
