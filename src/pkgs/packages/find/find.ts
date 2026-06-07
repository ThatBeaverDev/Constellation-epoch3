import { globToRegexPattern } from "../../../util/lib/globs";
import {
	logsToArrayLog,
	logToArrayLog,
	logToString
} from "../../../util/lib/logs";
import { Environment, FileStats } from "../../../util/types/worker";

interface FindQuery {
	startPath: string;

	filters: FindFilter[];
	actions: FindAction[];

	maxDepth?: number;
	minDepth?: number;
}

type FindFilter =
	| {
			type: "name";

			value: string;

			caseSensitive?: boolean;
	  }
	| {
			type: "type";

			value: "file" | "directory" | "socket";
	  };

type FindAction =
	| {
			type: "print";
	  }
	| {
			type: "delete";
	  }
	| {
			type: "exec";

			command: string[];
	  };

function parseFind(tokens: string[]): FindQuery {
	if (tokens.length === 0) {
		throw new Error("Missing path");
	}

	const parser = new Parser(tokens);

	const query: FindQuery = {
		startPath: parser.expect(),

		filters: [],
		actions: []
	};

	while (!parser.eof()) {
		const token = parser.current();

		switch (token) {
			case "--name": {
				parser.next();

				query.filters.push({
					type: "name",
					value: parser.expect()
				});

				break;
			}

			case "--iname": {
				parser.next();

				query.filters.push({
					type: "name",
					value: parser.expect(),
					caseSensitive: false
				});

				break;
			}

			case "--type": {
				parser.next();

				const value = parser.expect();

				if (
					value !== "file" &&
					value !== "directory" &&
					value !== "socket"
				) {
					throw new Error(`Invalid type: ${value}`);
				}

				query.filters.push({
					type: "type",
					value
				});

				break;
			}

			case "--max-depth": {
				parser.next();

				query.maxDepth = Number(parser.expect());

				break;
			}

			case "--min-depth": {
				parser.next();

				query.minDepth = Number(parser.expect());

				break;
			}

			case "--print": {
				parser.next();

				query.actions.push({
					type: "print"
				});

				break;
			}

			case "--delete": {
				parser.next();

				query.actions.push({
					type: "delete"
				});

				break;
			}

			case "--exec": {
				parser.next();

				const command: string[] = [];

				while (!parser.eof()) {
					const current = parser.current();

					if (current === ";") {
						break;
					}

					command.push(current);

					parser.next();
				}

				if (parser.current() !== ";") {
					throw new Error("Expected ';' after --exec");
				}

				parser.next();

				query.actions.push({
					type: "exec",
					command
				});

				break;
			}

			default:
				throw new Error(`Unknown token: ${token}`);
		}
	}

	if (query.actions.length === 0) {
		query.actions.push({
			type: "print"
		});
	}

	return query;
}
class Parser {
	index = 0;

	constructor(public tokens: string[]) {}

	current() {
		return this.tokens[this.index];
	}

	next() {
		this.index++;

		return this.current();
	}

	eof() {
		return this.index >= this.tokens.length;
	}

	expect() {
		const value = this.current();

		if (!value) {
			throw new Error("Unexpected end of input");
		}

		this.next();

		return value;
	}
}

interface FindFileInfo {
	type: FileStats["type"];
	size: FileStats["size"];
	path: string;
	filename: string;
}

async function walk(
	env: Environment,
	path: string,
	minDepth: number,
	maxDepth: number,
	depth: number = 0,
	store: Record<string, FindFileInfo> = {}
) {
	const contents = await env.fs.readdir(path);

	for (const child of contents) {
		const childPath = env.path.join(path, child);
		const nodeDepth = depth + 1;

		const stats = await env.fs.stats(childPath);

		if (stats && nodeDepth >= minDepth && nodeDepth <= maxDepth) {
			const data: FindFileInfo = {
				type: stats.type,
				size: stats.size,
				path: childPath,
				filename: child
			};

			store[childPath] = data;
		}

		if (stats?.type == "directory") {
			await walk(env, childPath, minDepth, maxDepth, depth + 1, store);
		} else {
		}
	}

	return store;
}

export default async function* (env: Environment, args: string[]) {
	args = args
		.map((item) => item?.trim?.())
		.filter((item) => ![null, undefined, ""].includes(item));

	if (args.length == 0) {
		env.print("hlelp");

		return;
	}

	const parsed = parseFind(args);

	const files = await walk(
		env,
		env.path.resolve(env.workingDirectory, parsed.startPath),
		parsed.minDepth ?? -1,
		parsed.maxDepth ?? Infinity
	);

	for (const path in files) {
		const info = files[path];

		let passing = true;
		for (const filter of parsed.filters) {
			if (!passing) break;

			switch (filter.type) {
				case "name":
					const pattern = globToRegexPattern(filter.value);
					const regex = filter.caseSensitive
						? // case sensitive
							new RegExp(pattern)
						: // NOT case sensitive
							new RegExp(pattern, "i");

					const isOk = regex.test(info.filename);
					if (!isOk) {
						passing = false;
						break;
					}
					break;

				case "type":
					if (info.type !== filter.value) {
						passing = false;
						continue;
					}

					break;
			}
		}

		if (passing)
			for (const action of parsed.actions) {
				switch (action.type) {
					case "print":
						const relativePath = env.path.relative(
							parsed.startPath,
							info.path
						);

						env.print(relativePath);

						break;
					case "delete":
						await env.fs.rm(info.path);

						break;
					case "exec":
						const envExec = await env.execute("/bin/env.js", [
							action.command[0]
						]);
						const programPath = logToString(
							(await envExec.onExit).return ?? ""
						);
						if (!programPath) break;

						const programExec = await env.execute(
							programPath,
							action.command
								.slice(1)
								.map((item) => item.replaceAll("{}", info.path))
						);
						const programResult = await programExec.onExit;

						programResult.logs = logsToArrayLog(programResult.logs);
						programResult.return = logToArrayLog(
							programResult.return ?? ""
						);

						for (const log of programResult.logs) {
							env.print(log);
						}
						if (programResult.return)
							env.print(programResult.return);

						break;
				}
			}
	}
}
