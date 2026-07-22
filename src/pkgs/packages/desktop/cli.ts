import { logToArrayLog, logToString } from "../../../util/lib/logs";
import { ArrayLog, Environment, InputConfig } from "../../../util/types/worker";
import GuiWindow from "../gui/lib.gui";
import { WindowText, WindowTextBox } from "../gui/types/windowContents";
import { Shell_IO, shellImpl } from "../shell/shell";

export default async function* TerminalApp(env: Environment) {
	const lib = new GuiWindow(env);
	await lib.init("Terminal");

	const logs: ArrayLog[] = [];
	let input:
		| (Partial<InputConfig> & { message: string; backReference: string })
		| undefined = undefined;

	let updateScheduled: boolean = false;
	function updateGUI() {
		if (updateScheduled) return;
		updateScheduled = true;

		requestAnimationFrame(() => {
			const yInterval = 20;
			let y = 0;

			lib.setContents(
				[
					...logs.map((item): WindowText => {
						const string = logToString(item);
						const lines = string.split("\n").length;

						const result: WindowText = {
							type: "text",
							text: item,
							x: 5,
							y
						};
						y += yInterval * lines;

						return result;
					}),

					input !== undefined
						? ({
								type: "textBox",
								message: input.message,

								identifier: input.backReference,

								x: 5,
								y
							} as WindowTextBox)
						: undefined
				].filter((item) => item !== undefined)
			);

			updateScheduled = false;
		});
	}

	let inputID = 0;
	const io: Shell_IO = {
		input: async (
			message: string,
			config?: Partial<InputConfig> | undefined
		): Promise<string> => {
			input = {
				message,
				backReference: `${inputID++}`,
				initialText: config?.initialText
			};

			updateGUI();

			const result = await lib.awaitInputResponse(input.backReference);
			if (config?.leaveInputOnCompletion ?? true)
				logs.push([{ text: `${message} ${result}` }]);

			return result;
		},

		print: (data) => {
			const string = logToArrayLog(data);
			logs.push(string);

			updateGUI();
		},

		clearLogs: () => {
			logs.splice(0, logs.length);

			updateGUI();
		},

		setLogs: (logs) => {
			io.clearLogs();

			for (const log of logs) io.print(log);
		},

		terminalDimensions: async () => {
			return { width: 100, height: 100 };
			//return lib.windowDimensions();
		}
	};

	const { runCommand } = await shellImpl(env, io);

	while (true) {
		const exit = await runCommand();
		if (exit) return;

		yield;
	}
}
