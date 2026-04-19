import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import DomFs, {
	basename,
	FilesystemInterface,
	normalise,
	parent
} from "../lib/fs.js";

describe("Filesystem stress tests", async () => {
	const fs: FilesystemInterface = new DomFs((_, err) => {
		throw err;
	});
	await fs.init?.();
	await fs.waitForReady();

	// -------------------------
	// BASIC INTEGRITY
	// -------------------------
	it("root directory exists", () => {
		expect(fs.exists("/")).toBe(true);
		expect(fs.isDir("/")).toBe(true);
	});

	it("cannot remove root", async () => {
		await expect(fs.rmdir("/")).rejects.toThrow();
	});

	// -------------------------
	// PATH NORMALISATION
	// -------------------------
	it("normalises missing leading slash", async () => {
		await fs.mkdir("/test");
		expect(fs.exists("test")).toBe(true);
	});

	it("normalises trailing slash", async () => {
		await fs.mkdir("/dir");
		expect(fs.isDir("/dir/")).toBe(true);
	});

	it("handles duplicate slashes (should fail or normalise)", async () => {
		await fs.mkdir("/a");
		await expect(fs.mkdir("//a//b")).resolves.toBeTruthy();
	});

	// -------------------------
	// DIRECTORY EDGE CASES
	// -------------------------
	it("fails mkdir if parent does not exist", async () => {
		await expect(fs.mkdir("/a/b/c/d")).rejects.toThrow();
	});

	it("cannot create duplicate directory", async () => {
		await fs.mkdir("/dup");
		const result = await fs.mkdir("/dup");
		expect(result).toBe(false);
	});

	it("cannot remove non-empty directory", async () => {
		await fs.mkdir("/dir");
		await fs.writeFile("/dir/file.txt", "data");

		await expect(fs.rmdir("/dir")).rejects.toThrow();
	});

	it("rm deletes directories recursively", async () => {
		await fs.mkdir("/dir");
		await fs.mkdir("/dir/sub");
		await fs.writeFile("/dir/sub/file.txt", "data");

		await fs.rm("/dir");

		expect(fs.exists("/dir")).toBe(false);
	});

	// -------------------------
	// FILE EDGE CASES
	// -------------------------
	it("writeFile fails if parent missing", async () => {
		await expect(fs.writeFile("/nope/file.txt", "data")).rejects.toThrow();
	});

	it("writeFile overwrites existing file", async () => {
		await fs.mkdir("/a");
		await fs.writeFile("/a/file.txt", "1");
		await fs.writeFile("/a/file.txt", "2");

		const result = await fs.readFile("/a/file.txt");
		expect(result).toBe("2");
	});

	it("cannot write file over directory", async () => {
		await fs.mkdir("/dir");
		await expect(fs.writeFile("/dir", "oops")).rejects.toThrow();
	});

	it("readFile returns undefined for missing file", async () => {
		const result = await fs.readFile("/nope.txt");
		expect(result).toBeUndefined();
	});

	it("unlink removes file", async () => {
		await fs.mkdir("/a");
		await fs.writeFile("/a/file.txt", "data");

		await fs.unlink("/a/file.txt");

		expect(fs.exists("/a/file.txt")).toBe(false);
	});

	it("unlink does nothing on missing file", async () => {
		await expect(fs.unlink("/nope")).resolves.toBeUndefined();
	});

	// -------------------------
	// READDIR CONSISTENCY
	// -------------------------
	it("readdir lists only direct children", async () => {
		await fs.mkdir("/dir");
		await fs.mkdir("/dir/sub");
		await fs.writeFile("/dir/file.txt", "data");

		const contents = await fs.readdir("/dir");

		expect(contents).toContain("sub");
		expect(contents).toContain("file.txt");
		expect(contents).not.toContain("dir");
	});

	it("readdir fails on file", async () => {
		await fs.mkdir("/a");
		await fs.writeFile("/a/file.txt", "data");

		await expect(fs.readdir("/a/file.txt")).rejects.toThrow();
	});

	// -------------------------
	// JSON HANDLING
	// -------------------------
	it("reads JSON correctly", async () => {
		await fs.mkdir("/a");
		await fs.writeFile("/a/data.json", JSON.stringify({ x: 1 }));

		const result = await fs.readFile("/a/data.json", "json");
		expect(result).toEqual({ x: 1 });
	});

	it("throws on invalid JSON", async () => {
		await fs.mkdir("/a");
		await fs.writeFile("/a/data.json", "{invalid}");

		await expect(fs.readFile("/a/data.json", "json")).rejects.toThrow();
	});

	// -------------------------
	// RACE CONDITIONS (IMPORTANT)
	// -------------------------
	it("handles concurrent writes", async () => {
		await fs.mkdir("/a");

		await Promise.all([
			fs.writeFile("/a/file.txt", "1"),
			fs.writeFile("/a/file.txt", "2"),
			fs.writeFile("/a/file.txt", "3")
		]);

		const result = await fs.readFile("/a/file.txt");
		expect(["1", "2", "3"]).toContain(result);
	});

	it("read after write consistency", async () => {
		await fs.mkdir("/a");

		await fs.writeFile("/a/file.txt", "data");
		const result = await fs.readFile("/a/file.txt");

		expect(result).toBe("data");
	});
});

describe("Path helpers – torture tests", () => {
	// -------------------------
	// NORMALISE
	// -------------------------
	describe("normalise()", () => {
		it("adds leading slash", () => {
			expect(normalise("a")).toBe("/a");
		});

		it("removes trailing slash", () => {
			expect(normalise("/a/")).toBe("/a");
		});

		it("keeps root intact", () => {
			expect(normalise("/")).toBe("/");
		});

		it("handles empty string (should become /)", () => {
			expect(normalise("")).toBe("/");
		});

		it("handles multiple trailing slashes", () => {
			expect(normalise("/a///")).toBe("/a");
		});

		it("does not collapse duplicate slashes (current behaviour)", () => {
			expect(normalise("//a//b")).toBe("/a/b");
		});

		it("throws on undefined", () => {
			expect(() => normalise(undefined as any)).toThrow();
		});
	});

	// -------------------------
	// PARENT
	// -------------------------
	describe("parent()", () => {
		it("gets parent of simple path", () => {
			expect(parent("/a/b")).toBe("/a");
		});

		it("parent of root is root", () => {
			expect(parent("/")).toBe("/");
		});

		it("parent of single segment is root", () => {
			expect(parent("/a")).toBe("/");
		});

		it("handles trailing slash", () => {
			expect(parent("/a/b/")).toBe("/a");
		});

		it("handles no leading slash input", () => {
			expect(parent("a/b")).toBe("/a");
		});

		it("handles weird double slashes", () => {
			expect(parent("//a//b")).toBe("/a");
		});
	});

	// -------------------------
	// BASENAME
	// -------------------------
	describe("basename()", () => {
		it("gets filename", () => {
			expect(basename("/a/b.txt")).toBe("b.txt");
		});

		it("handles trailing slash", () => {
			expect(basename("/a/b/")).toBe("b");
		});

		it("basename of root is empty string", () => {
			expect(basename("/")).toBe("");
		});

		it("handles no leading slash", () => {
			expect(basename("a/b")).toBe("b");
		});

		it("handles double slashes", () => {
			expect(basename("//a//b")).toBe("b");
		});
	});
});
