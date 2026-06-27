/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export function isObject(value: unknown): value is object {
	return typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!(value instanceof RegExp) &&
		!(value instanceof Date);
}

export function isUndefined(value: unknown): value is undefined {
	return typeof value === "undefined";
}

export function isUndefinedOrNull(value: unknown): value is undefined | null {
	return isUndefined(value) || value === null;
}
