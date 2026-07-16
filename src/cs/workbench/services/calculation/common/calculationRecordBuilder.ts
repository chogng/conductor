/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createCalculatedCurveRecords,
	createCalculatedCurveRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import {
	createCalculatedMetricRecords,
	createCalculatedMetricRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import type {
	CalculationCurveRecord,
	CalculationMetricRecord,
	CalculationRecordsInput,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import type {
	SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";

export type CalculatedRecords = {
	readonly curves: readonly CalculatedCurveRecord[];
	readonly metrics: readonly CalculatedMetricRecord[];
};

export type CalculatedCurveRecord =
	Exclude<CalculationCurveRecord, { readonly curveGeneration: "base" }>;
export type CalculatedMetricRecord = CalculationMetricRecord;

export const createCalculatedRecordsInputSignature = (
	input: CalculationRecordsInput,
): string => createCalculatedCurveRecordsInputSignature(
	input,
) + "\u001e" + createCalculatedMetricRecordsInputSignature(
	input,
);

export const createCalculatedRecords = (
	input: CalculationRecordsInput,
	analysisBySeriesId: CalculationAnalysisBySeriesId = {},
): CalculatedRecords => {
	const curves = createCalculatedCurveRecords(input, analysisBySeriesId);
	const metrics = createCalculatedMetricRecords(input, {
		analysisBySeriesId,
		derivativePointsBySeriesId: createDerivativePointsBySeriesId(curves),
	});
	return { curves, metrics };
};

const createDerivativePointsBySeriesId = (
	curves: readonly CalculationCurveRecord[],
): Readonly<Record<SeriesId, CalculationCurveRecord["points"]>> => {
	const pointsBySeriesId: Record<SeriesId, CalculationCurveRecord["points"]> = {};
	for (const curve of curves) {
		if (curve.curveGeneration === "derived" && curve.curveFamily === "gm") {
			pointsBySeriesId[curve.seriesId] = curve.points;
		}
	}
	return pointsBySeriesId;
};
