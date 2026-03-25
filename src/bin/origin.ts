import { Environment } from "../lib/worker";

export default async function* origin(env: Environment) {
	return (await env.parent())?.directory ?? "No Shell Detected";
}
