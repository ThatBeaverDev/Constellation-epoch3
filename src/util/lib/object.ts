/**
 * Falls back objects and parameters to a default.
 * @param object - Object to check
 * @param fallback - Default to fallback to
 * @returns Clone of the object, with fallbacks applied
 */
export function objectFallback<T = Object>(
	object: Partial<T> | void,
	fallback: T
): T {
	if (!object) {
		return structuredClone(fallback);
	}

	// @ts-expect-error
	const obj: T = structuredClone(object);
	for (const key in fallback) {
		if (!obj[key]) {
			// not present, fallback

			switch (typeof fallback[key]) {
				case "object":
					// @ts-expect-error
					obj[key] = objectFallback(obj[key], fallback[key]);
					break;

				default:
					obj[key] = structuredClone(fallback[key]);
			}
		}
	}

	return obj;
}
