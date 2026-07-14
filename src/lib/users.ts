import { USER_FILE, USER_PASSWORD_FILE } from "../constants";
import { UiManager } from "../ui/ui";
import { FilesystemInterface } from "./fs";

type SemiRecord<T extends string | number | symbol, K> = Partial<Record<T, K>>;

export interface User {
	name: string;
	displayName?: string;
	UID: number;
	GUIDs: number[];
	passalgo: "SHA-512";
}

interface Group {
	name: string;

	GUID: number;
	UIDs: number[];
}

interface UsersFile {
	users: SemiRecord<number, User>;
	groups: SemiRecord<number, Group>;

	rootUsers: number[];

	nextUID: number;
	nextGUID: number;
}

type UsersStore = SemiRecord<number, User>;
type PasswordStore = SemiRecord<number, string>;
type GroupsStore = SemiRecord<number, Group>;

export default class UsersManager {
	#users: UsersStore = {};
	#groups: GroupsStore = {};
	#passwords: PasswordStore = {};

	#rootUsers = new Set<number>();
	get rootUsers() {
		return [...this.#rootUsers];
	}

	#nextUID: number = 0;
	#nextGUID: number = 0;

	constructor(
		public fs: FilesystemInterface,
		public ui: UiManager
	) {}

	async #getRootPasswordChoice(): Promise<string> {
		const inputRequest1 = await this.ui.input("Select a root password: ", {
			hideTyping: true,
			initialText: "",
			inline: false,
			leaveInputOnCompletion: true
		});
		if (!inputRequest1.finished) throw new Error("Input must be complete.");

		const inputRequest2 = await this.ui.input(
			"Re-enter a root password: ",
			{
				hideTyping: true,
				initialText: "",
				inline: false,
				leaveInputOnCompletion: true
			}
		);
		if (!inputRequest2.finished) throw new Error("Input must be complete.");

		if (inputRequest1.response !== inputRequest2.response) {
			this.ui.log("Users", "Passwords don't match.");
			return await this.#getRootPasswordChoice();
		}

		return inputRequest1.response;
	}

	async init() {
		const userJson = await this.fs.readFile<UsersFile>(USER_FILE, "json");
		const passwordJson = await this.fs.readFile<PasswordStore>(
			USER_PASSWORD_FILE,
			"json"
		);

		if (userJson && passwordJson) {
			this.#users = userJson.users;
			this.#groups = userJson.groups;
			this.#passwords = passwordJson;

			this.#rootUsers = new Set<number>(userJson.rootUsers);

			this.#nextUID = userJson.nextUID;
			this.#nextGUID = userJson.nextGUID;
		} else {
			const password = await this.#getRootPasswordChoice();

			const { user: root, password: rootPassword } = await this.#user(
				"root",
				password
			);

			this.#users = { [root.UID]: root };
			this.#passwords = { [root.UID]: rootPassword };
			this.#rootUsers.add(root.UID);

			await this.#writeFiles();
		}
	}

	async #user(name: string, password: string) {
		const user: User = {
			name,
			UID: this.#nextUID++,
			passalgo: "SHA-512",
			GUIDs: []
		};

		const passhash = await this.#passhash(password, user.passalgo);

		return { user, password: passhash };
	}

	async #passhash(password: string, algo: "SHA-512") {
		const encoder = new TextEncoder();

		const data = encoder.encode(password);

		const hashBuffer = await crypto.subtle.digest(algo, data);

		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((item) => item.toString(16).padStart(2, "0"))
			.join("-");

		return hashHex;
	}

	async #writeFiles() {
		const userJson: UsersFile = {
			users: this.#users,
			groups: this.#groups,

			rootUsers: [...this.#rootUsers],

			nextUID: this.#nextUID,
			nextGUID: this.#nextGUID
		};

		const passwordFile = JSON.stringify(this.#passwords);

		const promises = [
			this.fs.writeFile(USER_FILE, JSON.stringify(userJson)),
			this.fs.writeFile(USER_PASSWORD_FILE, JSON.stringify(passwordFile))
		];

		await Promise.all(promises);
	}

	async newUser(name: string, password: string) {
		const { user, password: passhash } = await this.#user(name, password);

		this.#users[user.UID] = user;
		this.#passwords[user.UID] = passhash;

		await this.#writeFiles();

		return user;
	}

	userByUID(UID: number) {
		return this.#users[UID];
	}

	async newGroup(name: string, UIDs: number[]) {
		const group: Group = {
			name,
			GUID: this.#nextGUID++,
			UIDs: UIDs.filter(
				(GivenUID) => this.#passwords[GivenUID] !== undefined
			)
		};

		this.#groups[group.GUID] = group;

		await this.#writeFiles();

		return group;
	}
}
