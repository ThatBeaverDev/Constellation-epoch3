export function clamp(n: number, min: number, max: number) {
	if (min > n) return min;
	if (n > max) return max;
	return n;
}
