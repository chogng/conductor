/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	BaseCurveRecord,
	CurrentMetricRecord,
	CurveLineage,
	CurveRef,
	DerivedCurveRecord,
	DerivativeMetricRecord,
	MetricInputRecord,
	SecondDerivedCurveRecord,
	SeriesRecord,
	SubthresholdMetricRecord,
	ThresholdMetricRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type CalculationXAxisRole = "vg" | "vd" | null;

export type CalculationAxis = {
	readonly xLabel?: string;
	readonly xUnit?: string;
	readonly xAxisRole: CalculationXAxisRole;
	readonly yLabel?: string;
	readonly yUnit?: string;
};

export type CalculationSeriesRecord = Omit<SeriesRecord, "fileId" | "sheetId">;

export type CalculationCurveRef = Omit<CurveRef, "fileId">;

export type CalculationBaseCurveRecord =
	Omit<BaseCurveRecord, "fileId" | "lineage"> & {
		readonly lineage:
			Omit<
				Extract<CurveLineage, { readonly curveGeneration: "base" }>,
				"baseSeries"
			> & {
				readonly baseSeries: {
					readonly seriesId: string;
				};
			};
	};

export type CalculationDerivedCurveRecord =
	Omit<DerivedCurveRecord, "fileId" | "lineage"> & {
		readonly lineage:
			Omit<
				Extract<CurveLineage, { readonly curveGeneration: "derived" }>,
				"inputCurve"
			> & {
				readonly inputCurve: CalculationCurveRef;
			};
	};

export type CalculationSecondDerivedCurveRecord =
	Omit<SecondDerivedCurveRecord, "fileId" | "lineage"> & {
		readonly lineage:
			Omit<
				Extract<CurveLineage, { readonly curveGeneration: "secondDerived" }>,
				"inputCurve"
			> & {
				readonly inputCurve: CalculationCurveRef;
			};
	};

export type CalculationCurveRecord =
	| CalculationBaseCurveRecord
	| CalculationDerivedCurveRecord
	| CalculationSecondDerivedCurveRecord;

export type CalculationMetricInputRecord = Omit<MetricInputRecord, "fileId">;

type CalculationMetricRecordProjection<T> =
	T extends { readonly inputCurves: readonly CurveRef[] }
		? Omit<T, "fileId" | "inputCurves"> & {
			readonly inputCurves: CalculationCurveRef[];
		}
		: never;

export type CalculationCurrentMetricRecord =
	CalculationMetricRecordProjection<CurrentMetricRecord>;
export type CalculationDerivativeMetricRecord =
	CalculationMetricRecordProjection<DerivativeMetricRecord>;
export type CalculationThresholdMetricRecord =
	CalculationMetricRecordProjection<ThresholdMetricRecord>;
export type CalculationSubthresholdMetricRecord =
	CalculationMetricRecordProjection<SubthresholdMetricRecord>;

export type CalculationMetricRecord =
	| CalculationCurrentMetricRecord
	| CalculationDerivativeMetricRecord
	| CalculationThresholdMetricRecord
	| CalculationSubthresholdMetricRecord;

export type CalculationRecordsInput = {
	readonly axis: CalculationAxis;
	readonly baseCurvesByKey: Readonly<Record<string, CalculationBaseCurveRecord>>;
	readonly metricInputsByKey?: Readonly<Record<string, CalculationMetricInputRecord>>;
	readonly seriesById: Readonly<Record<string, CalculationSeriesRecord>>;
	readonly seriesOrder: readonly string[];
};

export function collectCalculationBaseCurves(
	input: CalculationRecordsInput,
): CalculationBaseCurveRecord[] {
	const used = new Set<CalculationBaseCurveRecord>();
	const ordered: CalculationBaseCurveRecord[] = [];
	const pushCurve = (curve: CalculationBaseCurveRecord): void => {
		if (used.has(curve)) {
			return;
		}
		used.add(curve);
		ordered.push(curve);
	};

	for (const seriesId of input.seriesOrder) {
		for (const curve of Object.values(input.baseCurvesByKey)) {
			if (curve.seriesId === seriesId) {
				pushCurve(curve);
			}
		}
	}
	for (const curve of Object.values(input.baseCurvesByKey)) {
		pushCurve(curve);
	}

	return ordered;
}

export function getCalculationCurveType(
	curve: CalculationBaseCurveRecord | undefined,
): string | undefined {
	if (curve?.curveFamily === "iv" && curve.ivMode) {
		return curve.ivMode;
	}
	if (curve?.curveFamily === "it" && curve.itMode) {
		return curve.itMode;
	}
	return curve?.curveFamily;
}

export function calculationSupportsSs(
	input: CalculationRecordsInput,
): boolean {
	return collectCalculationBaseCurves(input).some(curve =>
		curve.curveFamily === "iv" && curve.ivMode === "transfer"
	);
}
