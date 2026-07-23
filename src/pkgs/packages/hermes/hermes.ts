import { Environment } from "../../../util/types/worker";
import { compileCastoreaSourceCode } from "./castorea/compile";
import castoreaCalls from "./castorea/syscalls";
import users from "./castorea/users";
import {
	CASTOREA_AURORA_PATH,
	CASTOREA_UTILS_PATH,
	HERMES_CASTOREA_DISK,
	HERMES_DATA,
	HERMES_SAHARA_ARES_DISK,
	HERMES_SETUP_FILE
} from "./constants";

export default async function* HermesTranslator(
	env: Environment,
	[file, ...args]: string[],
	stdin?: string
) {
	//if (!file) {
	//	return `Usage: hermes [file] [...programArgs]`;
	//}
	//file = env.path.resolve(env.workingDirectory, file);

	// @ts-expect-error
	self.fetch = async (url: string) => {
		const fetch = await env.network.request("get", url, "text");

		return {
			statusCode: fetch.statusCode,
			statusText: fetch.statusText,
			ok: fetch.isOk,

			async text() {
				if (!fetch.isOk)
					throw new Error(
						`HTTP Error ${fetch.statusCode}: ${fetch.statusText}`
					);

				return fetch.response;
			},
			async json() {
				if (!fetch.isOk)
					throw new Error(
						`HTTP Error ${fetch.statusCode}: ${fetch.statusText}`
					);

				return JSON.parse(fetch.response);
			},
			async blob() {
				if (!fetch.isOk)
					throw new Error(
						`HTTP Error ${fetch.statusCode}: ${fetch.statusText}`
					);

				return new Blob([fetch.response]);
			}
		};
	};

	await env.fs.mkdir(HERMES_DATA, { recursive: true });

	await env.fs.mkdir(HERMES_CASTOREA_DISK);
	await env.fs.mkdir(HERMES_SAHARA_ARES_DISK);

	async function* executeCastorea(code: string, args: any[]) {
		const transformed = compileCastoreaSourceCode(code);

		const fn = new Function(
			"local",
			"parent",
			"std",
			"Name",
			"PID",
			"args",
			"call",
			"console",
			"system",
			transformed
		);

		const memory: any = {};
		const parent = { PID: 0 };
		const stdio = { in: stdin, out: "" };
		const name = file?.textAfterAll?.("/") ?? "Hermes Emulated Process";
		const pid = 1;
		const calls = castoreaCalls(env, args);
		const logging = {
			log: (...data: string[]) => env.print(data.join(" ")),
			debug: (...data: string[]) => console.debug(data),
			warn: (...data: string[]) => env.warn(data.join(" ")),
			error: (...data: string[]) => env.error(data.join(" "))
		};

		interface Rigging {
			init?: Function;
			frame?: Function;
			compile?: Function;
			terminate?: Function;
		}

		const rigging: Rigging = fn(
			memory,
			parent,
			stdio,
			name,
			pid,
			args,
			calls,
			logging,
			undefined
		);

		if (rigging.init) {
			await rigging.init(args);

			env.setLogs([stdio.out]);
		}

		while (true) {
			if (rigging.frame) {
				await rigging.frame(args);
				env.setLogs([stdio.out]);
				yield;
			} else {
				return;
			}
		}
	}

	const isSetup = await env.fs.exists(HERMES_SETUP_FILE);
	if (!isSetup) {
		/* ===== Castorea Setup ===== */

		const index = {
			files: [
				{
					dir: "/System/bootloader/quark.json",
					parse: true
				},
				{
					dir: "/System/users.json",
					parse: true
				},
				{
					dir: "/System/groups.json",
					parse: true
				},
				"/System/peripherals/null",
				"/System/peripherals/urandom",
				"/System/peripherals/display",
				"/System/peripherals/eth0",
				"/System/info/hostname",
				"/System/icons/.favicon.svg"
			],
			auroraFiles: {
				"/kpkgs/castoreaKernel/castoreaKernel.js":
					"/System/kernel/castoreaKernel.js"
			},
			folders: [
				"/boot",

				"/System",
				"/System/apps",
				"/System/apps/data",
				"/System/apps/background",
				"/System/apps/compilers",
				"/System/apps/gui",
				"/System/apps/libraries",
				"/System/apps/utils",
				"/System/bootloader",
				"/System/config",
				"/System/services",
				"/System/fonts",
				"/System/icons",
				"/System/info",
				"/System/kernel",
				"/System/kernel/modules",
				"/System/logs",
				"/System/peripherals",
				"/proc",
				"/System/temp",
				"/System/wallpapers",

				"/Users",
				"/Users/Global"
			],
			packages: [
				//"castoreaKernel",
				"sysd",
				"core",
				"node",
				"man",
				"reboot",
				"wget",
				"ps",
				"sysinfo",
				"kill",
				"build",
				"import-export",
				"aquila",
				"useradd",
				"tree",
				"yes",
				"su",
				"sudo",
				"pgext",
				"yak",
				"zip",
				//"nimbus",
				//"wallpaperPack-1080p",
				"textedit"
				//"systemfonts"
			]
		};

		for (const dir of index.folders) {
			await env.fs.mkdir(env.path.join(HERMES_CASTOREA_DISK, dir));
		}

		await env.fs.writeFile(
			env.path.join(HERMES_CASTOREA_DISK, "/System/users.json"),
			JSON.stringify(users)
		);

		const auroraRequest = await env.network.request(
			"get",
			"https://aurora-pkgs.vercel.app/pkgs/aurora/src.js",
			"text"
		);

		if (auroraRequest.isOk) {
			await env.fs.mkdir(CASTOREA_UTILS_PATH, { recursive: true });
			await env.fs.writeFile(
				CASTOREA_AURORA_PATH,
				auroraRequest.response
			);
		} else {
			throw new Error("Could not retrieve aurora package manager.");
		}

		yield* executeCastorea(auroraRequest.response, [
			"sources",
			"add",
			"http://localhost:5079"
		]);
		yield* executeCastorea(auroraRequest.response, [
			"sources",
			"add",
			"https://aurora-pkgs.vercel.app"
		]);
		yield* executeCastorea(auroraRequest.response, ["index"]);
		yield* executeCastorea(auroraRequest.response, [
			"install",
			"-s",
			index.packages
		]);

		/* ===== Sahara/Ares Setup ===== */

		await env.fs.writeFile(HERMES_SETUP_FILE, "");
	}

	//const code = await env.fs.readFile(file);
	const code = await env.fs.readFile(CASTOREA_AURORA_PATH);
	if (!code) {
		return `File not found: ${code}`;
	}

	yield* executeCastorea(code, args);
}
