export function invertHex(hex: string) {
	const noHash = hex.trim().substring(1);

	const segments: string[] = [
		noHash.substring(0, 2),
		noHash.substring(2, 4),
		noHash.substring(4, 6)
		// any more will be ignored
	];

	const numbers = segments.map((item) => Number(`0x${item}`));

	const inverted = numbers.map((item) => 255 - item);

	return "#" + inverted.join("");
}
