import { WORKER_READ_BLACKLIST, WORKER_WRITE_BLACKLIST } from "../constants";
import { PermissionError } from "./errors";

export function tryReadFile(path: string) {
	if (WORKER_READ_BLACKLIST.has(path))
		throw new PermissionError(`Access Denied: May not read ${path}`);
}

export function tryWriteFile(path: string) {
	if (WORKER_WRITE_BLACKLIST.has(path))
		throw new PermissionError(`Access Denied: May not write to ${path}`);
}
