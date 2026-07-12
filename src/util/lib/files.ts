import { Environment } from "../types/worker";

export async function moveFiles(
	env: Environment,
	oldPath: string,
	newPath: string
) {
	if (oldPath[0] !== "/") throw new Error("Old path must be absolute!");
	if (newPath[0] !== "/") throw new Error("New path must be absolute!");

	const exists = await env.fs.exists(oldPath);
	if (!exists) throw new Error("Old path does not exist!");

	const isDirectory = await env.fs.isDirectory(oldPath);

	if (isDirectory) {
		const children = await env.fs.readdir(oldPath);

		await env.fs.mkdir(newPath);

		for (const childName of children) {
			const oldChildPath = env.path.join(oldPath, childName);
			const newChildPath = env.path.join(newPath, childName);

			await moveFiles(env, oldChildPath, newChildPath);
		}

		await env.fs.rmdir(oldPath);
	} else {
		const contents = await env.fs.readFile(oldPath);
		if (!contents) throw new Error(`File '${oldPath}' does not exist!`);

		await env.fs.writeFile(newPath, contents);
		await env.fs.rm(oldPath);
	}
}

export async function copyFiles(
	env: Environment,
	oldPath: string,
	newPath: string
) {
	if (oldPath[0] !== "/") throw new Error("Old path must be absolute!");
	if (newPath[0] !== "/") throw new Error("New path must be absolute!");

	const exists = await env.fs.exists(oldPath);
	if (!exists) throw new Error("Old path does not exist!");

	const isDirectory = await env.fs.isDirectory(oldPath);

	if (isDirectory) {
		const children = await env.fs.readdir(oldPath);

		await env.fs.mkdir(newPath);

		for (const childName of children) {
			const oldChildPath = env.path.join(oldPath, childName);
			const newChildPath = env.path.join(newPath, childName);

			await copyFiles(env, oldChildPath, newChildPath);
		}
	} else {
		const contents = await env.fs.readFile(oldPath);
		if (!contents) throw new Error(`File '${oldPath}' does not exist!`);

		await env.fs.writeFile(newPath, contents);
	}
}
