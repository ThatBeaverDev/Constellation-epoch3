import { vi } from "vitest";
import { Environment } from "../../util/types/worker";

export function createMockEnv(): Environment {
	return {
		print: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),

		clearLogs: vi.fn(),
		setLogs: vi.fn(),

		terminalDimensions: vi.fn(),

		getLiveCanvas: vi.fn(),

		input: vi.fn(),

		fs: {
			mkdir: vi.fn(),
			readFile: vi.fn(),
			writeFile: vi.fn(),
			rm: vi.fn()
		} as any,

		path: {
			join: (...args: string[]) => args.join("/"),
			resolve: (...args: string[]) => args.join("/")
		} as any,

		users: { user: vi.fn() } as any,

		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		triggerEvent: vi.fn(),

		workingDirectory: "/cwd",

		network: {
			request: vi.fn()
		} as any,

		execute: vi.fn(),
		processes: vi.fn(),
		self: vi.fn(),
		parent: vi.fn(),

		systemStats: {} as any,

		sound: {
			play: vi.fn()
		},

		sockets: {
			connectToSocket: vi.fn(),
			createSocket: vi.fn()
		},

		timers: {
			sleep(ms: number) {
				return new Promise<void>((resolve) => {
					setTimeout(resolve, ms);
				});
			},

			setInterval,

			clearInterval
		},

		exit: vi.fn()
	};
}

export const basicNetworkGetSuccess = {
	isOk: true,

	statusCode: 200,
	statusText: "OK",
	response: undefined
};
