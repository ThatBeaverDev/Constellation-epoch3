export function clamp(number: number, min: number, max: number) {
	if (min > number) return min;
	if (max < number) return max;

	return number;
}
