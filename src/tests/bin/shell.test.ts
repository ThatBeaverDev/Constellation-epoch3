import { describe, it, expect } from "vitest";
import { parseShellCommand } from "../../bin/shell";

describe("Shell tests", () => {
	it("Handle standard commands (ls /bin)", () => {
		const ast = parseShellCommand("ls /bin");

		const result = JSON.stringify([{ name: "ls", args: ["/bin"] }]);
		expect(JSON.stringify(ast)).toBe(result);
	});

	it("Handle piping commands (tree | grep .js)", () => {
		const ast = parseShellCommand("tree | grep .js");

		const result = JSON.stringify([
			{
				name: "tree",
				args: [],
				output: {
					type: "command",
					command: { name: "grep", args: [".js"] }
				}
			}
		]);
		expect(JSON.stringify(ast)).toBe(result);
	});

	it("Handle file directed commands (tree > tree.txt)", () => {
		const ast = parseShellCommand("tree > tree.txt");

		const result = JSON.stringify([
			{
				name: "tree",
				args: [],
				output: {
					type: "file",
					name: "tree.txt"
				}
			}
		]);
		expect(JSON.stringify(ast)).toBe(result);
	});
});

describe("Shell parser stress tests", () => {
	// -------------------------
	// Whitespace weirdness
	// -------------------------
	it("Handle excessive whitespace", () => {
		const ast = parseShellCommand("   ls     /bin   ");
		expect(JSON.stringify(ast)).toBe(
			JSON.stringify([{ name: "ls", args: ["/bin"] }])
		);
	});

	it("Handle tabs and mixed whitespace", () => {
		const ast = parseShellCommand("ls\t\t/bin");
		expect(ast[0].name).toBe("ls");
		expect(ast[0].args).toEqual(["/bin"]);
	});

	// -------------------------
	// Pipes edge cases
	// -------------------------
	it("Handle multiple pipes", () => {
		const ast = parseShellCommand("cat file | grep foo | sort");

		expect(ast.length).toBe(1);
		expect(ast[0].name).toBe("cat");
		expect(ast[0].output?.type).toBe("command");
	});

	it("Handle pipe with extra spaces", () => {
		const ast = parseShellCommand("cat file  |   grep foo");

		// @ts-expect-error
		expect(ast[0].output?.command.name).toBe("grep");
	});

	it("Rejects trailing pipe", () => {
		expect(() => parseShellCommand("ls |")).toThrow();
	});

	it("Rejects leading pipe", () => {
		expect(() => parseShellCommand("| ls")).toThrow();
	});

	// -------------------------
	// Redirection edge cases
	// -------------------------
	it("Handle output redirection with no space", () => {
		const ast = parseShellCommand("ls>/tmp/out.txt");
		expect(ast[0].output?.type).toBe("file");
	});

	it("Handle multiple spaces in redirection", () => {
		const ast = parseShellCommand("ls   >    out.txt");

		// @ts-expect-error
		expect(ast[0].output?.name).toBe("out.txt");
	});

	it("rejects missing filename in redirection", () => {
		expect(() => parseShellCommand("ls >")).toThrow();
	});

	it("rejects multiple redirections if unsupported", () => {
		expect(() => parseShellCommand("ls > a.txt > b.txt")).toThrow();
	});

	// -------------------------
	// Combined pipe + redirect
	// -------------------------
	it("Handle pipe then redirection", () => {
		expect(parseShellCommand("cat file | grep foo > out.txt")).toEqual([
			{
				name: "cat",
				args: ["file"],
				output: {
					type: "command",
					command: {
						name: "grep",
						args: ["foo"],
						output: { type: "file", name: "out.txt" }
					}
				}
			}
		]);
	});

	it("Handle redirection before pipe", () => {
		expect(() =>
			parseShellCommand("cat file > out.txt | grep foo")
		).toThrow();
	});

	// -------------------------
	// Quoting edge cases (VERY IMPORTANT)
	// -------------------------
	it("Handle quoted arguments with spaces", () => {
		const ast = parseShellCommand('echo "hello world"');
		expect(ast[0].args).toEqual(["hello world"]);
	});

	it("Handle single quotes", () => {
		const ast = parseShellCommand("echo 'hello world'");
		expect(ast[0].args).toEqual(["hello world"]);
	});

	it("Handle mixed quotes incorrectly or consistently", () => {
		expect(() => parseShellCommand("echo 'hello\"world'")).not.toThrow();
	});

	it("does not split inside quotes for pipes", () => {
		const ast = parseShellCommand('echo "a | b"');
		expect(ast[0].args).toContain("a | b");
	});

	// -------------------------
	// Empty / malformed input
	// -------------------------
	it("Handle empty input", () => {
		expect(parseShellCommand("")).toEqual([]);
	});

	it("Handle only spaces", () => {
		expect(parseShellCommand("     ")).toEqual([]);
	});

	it("Handle repeated separators", () => {
		expect(() => parseShellCommand("ls || grep foo")).toThrow();
	});

	// -------------------------
	// Weird real-world combos
	// -------------------------
	it("Handle long chained pipeline", () => {
		const ast = parseShellCommand("cat a | grep b | grep c | sort | uniq");
		expect(ast[0].name).toBe("cat");
	});

	it("Handle trailing spaces after redirection", () => {
		const ast = parseShellCommand("ls > out.txt   ");

		// @ts-expect-error
		expect(ast[0].output?.name).toBe("out.txt");
	});

	it("Handle escaped characters (if supported)", () => {
		expect(() => parseShellCommand("echo hello\\|world")).not.toThrow();
	});
});
