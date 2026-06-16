/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type OriginLegendStylePatch = {
	readonly fontSize?: number;
};

export type OriginStyleCapabilities = {
	readonly legend?: OriginLegendStylePatch;

	/**
	 * Advanced/manual escape hatch only. Product-generated style behavior must
	 * stay semantic and be interpreted by the Python Origin adapter.
	 */
	readonly advancedCommands?: readonly string[];
};

const toOriginStyleNumber = (value: unknown): number | undefined => {
	if (value === null || value === undefined || String(value).trim() === "") {
		return undefined;
	}

	const num = Number(value);
	if (!Number.isFinite(num)) {
		return undefined;
	}

	return Math.min(96, Math.max(1, Math.round(num)));
};

const isEmptyRecord = (value: unknown): boolean =>
	!value || typeof value !== "object" || Object.keys(value).length === 0;

const removeUndefined = <T extends Record<string, unknown>>(value: T): Partial<T> => {
	const next: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) {
			next[key] = item;
		}
	}
	return next as Partial<T>;
};

export const buildOriginLegendStylePatch = (
	options: {
		readonly legendFontSize?: unknown;
	} | null | undefined,
): OriginLegendStylePatch | undefined => {
	const fontSize = toOriginStyleNumber(options?.legendFontSize);
	return fontSize === undefined ? undefined : { fontSize };
};

export const buildOriginStyleCapabilities = (
	capabilities: OriginStyleCapabilities,
): OriginStyleCapabilities | undefined => {
	const next = removeUndefined({
		legend: capabilities.legend && !isEmptyRecord(capabilities.legend) ? capabilities.legend : undefined,
		advancedCommands: capabilities.advancedCommands?.length ? capabilities.advancedCommands : undefined,
	});
	return isEmptyRecord(next) ? undefined : next;
};
