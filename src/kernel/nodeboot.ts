import ConstellationNode from "./entry/node.js";
import fakeIndexedDb from "fake-indexeddb";
// @ts-expect-error
import { Worker } from "node:worker_threads";
// @ts-expect-error
import { readFile } from "node:fs/promises";
// @ts-expect-error
import * as path from "node:path";

globalThis.indexedDB = fakeIndexedDb;
globalThis.Worker = Worker;

// @ts-expect-error
const constellationRoot = path.resolve(import.meta.dirname, "..");

const init = path.resolve(
	constellationRoot,
	"./dist/pkgs/packages/init/init.js"
);
const installd = path.resolve(
	constellationRoot,
	"./dist/pkgs/packages/installd/installd.js"
);

const kernel = ConstellationNode(async (fs) => {
	await fs.mkdir("/bin");

	// init
	const initSrc = await readFile(init, "utf8");
	await fs.writeFile("/bin/init.js", initSrc);

	// installd
	const installerSrc = await readFile(installd, "utf8");
	await fs.writeFile("/bin/installd.js", installerSrc);
});
kernel.init();
