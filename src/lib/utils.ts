export const env = typeof globalThis.window == "undefined" ? "node" : "web";

export const debug = true;

export const deleteFS =
	new URL(location.href).searchParams.get("delete") !== null;
