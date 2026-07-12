export function getMimeOfDataURL(data: string) {
	const mimeType = data.substring(
		// remove the 'data:'
		5,
		// remove everything after the mime
		Math.min(data.indexOf(";"), data.indexOf(","))
	);

	return mimeType;
}
