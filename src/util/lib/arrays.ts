export async function flatPromiseMap<A, T>(
	arr: A[],
	mapper: (item: A, i: number) => Promise<T[] | void>
): Promise<T[]> {
	const mapped = arr.map(mapper);

	const awaited = await Promise.all(mapped);

	const filtered = awaited.filter((item) => item !== undefined);

	return filtered.flat();
}
