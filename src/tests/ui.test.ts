import { beforeEach, describe, expect, it, vi } from "vitest";
import Ui from "../ui/dom";

function flushAnimationFrames() {
	return new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

function flushPromises() {
	return new Promise<void>((resolve) => {
		queueMicrotask(() => resolve());
	});
}

describe("BrowserUI", () => {
	let ui: InstanceType<typeof Ui>;

	const mockFs = {
		readFile: vi.fn(async (path: string) => {
			if (path === "/image.png") {
				return "data:image/png;base64,abc";
			}

			if (path === "/evil.txt") {
				return `" onerror="alert(1)`;
			}

			if (path === "/sound.mp3") {
				return "data:audio/mp3;base64,abc";
			}

			return null;
		})
	};

	beforeEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();

		ui = new Ui(mockFs as any);
	});

	describe("logging", () => {
		it("returns correct sequential log IDs", () => {
			const a = ui.log("test", "one");
			const b = ui.log("test", "two");
			const c = ui.log("test", "three");

			expect(a).toBe(0);
			expect(b).toBe(1);
			expect(c).toBe(2);
		});

		it("renders escaped HTML safely", async () => {
			ui.log("x", `<script>alert("bad")</script>`);

			await flushPromises();
			await flushAnimationFrames();

			expect(document.body.innerHTML).not.toContain("<script>");
			expect(document.body.innerHTML).toContain("&lt;script&gt;");
		});

		it("renders URLs as links", async () => {
			ui.log("x", "visit https://example.com/test?a=1&b=2");

			await flushPromises();
			await flushAnimationFrames();

			const anchor = document.querySelector("a");

			expect(anchor).toBeTruthy();
			expect(anchor?.href).toContain("https://example.com/test?a=1&b=2");
		});

		it("renders image logs", async () => {
			ui.log("x", [
				{
					type: "image",
					dir: "/image.png",
					width: 5
				}
			]);

			await flushPromises();
			await flushPromises();
			await flushAnimationFrames();

			const img = document.querySelector("img");

			expect(img).toBeTruthy();
			expect(img?.getAttribute("src")).toContain("data:image/png");
		});

		it("escapes image src attributes", async () => {
			ui.log("x", [
				{
					type: "image",
					dir: "/evil.txt",
					width: 5
				}
			]);

			await flushPromises();
			await flushPromises();
			await flushAnimationFrames();

			const html = document.body.innerHTML;

			expect(html).not.toContain(`onerror="alert(1)"`);
			expect(html).toContain("&quot;");
		});
	});

	describe("queueing", () => {
		it("batches queued logs into DOM", async () => {
			ui.log("x", "a");
			ui.log("x", "b");
			ui.log("x", "c");

			expect(document.querySelectorAll("p").length).toBe(0);

			await flushAnimationFrames();

			expect(document.querySelectorAll("p").length).toBeGreaterThan(0);
		});

		it("clear removes queued and rendered logs", async () => {
			ui.log("x", "a");
			ui.log("x", "b");

			ui.clear();

			await flushAnimationFrames();

			expect(document.querySelectorAll("p").length).toBe(0);
		});

		it("clear during queued animation frames does not reinsert logs", async () => {
			ui.log("x", "hello");

			ui.clear();

			await flushAnimationFrames();

			expect(document.body.textContent).not.toContain("hello");
		});
	});

	describe("input", () => {
		it("creates an input element", async () => {
			ui.input("Name:", {
				hideTyping: false,
				leaveInputOnCompletion: false,
				onPaste: vi.fn(),
				inline: false,
				initialText: ""
			});

			await flushAnimationFrames();

			const input = document.querySelector("input");

			expect(input).toBeTruthy();
		});

		it("resolves input promise on enter", async () => {
			const promise = ui.input("Prompt:", {
				hideTyping: false,
				leaveInputOnCompletion: false,
				onPaste: vi.fn(),
				inline: false,
				initialText: ""
			});

			await flushAnimationFrames();

			const input = document.querySelector("input") as HTMLInputElement;

			input.value = "hello";

			input.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter"
				})
			);

			const result = await promise;

			expect((result as any).response).toBe("hello");
			expect((result as any).displayText).toContain("hello");
		});

		it("supports password inputs", async () => {
			ui.input("Password:", {
				hideTyping: true,
				leaveInputOnCompletion: false,
				onPaste: vi.fn(),
				inline: false,
				initialText: ""
			});

			await flushAnimationFrames();

			const input = document.querySelector("input") as HTMLInputElement;

			expect(input.type).toBe("password");
		});
	});

	describe("warnings/errors", () => {
		it("supports rich warning logs", async () => {
			ui.warn("warn", [
				{
					text: "warning",
					colour: "#ff0000"
				}
			]);

			await flushPromises();
			await flushAnimationFrames();

			expect(document.body.innerHTML).toContain("warning");
		});

		it("supports rich error logs", async () => {
			ui.error("err", [
				{
					text: "error",
					colour: "#ff0000"
				}
			]);

			await flushPromises();
			await flushAnimationFrames();

			expect(document.body.innerHTML).toContain("error");
		});
	});

	describe("sound", () => {
		it("throws for missing sound files", async () => {
			await expect(
				ui.playSound({
					file: "/missing.mp3"
				})
			).rejects.toThrow();
		});

		it("clamps volume correctly", async () => {
			class FakeAudio {
				src = "";
				volume = 0;
				duration = 10;
				currentTime = 0;

				play = vi.fn(async () => {});
				pause = vi.fn();
				remove = vi.fn();

				addEventListener(type: string, callback: Function) {
					if (type === "loadeddata") {
						queueMicrotask(() => callback());
					}
				}

				removeEventListener() {}
			}

			vi.stubGlobal("Audio", FakeAudio);

			const result = await ui.playSound({
				file: "/sound.mp3",
				volume: 999
			});

			expect(result.duration).toBe(10);
		});
	});
});
