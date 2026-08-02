// @ts-expect-error
import { readdir, stat, readFile, writeFile, rm } from "fs/promises";
// @ts-expect-error
import { relative, resolve } from "node:path";

// @ts-expect-error
const start = process.cwd();

const ignores = new Set(["netcache.json", "portable.js", ".DS_Store"]);
async function walk(dir: string, json: Record<string, string>) {
	try {
		const contents: string[] = await readdir(dir);

		for (const child of contents) {
			if (ignores.has(child)) {
				continue;
			}

			const path = resolve(dir, child);
			const stats = await stat(path);

			if (await stats.isDirectory()) {
				await walk(path, json);
			} else {
				const relativePath = relative(start, path);
				json[relativePath] = await readFile(path, "utf8");
			}
		}
	} catch (e) {
		console.warn(e);
	}
}

async function makePortable() {
	const json: Record<string, string> = {};

	try {
		await rm("./dist/netcache.json");
	} catch (e) {}

	await walk("./dist", json);
	// parse and stringify to compress
	json["build/data.json"] = JSON.stringify(
		JSON.parse(await readFile("./build/data.json", "utf8"))
	);

	const jsonString = JSON.stringify(json, null, 4);

	await writeFile("./dist/netcache.json", jsonString);

	const portable = `const json = ${jsonString};

function encodeBase64(input) {
	return btoa(
		new TextEncoder()
			.encode(input)
			.reduce((data, byte) => data + String.fromCharCode(byte), "")
	);
}

const kernelDataUrl = \`data:text/javascript;base64,\${encodeBase64(json["dist/kernel.js"])}\`
const { default: ConstellationWeb } = await import(kernelDataUrl)

console.debug(ConstellationWeb)

const kernel = ConstellationWeb(async (fs) => {
	await fs.mkdir("/bin");

	// init
	const initSrc = json["dist/pkgs/packages/init/init.js"]

	await fs.writeFile("/bin/init.js", initSrc);

	// installer
	const installerSrc = json["dist/pkgs/packages/installd/installd.js"]

	await fs.writeFile("/bin/installd.js", installerSrc);
}, json);
kernel.init();

window.kernel = kernel;`;

	await writeFile("./dist/portable.js", portable);
}

makePortable();
