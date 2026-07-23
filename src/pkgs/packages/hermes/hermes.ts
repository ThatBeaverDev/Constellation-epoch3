import { Environment } from "../../../util/types/worker";
export default async function* HermesTranslator(
	env: Environment,
	[file, ...args]: string[],
	stdin?: string
) {
	if (!file) {
		return `Usage: hermes [file] [...programArgs]`;
	}
	file = env.path.resolve(env.workingDirectory, file);
}
