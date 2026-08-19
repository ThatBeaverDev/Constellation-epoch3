import { User } from "@/types/worker";
import UsersManager from "./users";
import {
	WORKER_READ_BLACKLIST,
	WORKER_READ_ROOT_BLACKLIST,
	WORKER_WRITE_BLACKLIST,
	WORKER_WRITE_ROOT_BLACKLIST
} from "../constants";
import { PermissionError } from "../errors";

export async function tryReadFile(
	path: string,
	users: UsersManager,
	user: User
) {
	const isPrivileged = await users.isPrivileged(user.UID);

	if (WORKER_READ_ROOT_BLACKLIST.has(path))
		throw new PermissionError(
			`Access Denied: Nobody, not even root, may read from ${path}.`
		);

	if (!isPrivileged)
		if (WORKER_READ_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not read from ${path}. Root is required.`
			);
}

export async function tryWriteFile(
	path: string,
	users: UsersManager,
	user: User
) {
	const isPrivileged = await users.isPrivileged(user.UID);

	if (WORKER_WRITE_ROOT_BLACKLIST.has(path))
		throw new PermissionError(
			`Access Denied: Nobody, not even root, may write to ${path}.`
		);

	if (!isPrivileged)
		if (WORKER_WRITE_BLACKLIST.has(path))
			throw new PermissionError(
				`Access Denied: May not write to ${path}. Root is required.`
			);
}
