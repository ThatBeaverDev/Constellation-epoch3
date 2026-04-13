import { Environment } from "../types/worker";
import {
	directoryColour,
	executableColour,
	structureColour
} from "../usrlib/colours";

export default async function* tree(
	env: Environment,
	[directory = "."]: [string]
) {
	const dir = env.path.resolve(env.workingDirectory, directory);

	env.print([{ text: dir, colour: directoryColour }]);

	const counts = {
		files: 0,
		dirs: 0
	};

	await treeWalk(env, dir, "", Infinity, 0, counts);

	env.print(`${counts.dirs} directories, ${counts.files} files`);
}

async function treeWalk(
	env: Environment,
	directory: string,
	prefix: string,
	maxDepth: number,
	depth: number,
	counts: { files: number; dirs: number }
) {
	let contents: string[];
	try {
		contents = await env.fs.readdir(directory);
	} catch (e) {
		env.print([
			{ text: prefix + "└── ", colour: structureColour },
			{ text: String(e) }
		]);
		return;
	}

	contents.sort();

	for (const i in contents) {
		const file = contents[i];

		if (/*(*/ file[0] !== "." /*) || (obj.showHidden)*/) {
			const parts =
				Number(i) == contents.length - 1
					? ["└── ", "    "]
					: ["├── ", "│   "];

			const dispFile = String(file);

			const asDir = env.path.resolve(directory, file);

			//if (obj.fullDir) {
			//	dispFile = asDir;
			//};

			const isDir = await env.fs.isDirectory(asDir);

			if (isDir) {
				env.print([
					{ text: prefix + parts[0], colour: structureColour },
					{ text: dispFile + "/", colour: directoryColour }
				]);
				counts.dirs++;
				await treeWalk(
					env,
					asDir,
					prefix + parts[1],
					maxDepth,
					depth + 1,
					counts
				);
			} else {
				//if (!obj.dirOnly) {
				env.print([
					{ text: prefix + parts[0], colour: structureColour },
					{
						text: dispFile,
						colour: dispFile.endsWith(".js")
							? executableColour
							: undefined
					}
				]);
				//};
				counts.files++;
			}
		}
	}
}
