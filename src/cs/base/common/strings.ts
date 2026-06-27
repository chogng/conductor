/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export function isFalsyOrWhitespace(value: string | undefined): boolean {
	return !value || typeof value !== "string" || value.trim().length === 0;
}

const formatPattern = /{(\d+)}/g;

export function format(value: string, ...args: readonly unknown[]): string {
	if (args.length === 0) {
		return value;
	}

	return value.replace(formatPattern, (match, group) => {
		const index = Number.parseInt(group, 10);
		return Number.isNaN(index) || index < 0 || index >= args.length
			? match
			: String(args[index]);
	});
}

const formatObjectPattern = /{([^}]+)}/g;

export function format2(
	template: string,
	values: Record<string, unknown>,
): string {
	if (Object.keys(values).length === 0) {
		return template;
	}

	return template.replace(
		formatObjectPattern,
		(match, group) => values[group] === undefined || values[group] === null
			? match
			: String(values[group]),
	);
}

export function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\\{}*+?|^$.[\]()]/g, "\\$&");
}

export function compare(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

export function compareSubstring(
	a: string,
	b: string,
	aStart = 0,
	aEnd = a.length,
	bStart = 0,
	bEnd = b.length,
): number {
	for (; aStart < aEnd && bStart < bEnd; aStart += 1, bStart += 1) {
		const codeA = a.charCodeAt(aStart);
		const codeB = b.charCodeAt(bStart);
		if (codeA < codeB) {
			return -1;
		}
		if (codeA > codeB) {
			return 1;
		}
	}

	const aLength = aEnd - aStart;
	const bLength = bEnd - bStart;
	if (aLength < bLength) {
		return -1;
	}
	if (aLength > bLength) {
		return 1;
	}
	return 0;
}

export function compareIgnoreCase(a: string, b: string): number {
	return compareSubstringIgnoreCase(a, b, 0, a.length, 0, b.length);
}

export function compareSubstringIgnoreCase(
	a: string,
	b: string,
	aStart = 0,
	aEnd = a.length,
	bStart = 0,
	bEnd = b.length,
): number {
	for (; aStart < aEnd && bStart < bEnd; aStart += 1, bStart += 1) {
		let codeA = a.charCodeAt(aStart);
		let codeB = b.charCodeAt(bStart);

		if (codeA === codeB) {
			continue;
		}

		if (codeA >= 128 || codeB >= 128) {
			return compareSubstring(
				a.toLowerCase(),
				b.toLowerCase(),
				aStart,
				aEnd,
				bStart,
				bEnd,
			);
		}

		if (isLowerAsciiLetter(codeA)) {
			codeA -= 32;
		}
		if (isLowerAsciiLetter(codeB)) {
			codeB -= 32;
		}

		const diff = codeA - codeB;
		if (diff !== 0) {
			return diff;
		}
	}

	const aLength = aEnd - aStart;
	const bLength = bEnd - bStart;
	if (aLength < bLength) {
		return -1;
	}
	if (aLength > bLength) {
		return 1;
	}
	return 0;
}

export function isAsciiDigit(code: number): boolean {
	return code >= 48 && code <= 57;
}

export function isLowerAsciiLetter(code: number): boolean {
	return code >= 97 && code <= 122;
}

export function isUpperAsciiLetter(code: number): boolean {
	return code >= 65 && code <= 90;
}

export function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && compareSubstringIgnoreCase(a, b) === 0;
}

export function equals(
	a: string | undefined,
	b: string | undefined,
	ignoreCase?: boolean,
): boolean {
	return a === b ||
		(!!ignoreCase && a !== undefined && b !== undefined && equalsIgnoreCase(a, b));
}

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
	const length = candidate.length;
	return length <= str.length &&
		compareSubstringIgnoreCase(str, candidate, 0, length) === 0;
}

export function endsWithIgnoreCase(str: string, candidate: string): boolean {
	const length = str.length;
	const start = length - candidate.length;
	return start >= 0 &&
		compareSubstringIgnoreCase(str, candidate, start, length) === 0;
}

export function isHighSurrogate(charCode: number): boolean {
	return 0xD800 <= charCode && charCode <= 0xDBFF;
}

export function isLowSurrogate(charCode: number): boolean {
	return 0xDC00 <= charCode && charCode <= 0xDFFF;
}

export function computeCodePoint(
	highSurrogate: number,
	lowSurrogate: number,
): number {
	return ((highSurrogate - 0xD800) << 10) +
		(lowSurrogate - 0xDC00) +
		0x10000;
}
