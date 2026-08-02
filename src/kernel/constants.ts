export const USER_FILE = "/config/users.json";
export const USER_PASSWORD_FILE = "/config/passwords.json";
export const DEFAULT_PASSWORD_ALGO: "SHA-512" = "SHA-512";

export const WORKER_WRITE_ROOT_BLACKLIST: Set<string> = new Set([
	USER_PASSWORD_FILE
]);
export const WORKER_WRITE_BLACKLIST: Set<string> = new Set([
	USER_FILE,
	...WORKER_WRITE_ROOT_BLACKLIST
]);

export const WORKER_READ_ROOT_BLACKLIST: Set<string> = new Set([
	USER_PASSWORD_FILE
]);
export const WORKER_READ_BLACKLIST: Set<string> = new Set([
	...WORKER_READ_ROOT_BLACKLIST
]);

export const USER_FOLDERS = ["data", "config", "bin", "lib"];
export const ALLOWED_PROXY_EVENTS = new Set(["keyup", "keydown", "resize"]);

export const IS_NODE = typeof process !== "undefined";
export const NEW_FS =
	new URL(globalThis?.location?.href ?? "https://node.js").searchParams.get(
		"delete"
	) !== null;
export const IS_DEV_MODE =
	new URL(globalThis?.location?.href ?? "https://node.js").searchParams.get(
		"dev"
	) !== null;
