export function sleep(milliseconds: number) {
	return new Promise<void>((resolve) => {
		setTimeout(() => resolve(), milliseconds);
	});
}

export function readableTime(ms: number) {
	let time = ms;
	let units = "ms";

	if (time > 1000) {
		time /= 1000;
		units = "secs";

		if (time > 60) {
			time /= 60;
			units = "mins";

			if (time > 60) {
				time /= 60;
				units = "hrs";

				if (time > 24) {
					time /= 24;
					units = "days";
				}
			}
		}
	}

	const roundedTime = Math.round(time * 1000) / 1000;

	return `${roundedTime}${units}`;
}
