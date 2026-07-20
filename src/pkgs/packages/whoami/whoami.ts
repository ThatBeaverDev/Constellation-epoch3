import { user } from "../../../util/lib/users";
import { Environment } from "../../../util/types/worker";

export default async function* whoami(env: Environment) {
	const self = await env.self();

	const localUser = await user(env, self.UID);

	if (localUser) {
		env.print(localUser.displayName ?? localUser.name);
	}
}
