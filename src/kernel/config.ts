export const deleteFS =
	new URL(globalThis?.location?.href ?? "https://node.js").searchParams.get(
		"delete"
	) !== null;

export const devMode =
	new URL(globalThis?.location?.href ?? "https://node.js").searchParams.get(
		"dev"
	) !== null;

// @ts-expect-error
export const nodeJs = typeof process !== "undefined";
