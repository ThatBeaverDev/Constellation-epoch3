import { Environment } from "../types/worker";

export default function* echo(env: Environment, args: string[]) {
	env.print(
		args.map((item) => {
			return { text: item };
		})
	);
}
