import { describe, it, expect } from "vitest";
import { createMockEnv } from "./mock.js";
import grep from "../../bin/grep.js";

describe("Grep tests", () => {
	it("prints matching lines", () => {
		const env = createMockEnv();

		const input = ["hello\nworld\nhello again"];

		grep(env, ["hello"], input);

		expect(env.print).toHaveBeenCalledTimes(2);
		expect(env.print).toHaveBeenCalledWith("hello");
		expect(env.print).toHaveBeenCalledWith("hello again");
	});

	it("prints nothing if no matches", () => {
		const env = createMockEnv();

		const input = ["abc\ndef"];

		grep(env, ["zzz"], input);

		expect(env.print).not.toHaveBeenCalled();
	});

	it("handles empty inputLogs", () => {
		const env = createMockEnv();

		grep(env, ["test"], undefined);

		expect(env.print).not.toHaveBeenCalled();
	});

	it("returns usage if no search term", () => {
		const env = createMockEnv();

		const result = grep(env, [undefined]);

		expect(result).toContain("usage");
	});

	it("matches substrings (not full words)", () => {
		const env = createMockEnv();

		const input = ["foobar"];

		grep(env, ["oba"], input);

		expect(env.print).toHaveBeenCalledWith("foobar");
	});

	it("is case sensitive", () => {
		const env = createMockEnv();

		const input = ["Hello"];

		grep(env, ["hello"], input);

		expect(env.print).not.toHaveBeenCalled();
	});
});
