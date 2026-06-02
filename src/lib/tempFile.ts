// node only

export async function writeTempFile(contents: string) {
	// @ts-expect-error
	const os = await import("node:os");
	// @ts-expect-error
	const { writeFile } = await import("node:fs/promises");
	// @ts-expect-error
	const { join } = await import("node:path");

	const filename = `Constellation-TemporaryFile-${Date.now()}-${crypto.randomUUID()}`;
	const tmpDir = os.tmpdir();

	const path = join(tmpDir, filename);

	await writeFile(path, contents);
	return path;
}
