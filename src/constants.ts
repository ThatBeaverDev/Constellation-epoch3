export const USER_FILE = "/config/users.json";
export const USER_PASSWORD_FILE = "/config/passwords.json";
export const DEFAULT_PASSWORD_ALGO: "SHA-512" = "SHA-512";

export const WORKER_WRITE_BLACKLIST: Set<string> = new Set([
	USER_FILE,
	USER_PASSWORD_FILE
]);
export const WORKER_READ_BLACKLIST: Set<string> = new Set([USER_PASSWORD_FILE]);
