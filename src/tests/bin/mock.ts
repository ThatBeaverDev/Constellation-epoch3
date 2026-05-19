import { vi } from "vitest";
import { Environment } from "../../types/worker";

export function createMockEnv(): Environment {
	return {
		print: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		clearLogs: vi.fn(),

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

		workingDirectory: "/cwd",

		network: {
			request: vi.fn()
		} as any,

		execute: vi.fn(),
		processes: vi.fn(),
		parent: vi.fn(),

		systemStats: {} as any,

		sound: {
			play: vi.fn()
		}
	};
}
