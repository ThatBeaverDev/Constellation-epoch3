export function globToRegexPattern(glob: string): string {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");

	const regex = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");

	return `^${regex}$`;
}

export function globToRegex(glob: string) {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");

	const regex = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");

	return new RegExp(`^${regex}$`);
}
