declare global {
	interface String {
		textAfter(after: string): string;
		textAfterAll(after: string): string;
		textBefore(before: string): string;
		textBeforeLast(before: string): string;
		map(mappings: Record<string, string>): string;
	}
}

export default function applyStringPrototypes() {
	String.prototype.textAfter = function (after) {
		return this.split(after).splice(1, Infinity).join(after);
	};

	String.prototype.textAfterAll = function (after) {
		return this.split(after).pop() ?? "";
	};

	String.prototype.textBefore = function (before) {
		return this.substring(0, this.indexOf(before));
	};

	String.prototype.textBeforeLast = function (before) {
		return this.split("")
			.reverse()
			.join("")
			.textAfter(before)
			.split("")
			.reverse()
			.join("");
	};

	String.prototype.map = function (mappings) {
		let text = String(this);

		for (const replaced in mappings) {
			text = text.replaceAll(replaced, mappings[replaced]);
		}

		return text;
	};
}
