import { Environment } from "../lib/worker";

export default async function* tree(
	env: Environment,
	[directory = "."]: [string]
) {
	const dir = env.path.resolve(env.workingDirectory, directory);

	let result = dir + "\n";

	const counts = {
		files: 0,
		dirs: 0
	};

	result += await treeWalk(env, dir, "", Infinity, 0, counts);

	result += `${counts.dirs} directories, ${counts.files} files`;

	return result;
}

async function treeWalk(
	env: Environment,
	directory: string,
	prefix: string,
	maxDepth: number,
	depth: number,
	counts: { files: number; dirs: number }
) {
	//if (depth > maxDepth) {
	//	return;
	//}

	let result = "";

	let contents: string[];
	try {
		contents = await env.fs.readdir(directory);
	} catch (e) {
		return prefix + "└── " + String(e) + "\n";
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
				result += prefix + parts[0] + dispFile + `\n`;
				counts.dirs++;
				result += await treeWalk(
					env,
					asDir,
					prefix + parts[1],
					maxDepth,
					depth + 1,
					counts
				);
			} else {
				//if (!obj.dirOnly) {
				result += prefix + parts[0] + dispFile + `\n`;
				//};
				counts.files++;
			}
		}
	}

	return result;
}
