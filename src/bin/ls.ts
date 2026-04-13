import { Environment } from "../types/worker";
import { Log } from "../ui/ui";
import { directoryColour, executableColour } from "../usrlib/colours";

export default async function* ListDirectory(
	env: Environment,
	[path = "."]: [string]
) {
	const realPath = env.path.resolve(env.workingDirectory, path);

	const contents = await env.fs.readdir(realPath);
	contents.sort();

	const logData: Log[] = await Promise.all(
		contents.map(async (name) => {
			const path = env.path.resolve(realPath, name);

			const isDirectory = await env.fs.isDirectory(path);
			const isExecutable = !isDirectory && path.endsWith(".js");

			if (isExecutable) {
				return [{ text: name, colour: executableColour }];
			} else if (isDirectory) {
				return [{ text: `${name}/`, colour: directoryColour }];
			} else {
				return name;
			}
		})
	);

	for (const log of logData) {
		env.print(log);
	}
}
