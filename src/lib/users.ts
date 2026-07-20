import {
	DEFAULT_PASSWORD_ALGO,
	USER_FILE,
	USER_PASSWORD_FILE
} from "../constants";
import { UiManager } from "../ui/ui";
import { PermissionError } from "./errors";
import { FilesystemInterface } from "./fs";
import { Group, User } from "../util/types/worker";

type SemiRecord<T extends string | number | symbol, K> = Partial<Record<T, K>>;

interface UsersFile {
	users: SemiRecord<number, User>;
	groups: SemiRecord<number, Group>;

	rootUsers: number[];

	nextUID: number;
	nextGUID: number;
}

type UsersStore = SemiRecord<number, User>;
type PasswordAlgorithms = "SHA-512";
type PasswordStore = SemiRecord<
	number,
	{ hash: string; algo: PasswordAlgorithms }
>;
type GroupsStore = SemiRecord<number, Group>;

interface UsersData {
	users: UsersStore;
	groups: GroupsStore;

	passwords: PasswordStore;

	rootUsers: Set<number>;

	nextUID: number;
	nextGUID: number;
}

type UserDataGetResponse = { data: UsersData; onFinish: () => void };
type ReadonlyUserDataGetResponse = {
	data: Readonly<UsersData>;
	onFinish: () => void;
};

export default class UsersManager {
	#lockQueue: Promise<void>[] = [];

	constructor(
		public fs: FilesystemInterface,
		public ui: UiManager
	) {}

	async #getRootPasswordChoice(): Promise<string> {
		const inputRequest1 = await this.ui.input("Select a root password: ", {
			hideTyping: true,
			initialText: "",
			inline: false,
			leaveInputOnCompletion: false
		});
		if (!inputRequest1.finished) throw new Error("Input must be complete.");

		const inputRequest2 = await this.ui.input(
			"Re-enter a root password: ",
			{
				hideTyping: true,
				initialText: "",
				inline: false,
				leaveInputOnCompletion: false
			}
		);
		if (!inputRequest2.finished) throw new Error("Input must be complete.");

		if (inputRequest1.response !== inputRequest2.response) {
			this.ui.log("Users", "Passwords don't match.");
			return await this.#getRootPasswordChoice();
		}

		return inputRequest1.response;
	}

	async init() {}

	#getUserData(readonly: true): Promise<ReadonlyUserDataGetResponse>;
	#getUserData(readonly?: false): Promise<UserDataGetResponse>;
	async #getUserData(
		readonly: boolean = false
	): Promise<UserDataGetResponse | ReadonlyUserDataGetResponse> {
		let resolve: () => void;
		const promise = new Promise<void>((fn) => {
			resolve = fn;
		});

		const nextPromise = this.#lockQueue.at(-1);
		this.#lockQueue.push(promise);

		if (nextPromise) {
			await nextPromise;
		}

		const userJson = await this.fs.readFile<UsersFile>(USER_FILE, "json");
		const passwordJson = await this.fs.readFile<PasswordStore>(
			USER_PASSWORD_FILE,
			"json"
		);

		let data: UsersData;

		if (userJson && passwordJson) {
			data = {
				users: userJson.users,
				groups: userJson.groups,
				passwords: passwordJson,

				rootUsers: new Set<number>(userJson.rootUsers),

				nextUID: userJson.nextUID,
				nextGUID: userJson.nextGUID
			};
		} else {
			const password = await this.#getRootPasswordChoice();

			const root: User = {
				name: "root",
				UID: 0,
				GUIDs: []
			};

			const rootPassword = await this.#passhash(
				password,
				DEFAULT_PASSWORD_ALGO
			);

			data = {
				users: {
					[root.UID]: root
				},
				groups: {},
				passwords: {
					[root.UID]: {
						hash: rootPassword,
						algo: DEFAULT_PASSWORD_ALGO
					}
				},

				rootUsers: new Set<number>([root.UID]),

				nextUID: 1,
				nextGUID: 1
			};

			await this.#writeFiles(data);
		}

		if (readonly) {
			resolve!();
		}

		return {
			data,
			onFinish: () => {
				resolve();
			}
		};
	}

	async #user(name: string, password: string) {
		const { data } = await this.#getUserData();

		const user: User = {
			name,
			UID: data.nextUID++,
			GUIDs: []
		};

		const hash = await this.#passhash(password, DEFAULT_PASSWORD_ALGO);

		return { user, password: hash, algo: DEFAULT_PASSWORD_ALGO };
	}

	async #passhash(password: string, algo: PasswordAlgorithms) {
		const encoder = new TextEncoder();

		const data = encoder.encode(password);

		const hashBuffer = await crypto.subtle.digest(algo, data);

		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((item) => item.toString(16).padStart(2, "0"))
			.join("-");

		return hashHex;
	}

	async #writeFiles(data: UsersData) {
		const userJson: UsersFile = {
			users: data.users,
			groups: data.groups,

			rootUsers: [...data.rootUsers],

			nextUID: data.nextUID,
			nextGUID: data.nextGUID
		};

		const promises = [
			this.fs.writeFile(USER_FILE, JSON.stringify(userJson, null, 4)),
			this.fs.writeFile(
				USER_PASSWORD_FILE,
				JSON.stringify(data.passwords, null, 4)
			)
		];

		await Promise.all(promises);
	}

	async newUser(name: string, password: string) {
		const { data, onFinish } = await this.#getUserData();

		const { user, password: hash, algo } = await this.#user(name, password);

		data.users[user.UID] = user;
		data.passwords[user.UID] = { hash, algo };

		await this.#writeFiles(data);

		onFinish();

		return user;
	}

	async userByUID(UID: number) {
		const { data } = await this.#getUserData(true);

		return data.users[UID];
	}

	async newGroup(name: string, UIDs: number[]) {
		const { data, onFinish } = await this.#getUserData();

		const group: Group = {
			name,
			GUID: data.nextGUID++,
			UIDs: UIDs.filter(
				(GivenUID) => data.passwords[GivenUID] !== undefined
			)
		};

		data.groups[group.GUID] = group;

		await this.#writeFiles(data);

		onFinish();

		return group;
	}

	async verifyPassword(user: User, password: string) {
		const { data } = await this.#getUserData(true);

		const userPasshash = data.passwords[user.UID];

		if (!userPasshash) return true; // no password on this user

		const givenPassHash = await this.#passhash(password, userPasshash.algo);

		if (givenPassHash == userPasshash.hash) {
			// all good
			return true;
		} else {
			throw new PermissionError(
				`Incorrect password for user ${user.UID}.`
			);
		}
	}
}
