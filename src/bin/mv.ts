import { Environment } from "../types/worker";
import { moveFiles } from "../usrlib/files";

export default async function* moveFilesUtility(
	env: Environment,
	[oldPath, newPath]: [string | undefined, string | undefined]
) {
	if (!oldPath) throw new Error("Old path must be provided");
	if (!newPath) throw new Error("New path must be provided");

	oldPath = env.path.resolve(env.workingDirectory, oldPath);
	newPath = env.path.resolve(env.workingDirectory, newPath);

	await moveFiles(env, oldPath, newPath);
}
