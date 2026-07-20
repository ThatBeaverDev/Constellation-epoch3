import { Environment } from "../util/types/worker";

export default async function* origin(env: Environment) {
	return (await env.parent())?.name ?? "No Shell Detected";
}
