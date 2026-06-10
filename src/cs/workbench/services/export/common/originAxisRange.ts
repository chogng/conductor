/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT = 50;
const ORIGIN_LOG_ROBUST_LOW_QUANTILE = 0.05;

export const resolveOriginLogPositiveMinForRange = (
	positiveValues: readonly number[],
	rawMin: number,
): number => {
	if (
		!Array.isArray(positiveValues) ||
		positiveValues.length < ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT
	) {
		return rawMin;
	}

	const sorted = positiveValues
		.filter(value => Number.isFinite(value) && value > 0)
		.slice()
		.sort((first, second) => first - second);
	if (!sorted.length) {
		return rawMin;
	}

	const quantileValue = computeSortedQuantile(
		sorted,
		ORIGIN_LOG_ROBUST_LOW_QUANTILE,
	);
	if (quantileValue === null || !Number.isFinite(quantileValue) || !(quantileValue > 0)) {
		return rawMin;
	}

	return Math.max(rawMin, quantileValue);
};

const computeSortedQuantile = (
	sortedValues: readonly number[],
	qRaw: number,
): number | null => {
	if (!sortedValues.length) {
		return null;
	}

	const q = Number.isFinite(qRaw) ? Math.min(1, Math.max(0, qRaw)) : 0;
	const index = Math.floor((sortedValues.length - 1) * q);
	const safeIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
	const value = Number(sortedValues[safeIndex]);
	return Number.isFinite(value) ? value : null;
};
