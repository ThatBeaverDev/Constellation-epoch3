import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockEnv } from "./mock.js";
import wget from "../../bin/wget.js";
import applyStringPrototypes from "../../lib/strings.js";

describe("Wget tests", () => {
	beforeEach(() => {
		applyStringPrototypes();
	});

	it("fetches and writes file", async () => {
		const env = createMockEnv();

		env.network.request = vi.fn().mockResolvedValue("file contents");

		const gen = wget(env, ["http://example.com/file.txt", "file.txt"]);
		await gen.next();

		expect(env.network.request).toHaveBeenCalledWith(
			"get",
			"http://example.com/file.txt"
		);

		expect(env.fs.writeFile).toHaveBeenCalledWith(
			"/cwd/file.txt",
			"file contents"
		);
	});

	it("uses filename from URL if path not provided", async () => {
		const env = createMockEnv();

		env.network.request = vi.fn().mockResolvedValue("data");

		const gen = wget(env, ["http://site/a/b.txt", undefined]);
		await gen.next();

		expect(env.fs.writeFile).toHaveBeenCalledWith("/cwd/b.txt", "data");
	});

	it("fails if no URL", async () => {
		const env = createMockEnv();

		const result = await wget(env, [undefined, "file"]).next();

		expect(result.value).toContain("required");
	});

	it("writes to resolved absolute path", async () => {
		const env = createMockEnv();

		env.network.request = vi.fn().mockResolvedValue("x");

		env.path.resolve = vi.fn().mockReturnValue("/abs/file.txt");

		const gen = wget(env, ["url", "file.txt"]);
		await gen.next();

		expect(env.fs.writeFile).toHaveBeenCalledWith("/abs/file.txt", "x");
	});
});
