/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CalculationPoint } from "src/cs/workbench/services/calculation/common/calculationTypes";

export type SeriesId = string;
export type CurvePoint = CalculationPoint;
export type BaseCurveFamily = "iv" | "cv" | "cf" | "pv" | "it";
export type IvCurveMode = "transfer" | "output";
export type ItCurveMode =
	| "stability"
	| "transient"
	| "retention"
	| "biasStress"
	| "photoResponse"
	| "generic";
export type DerivedCurveFamily =
	| "gm"
	| "localSs"
	| "thresholdFit"
	| "subthresholdFit";
export type SecondDerivedCurveFamily = "secondDerivative";
export type CurveGeneration = "base" | "derived" | "secondDerived";
export type BaseCurveKey =
	`base:${BaseCurveFamily}:${IvCurveMode | ItCurveMode | "default"}:${SeriesId}`;
export type DerivedCurveKey = `derived:${DerivedCurveFamily}:default:${SeriesId}`;
export type SecondDerivedCurveKey =
	`secondDerived:${SecondDerivedCurveFamily}:default:${SeriesId}`;
export type CurveKey = BaseCurveKey | DerivedCurveKey | SecondDerivedCurveKey;

export type CurveChannelsRecord = {
	readonly yPositive?: readonly number[];
	readonly yAbsPositive?: readonly number[];
	readonly yLog10Abs?: readonly number[];
};

export type DomainRecord = {
	readonly x?: readonly [number, number];
	readonly y?: readonly [number, number];
	readonly yPositive?: readonly [number, number];
	readonly yAbsPositive?: readonly [number, number];
	readonly yLog10Abs?: readonly [number, number];
};

export type CalculationSeriesRecord = {
	readonly id: SeriesId;
	readonly name?: string;
	readonly legendValue?: string;
	readonly groupIndex: number;
	readonly yCol?: number;
	readonly y: readonly number[];
	readonly labelOverride?: string;
};

export type CalculationCurveRef = {
	readonly seriesId: SeriesId;
	readonly curveKey: CurveKey;
	readonly signature: string;
};

export type CurveLineage =
	| {
		readonly curveGeneration: "base";
		readonly baseFamily: BaseCurveFamily;
		readonly ivMode?: IvCurveMode | null;
		readonly itMode?: ItCurveMode | null;
		readonly baseSeries: { readonly seriesId: SeriesId };
	}
	| {
		readonly curveGeneration: "derived";
		readonly derivedFamily: DerivedCurveFamily;
		readonly inputCurve: CalculationCurveRef;
	}
	| {
		readonly curveGeneration: "secondDerived";
		readonly secondDerivedFamily: SecondDerivedCurveFamily;
		readonly inputCurve: CalculationCurveRef;
	};

export type CalculationBaseCurveRecord = {
	readonly seriesId: SeriesId;
	readonly curveGeneration: "base";
	readonly curveFamily: BaseCurveFamily;
	readonly ivMode?: IvCurveMode | null;
	readonly itMode?: ItCurveMode | null;
	readonly lineage: Extract<CurveLineage, { readonly curveGeneration: "base" }>;
	readonly points: readonly CurvePoint[];
	readonly channels?: CurveChannelsRecord;
	readonly domain?: DomainRecord;
	readonly signature: string;
};

export type CalculationDerivedCurveRecord = {
	readonly seriesId: SeriesId;
	readonly curveGeneration: "derived";
	readonly curveFamily: DerivedCurveFamily;
	readonly lineage: Extract<CurveLineage, { readonly curveGeneration: "derived" }>;
	readonly points: readonly CurvePoint[];
	readonly channels?: CurveChannelsRecord;
	readonly domain?: DomainRecord;
	readonly signature: string;
};

export type CalculationSecondDerivedCurveRecord = {
	readonly seriesId: SeriesId;
	readonly curveGeneration: "secondDerived";
	readonly curveFamily: SecondDerivedCurveFamily;
	readonly lineage: Extract<CurveLineage, { readonly curveGeneration: "secondDerived" }>;
	readonly points: readonly CurvePoint[];
	readonly channels?: CurveChannelsRecord;
	readonly domain?: DomainRecord;
	readonly signature: string;
};

export type CalculationCurveRecord =
	| CalculationBaseCurveRecord
	| CalculationDerivedCurveRecord
	| CalculationSecondDerivedCurveRecord;

export type MetricFamily = "current" | "derivative" | "threshold" | "subthreshold";
export type MetricKey = `${MetricFamily}:${SeriesId}:${string}`;

export type CalculationMetricInputRecord = {
	readonly metricKey: MetricKey;
	readonly seriesId: SeriesId;
	readonly source: "auto" | "manual";
	readonly range?: { readonly x1?: number | null; readonly x2?: number | null };
	readonly targets?: Record<string, number | null>;
	readonly configSignature?: string;
};

export type CurrentWindowRecord = {
	readonly key: "lowEnd" | "highEnd" | "maxCurrent" | "minCurrent" | "zeroBias" | "manualIon" | "manualIoff";
	readonly label: string;
	readonly current: number | null;
	readonly x: number | null;
	readonly x1: number | null;
	readonly x2: number | null;
	readonly targetX: number | null;
	readonly pointCount: number;
};

export type CurrentMetricValueRecord = {
	readonly method: "auto" | "manual" | "unavailable";
	readonly ion: number | null;
	readonly xAtIon: number | null;
	readonly ioff: number | null;
	readonly xAtIoff: number | null;
	readonly ionIoff: number | null;
	readonly candidateWindows: CurrentWindowRecord[];
	readonly ionWindow?: CurrentWindowRecord | null;
	readonly ioffWindow?: CurrentWindowRecord | null;
};

export type DerivativeMetricValueRecord = {
	readonly kind: "gm" | "gds";
	readonly maxAbs: number | null;
	readonly xAtMaxAbs: number | null;
};

export type ThresholdMetricValueRecord = {
	readonly vth: number | null;
	readonly electron?: number | null;
	readonly hole?: number | null;
	readonly fitQuality?: "good" | "weak" | "failed" | "unavailable";
};

export type SubthresholdMetricValueRecord = {
	readonly ss: number | null;
	readonly confidence: "high" | "low" | "fail";
	readonly xAtSs: number | null;
	readonly method: "auto" | "manual";
};

type CalculationMetricRecordBase = {
	readonly key: MetricKey;
	readonly seriesId: SeriesId;
	readonly contextKey: string;
	readonly inputCurves: CalculationCurveRef[];
	readonly inputSignatures: string[];
	readonly algorithm?: { readonly id: string; readonly version?: string };
};

export type CalculationCurrentMetricRecord = CalculationMetricRecordBase & {
	readonly metricFamily: "current";
	readonly value: CurrentMetricValueRecord;
};
export type CalculationDerivativeMetricRecord = CalculationMetricRecordBase & {
	readonly metricFamily: "derivative";
	readonly value: DerivativeMetricValueRecord;
};
export type CalculationThresholdMetricRecord = CalculationMetricRecordBase & {
	readonly metricFamily: "threshold";
	readonly value: ThresholdMetricValueRecord;
};
export type CalculationSubthresholdMetricRecord = CalculationMetricRecordBase & {
	readonly metricFamily: "subthreshold";
	readonly value: SubthresholdMetricValueRecord;
};

export type CalculationMetricRecord =
	| CalculationCurrentMetricRecord
	| CalculationDerivativeMetricRecord
	| CalculationThresholdMetricRecord
	| CalculationSubthresholdMetricRecord;

export type CalculationXAxisRole = "vg" | "vd" | null;

export type CalculationAxis = {
	readonly xLabel?: string;
	readonly xUnit?: string;
	readonly xAxisRole: CalculationXAxisRole;
	readonly yLabel?: string;
	readonly yUnit?: string;
};

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
