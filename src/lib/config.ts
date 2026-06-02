export const deleteFS =
	new URL(globalThis?.location?.href ?? "https://node.js").searchParams.get(
		"delete"
	) !== null;

// @ts-expect-error
export const nodeJs = typeof process !== "undefined";
