import { Environment, WorkerOutputProxy } from "../types/worker";

export function PassthroughOutputProxy(env: Environment): WorkerOutputProxy {
	return {
		onLog(type, log) {
			switch (type) {
				case "log":
					env.print(log);
					break;

				case "warning":
					env.warn(log);
					break;

				case "error":
					env.error(log);
					break;
			}
		},

		onSetLogs(logs) {
			env.setLogs(logs);
		},

		onInput(message, config) {
			return env.input(message, config);
		},

		getDimensions() {
			return env.terminalDimensions();
		}
	};
}
