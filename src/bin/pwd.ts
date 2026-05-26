import { Environment } from "../util/types/worker";

export default function* pwd(env: Environment) {
	env.print(env.workingDirectory);
}
