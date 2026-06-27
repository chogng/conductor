/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export function ok(value?: unknown, message?: string): void {
	if (!value) {
		throw new Error(message ? `Assertion failed (${message})` : "Assertion Failed");
	}
}

export function assertNever(_value: never, message = "Unreachable"): never {
	throw new Error(message);
}

export function softAssertNever(_value: never): void {
	// no-op
}

export function assert(
	condition: boolean,
	messageOrError: string | Error = "unexpected state",
): asserts condition {
	if (!condition) {
		throw createAssertionError(messageOrError);
	}
}

export function softAssert(
	condition: boolean,
	message = "Soft Assertion Failed",
): void {
	if (!condition) {
		console.error(createAssertionError(message));
	}
}

export function assertFn(condition: () => boolean): void {
	if (!condition()) {
		// eslint-disable-next-line no-debugger
		debugger;
		condition();
		console.error(createAssertionError("Assertion Failed"));
	}
}

export function checkAdjacentItems<T>(
	items: readonly T[],
	predicate: (item1: T, item2: T) => boolean,
): boolean {
	let index = 0;
	while (index < items.length - 1) {
		const current = items[index];
		const next = items[index + 1];
		if (!predicate(current, next)) {
			return false;
		}
		index += 1;
	}
	return true;
}

const createAssertionError = (
	messageOrError: string | Error,
): Error =>
	typeof messageOrError === "string"
		? new Error(`Assertion Failed: ${messageOrError}`)
		: messageOrError;
