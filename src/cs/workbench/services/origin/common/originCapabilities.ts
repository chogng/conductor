/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { resolveOriginLogPositiveMinForRange } from "src/cs/workbench/services/export/common/originAxisRange";

export type OriginAxisSide = "x" | "y";

export type OriginAxisScaleMode = "linear" | "log";

export type OriginAxisAppearancePatch = {
	readonly showGrid?: boolean;
	readonly showMajorTicks?: boolean;
	readonly showMinorTicks?: boolean;
};

export type OriginAxisRangePatch = {
	readonly from?: number;
	readonly to?: number;
	readonly step?: number;
};

export type OriginAxisScalePatch = {
	readonly mode?: OriginAxisScaleMode;
};

export type OriginAxisTitlePatch = {
	readonly text?: string;
	readonly fontSize?: number;
};

export type OriginAxisSpacingPatch = {
	readonly tickLabelOffset?: number;
	readonly axisTitleGap?: number;
};

export type OriginAxisFramePatch = {
	readonly xOpposite?: boolean;
	readonly yOpposite?: boolean;
};

export type OriginAxisCapabilities = {
	readonly appearance?: Partial<Record<OriginAxisSide, OriginAxisAppearancePatch>>;
	readonly range?: Partial<Record<OriginAxisSide, OriginAxisRangePatch>>;
	readonly scale?: Partial<Record<OriginAxisSide, OriginAxisScalePatch>>;
	readonly title?: Partial<Record<OriginAxisSide, OriginAxisTitlePatch>>;
	readonly spacing?: OriginAxisSpacingPatch;
	readonly frame?: OriginAxisFramePatch;

	/**
	 * Advanced/manual escape hatch only. Product-generated axis behavior must
	 * stay semantic and be interpreted by the Python Origin adapter.
	 */
	readonly advancedCommands?: readonly string[];
};

const ORIGIN_LINEAR_Y_PADDING_RATIO = 0.05;
const ORIGIN_LINEAR_SINGLE_VALUE_PADDING_RATIO = 0.1;
const ORIGIN_LOG_Y_PADDING_RATIO = 0.05;
const ORIGIN_LOG_Y_PADDING_DECADES_MIN = 0.2;
const ORIGIN_LOG_SINGLE_VALUE_PADDING_DECADES = 0.3;
const ORIGIN_LOG_EXP_MIN = -300;
const ORIGIN_LOG_EXP_MAX = 300;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number | undefined => {
	const num = Number(value);
	return Number.isFinite(num) ? (Object.is(num, -0) ? 0 : num) : undefined;
};

const normalizeTitleText = (
	value: unknown,
	{ max = 160 }: { readonly max?: number } = {},
): string | undefined => {
	const raw = String(value ?? "")
		.replace(/[\\_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!raw) {
		return undefined;
	}
	return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const removeUndefined = <T extends Record<string, unknown>>(value: T): Partial<T> => {
	const next: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) {
			next[key] = item;
		}
	}
	return next as Partial<T>;
};

const isEmptyRecord = (value: unknown): boolean =>
	!value || typeof value !== "object" || Object.keys(value).length === 0;

const compactAxisRecord = <T extends Record<string, unknown>>(
	value: Partial<Record<OriginAxisSide, T>> | undefined,
): Partial<Record<OriginAxisSide, T>> | undefined => {
	if (!value) {
		return undefined;
	}
	const next: Partial<Record<OriginAxisSide, T>> = {};
	for (const axisName of ["x", "y"] as const) {
		const axisValue = value[axisName];
		if (axisValue && !isEmptyRecord(axisValue)) {
			next[axisName] = axisValue;
		}
	}
	return isEmptyRecord(next) ? undefined : next;
};

const buildPaddedLinearRange = (
	minRaw: unknown,
	maxRaw: unknown,
): OriginAxisRangePatch | undefined => {
	const min = Number(minRaw);
	const max = Number(maxRaw);
	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		return undefined;
	}

	let lo = Math.min(min, max);
	let hi = Math.max(min, max);

	if (lo === hi) {
		const magnitude = Math.max(Math.abs(lo), 1);
		const pad = magnitude * ORIGIN_LINEAR_SINGLE_VALUE_PADDING_RATIO;
		lo -= pad;
		hi += pad;
	} else {
		const span = hi - lo;
		const pad = Math.max(
			span * ORIGIN_LINEAR_Y_PADDING_RATIO,
			1e-12 * Math.max(Math.abs(lo), Math.abs(hi), 1),
		);
		lo -= pad;
		hi += pad;
	}

	return hi > lo ? { from: lo, to: hi } : undefined;
};

const buildPaddedLogRange = (
	minPositiveRaw: unknown,
	maxPositiveRaw: unknown,
): OriginAxisRangePatch | undefined => {
	const minPositive = Number(minPositiveRaw);
	const maxPositive = Number(maxPositiveRaw);
	if (!Number.isFinite(minPositive) || !Number.isFinite(maxPositive)) {
		return undefined;
	}
	if (!(minPositive > 0) || !(maxPositive > 0)) {
		return undefined;
	}

	const lo = Math.min(minPositive, maxPositive);
	const hi = Math.max(minPositive, maxPositive);
	const logLo = Math.log10(lo);
	const logHi = Math.log10(hi);
	if (!Number.isFinite(logLo) || !Number.isFinite(logHi)) {
		return undefined;
	}

	const isSingleValue = !(logHi > logLo);
	const padDecades = isSingleValue
		? ORIGIN_LOG_SINGLE_VALUE_PADDING_DECADES
		: Math.max(
				ORIGIN_LOG_Y_PADDING_DECADES_MIN,
				(logHi - logLo) * ORIGIN_LOG_Y_PADDING_RATIO,
			);
	const from = Math.pow(10, clamp(logLo - padDecades, ORIGIN_LOG_EXP_MIN, ORIGIN_LOG_EXP_MAX));
	const to = Math.pow(10, clamp(logHi + padDecades, ORIGIN_LOG_EXP_MIN, ORIGIN_LOG_EXP_MAX));
	return Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from
		? { from, to }
		: undefined;
};

export { resolveOriginLogPositiveMinForRange };

export const buildOriginAxisAppearancePatch = (
	axisSettings: Record<string, unknown> | null | undefined,
): Partial<Record<OriginAxisSide, OriginAxisAppearancePatch>> | undefined => {
	if (!axisSettings) {
		return undefined;
	}
	const patch = removeUndefined({
		showGrid: typeof axisSettings.showGrid === "boolean" ? axisSettings.showGrid : undefined,
		showMajorTicks: typeof axisSettings.showMajorTicks === "boolean" ? axisSettings.showMajorTicks : undefined,
		showMinorTicks: typeof axisSettings.showMinorTicks === "boolean" ? axisSettings.showMinorTicks : undefined,
	});
	return isEmptyRecord(patch) ? undefined : { x: patch, y: patch };
};

export const buildOriginYAxisAutoRangePatch = (
	yScaleMode: OriginAxisScaleMode,
	payload: {
		readonly yPositiveMin?: unknown;
		readonly yPositiveMax?: unknown;
		readonly yLinearMin?: unknown;
		readonly yLinearMax?: unknown;
	} | null | undefined,
): OriginAxisRangePatch | undefined =>
	yScaleMode === "log"
		? buildPaddedLogRange(payload?.yPositiveMin, payload?.yPositiveMax)
		: buildPaddedLinearRange(payload?.yLinearMin, payload?.yLinearMax);

export const buildOriginYAxisDisplayRangePatch = (
	yScaleMode: OriginAxisScaleMode,
	rangeRaw: { readonly min?: unknown; readonly max?: unknown; readonly step?: unknown } | null | undefined,
): OriginAxisRangePatch | undefined => {
	const from = toFiniteNumber(rangeRaw?.min);
	const to = toFiniteNumber(rangeRaw?.max);
	if (from === undefined || to === undefined) {
		return undefined;
	}
	const min = Math.min(from, to);
	const max = Math.max(from, to);
	if (!(max > min)) {
		return undefined;
	}
	if (yScaleMode === "log" && (!(min > 0) || !(max > 0))) {
		return undefined;
	}
	const step = yScaleMode === "linear" ? toFiniteNumber(rangeRaw?.step) : undefined;
	return removeUndefined({ from: min, to: max, step });
};

export const buildOriginXAxisDisplayRangePatch = (
	rangeRaw: { readonly min?: unknown; readonly max?: unknown; readonly step?: unknown } | null | undefined,
): OriginAxisRangePatch | undefined => {
	const from = toFiniteNumber(rangeRaw?.min);
	const to = toFiniteNumber(rangeRaw?.max);
	if (from === undefined || to === undefined) {
		return undefined;
	}
	const min = Math.min(from, to);
	const max = Math.max(from, to);
	if (!(max > min)) {
		return undefined;
	}
	return removeUndefined({ from: min, to: max, step: toFiniteNumber(rangeRaw?.step) });
};

export const buildOriginAxisTitlePatch = (
	options: {
		readonly xAxisTitle?: unknown;
		readonly yAxisTitle?: unknown;
		readonly axisTitleFontSize?: unknown;
	} | null | undefined,
): Partial<Record<OriginAxisSide, OriginAxisTitlePatch>> | undefined => {
	const fontSize = toFiniteNumber(options?.axisTitleFontSize);
	const x = removeUndefined({
		text: normalizeTitleText(options?.xAxisTitle),
		fontSize,
	});
	const y = removeUndefined({
		text: normalizeTitleText(options?.yAxisTitle),
		fontSize,
	});
	const title = removeUndefined({
		x: isEmptyRecord(x) ? undefined : x,
		y: isEmptyRecord(y) ? undefined : y,
	});
	return isEmptyRecord(title) ? undefined : title;
};

export const buildOriginAxisSpacingPatch = (
	axisSettings: {
		readonly originTickLabelOffset?: unknown;
		readonly originAxisTitleGap?: unknown;
	} | null | undefined,
): OriginAxisSpacingPatch | undefined => {
	const spacing = removeUndefined({
		tickLabelOffset: toFiniteNumber(axisSettings?.originTickLabelOffset),
		axisTitleGap: toFiniteNumber(axisSettings?.originAxisTitleGap),
	});
	return isEmptyRecord(spacing) ? undefined : spacing;
};

export const buildOriginAxisCapabilities = (
	capabilities: OriginAxisCapabilities,
): OriginAxisCapabilities => removeUndefined({
	appearance: compactAxisRecord(capabilities.appearance),
	range: compactAxisRecord(capabilities.range),
	scale: compactAxisRecord(capabilities.scale),
	title: compactAxisRecord(capabilities.title),
	spacing: capabilities.spacing && !isEmptyRecord(capabilities.spacing) ? capabilities.spacing : undefined,
	frame: capabilities.frame && !isEmptyRecord(capabilities.frame) ? capabilities.frame : undefined,
	advancedCommands: capabilities.advancedCommands?.length ? capabilities.advancedCommands : undefined,
}) as OriginAxisCapabilities;
