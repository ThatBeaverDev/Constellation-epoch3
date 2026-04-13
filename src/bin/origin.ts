import { Environment } from "../types/worker";

export default async function* origin(env: Environment) {
	return (await env.parent())?.directory ?? "No Shell Detected";
}
