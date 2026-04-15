import Fs, { FilesystemInterface } from "./lib/fs";
import applyStringPrototypes from "./lib/strings";
import Runtime from "./runtime";
import Ui, { UiManager } from "./ui/ui";

export default class Constellation {
	ui: UiManager;
	fs: FilesystemInterface;
	runtime: Runtime;
	#onInstallReady: (fs: FilesystemInterface) => Promise<void> | void;
	#execInterval?: number;
	readonly start: number = Date.now();
	readonly version = "0.1gen3";

	constructor(
		onInstallReady: (fs: FilesystemInterface) => Promise<void> | void
	) {
		applyStringPrototypes();
		this.#onInstallReady = onInstallReady;

		this.fs = new Fs(this.panic);
		this.ui = new Ui(this.fs);
		this.runtime = new Runtime(
			this,

			this.ui.log.bind(this.ui),
			this.ui.warn.bind(this.ui),
			this.ui.error.bind(this.ui),

			this.panic.bind(this, "runtime"),

			this.fs
		);
	}

	async init() {
		try {
			this.ui.log("kernel", "Booting Kernel...");

			if (this.fs.init) await this.fs.init();
			await this.fs.waitForReady();

			await this.#onInstallReady(this.fs);

			// start init
			await this.runtime.executeProgram("/bin/init.js");
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
		console.error(error);

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
	}
}
