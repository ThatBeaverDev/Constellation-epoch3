import { Environment } from "../types/worker";

export default async function* getState(env: Environment) {
	const workers = await env.systemStats.workerStats();

	for (const worker of workers) {
		env.print([{ text: `Worker ${worker.id}` }]);
		env.print([
			{ text: `- ${worker.processes} processes`, colour: "#BBBBBB" }
		]);
		env.print([
			{
				text: `- ${(worker.activeTime * 100).toFixed(2)}% Active time`,
				colour: "#BBBBBB"
			}
		]);

		env.print("\n");
	}
}
