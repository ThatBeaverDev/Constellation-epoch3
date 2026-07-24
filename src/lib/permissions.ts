import {
	WORKER_READ_BLACKLIST,
	WORKER_READ_ROOT_BLACKLIST,
	WORKER_WRITE_BLACKLIST,
	WORKER_WRITE_ROOT_BLACKLIST
} from "../constants";
import { User } from "../util/types/worker";
import { PermissionError } from "./errors";
import UsersManager from "./users";

export async function tryReadFile(
	path: string,
	users: UsersManager,
	user: User
) {
	const isPrivileged = await users.isPrivileged(user.UID);

	if (isPrivileged) {
		if (WORKER_READ_ROOT_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not read from ${path}.`
			);
	} else {
		if (WORKER_READ_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not read from ${path}. Root may be required.`
			);
	}
}

export async function tryWriteFile(
	path: string,
	users: UsersManager,
	user: User
) {
	const isPrivileged = await users.isPrivileged(user.UID);

	if (isPrivileged) {
		if (WORKER_WRITE_ROOT_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not write to ${path}.`
			);
	} else {
		if (WORKER_WRITE_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not write to ${path}. Root may be required.`
			);
	}
}
