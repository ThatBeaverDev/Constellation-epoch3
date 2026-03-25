#! /usr/bin/env deno
/// <reference types="node" />

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path/posix";

async function walkDirectory(
	path: string,
	nameStart: string,
	file: { files: Record<string, string>; directories: string[] } = {
		files: {},
		directories: []
	}
) {
	const contents = await readdir(path);

	for (const name of contents) {
		const filePath = join(path, name);

		const stats = await stat(filePath);

		const systemPath =
			"/" + filePath.substring(filePath.indexOf(nameStart));
		if (stats.isDirectory()) {
			file.directories.push(systemPath);
			await walkDirectory(filePath, nameStart, file);
		} else {
			const contents = await readFile(filePath, { encoding: "utf8" });

			file.files[systemPath] = contents;
		}
	}

	return file;
}

async function main() {
	const file = await walkDirectory("./dist/bin", "bin");
	await walkDirectory("./src/config", "config", file);

	const json = JSON.stringify(file, null, 4);

	await writeFile("./build/data.json", json);
}

main();
