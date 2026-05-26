import { Environment } from "../util/types/worker";

export default function* echo(env: Environment, args: string[]) {
	env.print(
		args.map((item) => {
			return { text: item };
		})
	);
}
