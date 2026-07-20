import { nodeJs } from "./lib/config";
import Fs, { FilesystemInterface } from "./lib/fs";
import applyStringPrototypes from "./lib/strings";
import UsersManager from "./lib/users";
import Runtime from "./runtime";
import { UiManager } from "./ui/ui";
import { Log } from "./util/types/worker";

export default class Constellation {
	ui: UiManager;
	fs: FilesystemInterface;
	runtime: Runtime;
	users: UsersManager;

	#onInstallReady: (fs: FilesystemInterface) => Promise<void> | void;
	#execInterval?: number;
	readonly start: number = Date.now();
	readonly version = "0.1gen3";

	constructor(
		onInstallReady: (fs: FilesystemInterface) => Promise<void> | void,
		GivenUiManager: new (fs: FilesystemInterface) => UiManager
	) {
		applyStringPrototypes();
		this.#onInstallReady = onInstallReady;

		let log: UiManager["log"] | undefined = undefined;

		this.fs = new Fs((message: Log) => {
			log?.("fs", message);
		}, this.panic);

		this.ui = new GivenUiManager(this.fs);

		log = this.ui.log.bind(this.ui);
		this.runtime = new Runtime(
			this,

			log,
			this.ui.warn.bind(this.ui),
			this.ui.error.bind(this.ui),

			this.panic.bind(this, "runtime"),

			this.fs
		);

		this.users = new UsersManager(this.fs, this.ui);
	}

	async init() {
		try {
			this.ui.log("kernel", "Booting Kernel...");

			if (this.fs.init) await this.fs.init();
			await this.fs.waitForReady();

			// TODO: Create user zones
			await this.fs.mkdir("/data");
			await this.fs.mkdir("/config");

			await this.users.init();

			await this.#onInstallReady(this.fs);

			// start init
			const root = await this.users.userByUID(0);
			if (!root) throw new Error("Users did not provide a root user.");

			await this.runtime.executeProgram("/bin/init.js", undefined, root);
		} catch (e) {
			this.panic("init", e instanceof Error ? e : new Error(String(e)));
		}

		let lock = false;
		this.#execInterval = setInterval(async () => {
			if (lock == true) return;
			lock = true;

			await this.runtime.execLoop();

			lock = false;
		}, 0);
	}

	panic = (subsystem: "fs" | "ui" | "init" | "runtime", error: Error) => {
		console.error(error.stack);

		this.ui.error(
			"kernel",
			`PANIC IN ${subsystem.toUpperCase()} : ${error}`,
			false
		);

		this.exit();
	};

	exit() {
		clearInterval(this.#execInterval);

		this.runtime.exit();

		this.ui.log("kernel", "Exiting...");
		this.ui.exit();

		// @ts-expect-error
		if (nodeJs) process.exit();
	}
}
