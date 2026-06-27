/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export function stableStringify(value: unknown): string {
	if (value === undefined) {
		return "undefined";
	}

	try {
		return stableStringifyValue(value, new WeakSet());
	} catch {
		return "";
	}
}

const stableStringifyValue = (
	value: unknown,
	seen: WeakSet<object>,
): string => {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "null";
	}

	if (seen.has(value)) {
		return "\"[Circular]\"";
	}
	seen.add(value);

	if (Array.isArray(value)) {
		return `[${value.map(item => stableStringifyValue(item, seen)).join(",")}]`;
	}

	const parts: string[] = [];
	for (const key of Object.keys(value).sort()) {
		const entry = (value as Record<string, unknown>)[key];
		if (entry !== undefined) {
			parts.push(`${JSON.stringify(key)}:${stableStringifyValue(entry, seen)}`);
		}
	}
	return `{${parts.join(",")}}`;
};
