import { logToArrayLog } from "../../../util/lib/logs";
import { ArrayLog, Environment, InputConfig } from "../../../util/types/worker";
import GraphicalUIManager from "../gui/lib.gui";
import { WindowText, WindowTextBox } from "../gui/windowContents";
import { Shell_IO, shellImpl } from "../shell/shell";

export default async function* TerminalApp(env: Environment) {
	const lib = new GraphicalUIManager(env);
	await lib.init("Terminal");

	const logs: ArrayLog[] = [];
	let input:
		| (Partial<InputConfig> & { message: string; backReference: string })
		| undefined = undefined;

	function updateGUI() {
		const yInterval = 20;
		let y = -yInterval;

		lib.setContents(
			[
				...logs.map((item): WindowText => {
					y += yInterval;
					return { type: "text", text: item, x: 5, y };
				}),

				input !== undefined
					? ({
							type: "textBox",
							message: input.message,

							identifier: input.backReference,

							x: 5,
							y: y + yInterval
						} as WindowTextBox)
					: undefined
			].filter((item) => item !== undefined)
		);
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

		print(data) {
			const string = logToArrayLog(data);
			logs.push(string);

			updateGUI();
		},

		clearLogs() {
			logs.splice(0, logs.length);
		}
	};

	const { runCommand } = await shellImpl(env, io, false);

	while (true) {
		await runCommand();

		yield;
	}
}
