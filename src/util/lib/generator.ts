export default async function finishGenerator(
	generator: Generator | AsyncGenerator
) {
	while (true) {
		const result = await generator.next();

		if (result.done) {
			return result.value;
		}
	}
}
