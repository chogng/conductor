/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
	DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";

const NUMERIC_CELL_PATTERN = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const SCIENTIFIC_NUMERIC_CELL_PATTERN = /[eE][+-]?\d+$/;
const DOMINANT_SCALE_BUCKET_RATIO = 0.6;
const SCIENTIFIC_SCALE_BUCKET_RATIO = 0.4;
const MIN_SCIENTIFIC_SCALE_BUCKET_COUNT = 2;
const ADJACENT_SCALE_BUCKET_MAX_SPAN = 3;
const LOWER_SMALL_VALUE_BUCKET_MIN_RATIO = 0.05;
const LOWER_SMALL_VALUE_MAX_EXPONENT = -3;
const MAX_TABLE_DISPLAY_SIGNIFICANT_DIGITS = 12;
const SUPERSCRIPT_DIGITS: Record<string, string> = {
	"+": "⁺",
	"-": "⁻",
	"0": "⁰",
	"1": "¹",
	"2": "²",
	"3": "³",
	"4": "⁴",
	"5": "⁵",
	"6": "⁶",
	"7": "⁷",
	"8": "⁸",
	"9": "⁹",
};

export const parseNumericCell = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value !== "string") {
		return null;
	}

	const text = value.trim();
	if (!text || !NUMERIC_CELL_PATTERN.test(text)) {
		return null;
	}

	const numericValue = Number(text);
	return Number.isFinite(numericValue) ? numericValue : null;
};

export const chooseColumnScaleExponent = (
	values: readonly number[],
): number => {
	return chooseScaleBucket(values.map(value => ({
		isScientificNotation: false,
		value,
	})));
};

export const chooseColumnScaleExponentFromCells = (
	values: readonly unknown[],
): number => chooseScaleBucket(values.map(value => {
	const numericValue = parseNumericCell(value);
	return numericValue === null
		? null
		: {
			isScientificNotation: isScientificNumericCell(value),
			value: numericValue,
		};
}).filter((entry): entry is NumericScaleSample => entry !== null));

type NumericScaleSample = {
	readonly isScientificNotation: boolean;
	readonly value: number;
};

type ScaleBucketCount = {
	readonly exponent: number;
	count: number;
	scientificCount: number;
};

export const toSuperscriptExponent = (exponent: number): string => {
	const normalized = Math.trunc(Number(exponent) || 0);
	return String(normalized)
		.split("")
		.map(char => SUPERSCRIPT_DIGITS[char] ?? char)
		.join("");
};

export const toScaleHeaderSuffix = (scaleExponent: number): string | undefined => {
	const exponent = Math.trunc(Number(scaleExponent) || 0);
	return exponent === 0 ? undefined : `×10${toSuperscriptExponent(exponent)}`;
};

export const formatScaledNumber = (
	rawValue: unknown,
	profile: Pick<ColumnDisplayProfile, "scaleExponent" | "significantDigits">,
): string | null => {
	const numericValue = parseNumericCell(rawValue);
	if (numericValue === null) {
		return null;
	}

	const scaledValue = numericValue / Math.pow(10, profile.scaleExponent);
	if (!Number.isFinite(scaledValue)) {
		return null;
	}

	return trimInsignificantTrailingZeros(
		toPlainPrecision(
			scaledValue,
			normalizeSignificantDigits(profile.significantDigits),
		),
	);
};

export const formatCell = (
	rawValue: unknown,
	profile: ColumnDisplayProfile,
): string => {
	if (profile.mode !== "columnScale" || !profile.isNumericColumn) {
		return formatRawCell(rawValue);
	}

	return formatScaledNumber(rawValue, profile) ?? formatRawCell(rawValue);
};

export const formatRawCell = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	return String(value);
};

const chooseScaleBucket = (samples: readonly NumericScaleSample[]): number => {
	const magnitudes: number[] = [];
	const bucketCounts = new Map<number, ScaleBucketCount>();
	for (const { isScientificNotation, value } of samples) {
		const magnitude = Math.abs(value);
		if (!Number.isFinite(magnitude) || magnitude <= 0) {
			continue;
		}

		magnitudes.push(magnitude);
		const exponent = toEngineeringScaleExponent(magnitude);
		const bucket = bucketCounts.get(exponent) ?? {
			exponent,
			count: 0,
			scientificCount: 0,
		};
		bucket.count += 1;
		bucket.scientificCount += isScientificNotation ? 1 : 0;
		bucketCounts.set(exponent, bucket);
	}

	if (!magnitudes.length) {
		return 0;
	}

	const nonZeroCount = magnitudes.length;
	const lowerSmallValueBucket = getLowerSmallValueBucket(bucketCounts, nonZeroCount);
	if (lowerSmallValueBucket) {
		return lowerSmallValueBucket.exponent;
	}

	const dominantBucket = getMaxBucket(bucketCounts, bucket => bucket.count);
	if (dominantBucket && dominantBucket.count / nonZeroCount >= DOMINANT_SCALE_BUCKET_RATIO) {
		return dominantBucket.exponent;
	}

	const scientificBucket = getMaxBucket(bucketCounts, bucket => bucket.scientificCount);
	if (
		scientificBucket &&
		scientificBucket.scientificCount >= MIN_SCIENTIFIC_SCALE_BUCKET_COUNT &&
		scientificBucket.scientificCount / nonZeroCount >= SCIENTIFIC_SCALE_BUCKET_RATIO
	) {
		return scientificBucket.exponent;
	}

	return toEngineeringScaleExponent(getMedianMagnitude(magnitudes));
};

const getLowerSmallValueBucket = (
	bucketCounts: ReadonlyMap<number, ScaleBucketCount>,
	nonZeroCount: number,
): ScaleBucketCount | null => {
	const buckets = Array.from(bucketCounts.values())
		.filter(bucket => bucket.count / nonZeroCount >= LOWER_SMALL_VALUE_BUCKET_MIN_RATIO)
		.sort((left, right) => left.exponent - right.exponent);
	const firstBucket = buckets[0];
	const lastBucket = buckets[buckets.length - 1];
	if (!firstBucket || !lastBucket) {
		return null;
	}

	if (
		firstBucket.exponent === lastBucket.exponent ||
		lastBucket.exponent > LOWER_SMALL_VALUE_MAX_EXPONENT ||
		lastBucket.exponent - firstBucket.exponent > ADJACENT_SCALE_BUCKET_MAX_SPAN
	) {
		return null;
	}

	return firstBucket;
};

const getMaxBucket = (
	bucketCounts: ReadonlyMap<number, ScaleBucketCount>,
	getCount: (bucket: ScaleBucketCount) => number,
): ScaleBucketCount | null => {
	let bestBucket: ScaleBucketCount | null = null;
	for (const bucket of bucketCounts.values()) {
		const count = getCount(bucket);
		if (
			count > 0 &&
			(
				bestBucket === null ||
				count > getCount(bestBucket) ||
				(count === getCount(bestBucket) && bucket.count > bestBucket.count)
			)
		) {
			bestBucket = bucket;
		}
	}
	return bestBucket;
};

const getMedianMagnitude = (magnitudes: readonly number[]): number => {
	const sorted = [...magnitudes].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const toEngineeringScaleExponent = (magnitude: number): number => {
	if (!magnitude || !Number.isFinite(magnitude)) {
		return 0;
	}

	return Math.floor(Math.log10(magnitude) / 3) * 3;
};

const isScientificNumericCell = (value: unknown): boolean =>
	typeof value === "string" &&
	NUMERIC_CELL_PATTERN.test(value.trim()) &&
	SCIENTIFIC_NUMERIC_CELL_PATTERN.test(value.trim());

const trimInsignificantTrailingZeros = (text: string): string => {
	if (!text.includes(".")) {
		return text === "-0" ? "0" : text;
	}

	const trimmed = text
		.replace(/(\.\d*?[1-9])0+$/, "$1")
		.replace(/\.0+$/, "");
	return trimmed === "-0" ? "0" : trimmed;
};

const normalizeSignificantDigits = (value: number): number =>
	Math.min(
		MAX_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
		Math.max(1, Math.floor(Number(value) || DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS)),
	);

const toPlainPrecision = (value: number, significantDigits: number): string => {
	const precisionText = value.toPrecision(significantDigits);
	if (!/[eE]/.test(precisionText)) {
		return precisionText;
	}

	const roundedValue = Number(precisionText);
	if (!Number.isFinite(roundedValue)) {
		return precisionText;
	}

	const fixedDigits = Math.max(
		0,
		significantDigits - Math.floor(Math.log10(Math.abs(roundedValue) || 1)) - 1,
	);
	return roundedValue.toFixed(Math.min(12, fixedDigits));
};
