export function getFileExtension(path: string) {
	const filename = path.textAfterAll("/");

	const hasDot = filename.includes(".");

	if (hasDot) {
		return "";
	} else {
		return filename.textAfterAll(".");
	}
}
