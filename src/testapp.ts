// @ts-nocheck
// the first program. it still works!

export default function* TestProgram(env) {
	env.print("Hello, World!");

	let i = 0;
	while (true) {
		yield;
		i += 1;
		yield;
		i += 1;
		yield;
		i += 1;
		yield;
		i += 1;
		yield;
		i += 1;

		env.print("Forever...");
		if (i == 500) break;
	}

	env.print("Or not.");
}
