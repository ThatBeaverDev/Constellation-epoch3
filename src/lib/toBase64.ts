// Source - https://stackoverflow.com/a/26603875
// Posted by Stefan Steiger, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-05, License - CC BY-SA 4.0

export function toBase64(txt: string) {
	// TextEncoder: Always UTF8
	const uint8Array = new TextEncoder().encode(txt);
	let binary = "";

	for (let i = 0; i < uint8Array.length; ++i)
		binary += String.fromCharCode(uint8Array[i]);

	return btoa(binary);
}
