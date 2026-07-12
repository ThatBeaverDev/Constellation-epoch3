export function encodeBase64(input: string): string {
	return btoa(
		new TextEncoder()
			.encode(input)
			.reduce((data, byte) => data + String.fromCharCode(byte), "")
	);
}

export function decodeBase64(base64: string): string {
	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
