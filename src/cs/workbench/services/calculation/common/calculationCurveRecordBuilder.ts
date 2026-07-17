/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	executeCalculation,
	getCalculationDescriptor,
} from "src/cs/workbench/services/calculation/common/calculationExecutor";
import type { CalculationKind } from "src/cs/workbench/services/calculation/common/calculationTypes";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import { calculateSecondDerivativePoints } from "src/cs/workbench/services/calculation/common/gm";
import type {
	BaseCurveKey,
	CurveChannelsRecord,
	CurveKey,
	CurvePoint,
	DerivedCurveFamily,
	DerivedCurveKey,
	DomainRecord,
	SecondDerivedCurveKey,
	SeriesId,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import {
	type CalculationBaseCurveRecord,
	type CalculationCurveRecord,
	type CalculationDerivedCurveRecord,
	type CalculationRecordsInput,
	type CalculationSecondDerivedCurveRecord,
	collectCalculationBaseCurves,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

type DerivedCalculationKind = Exclude<CalculationKind, "iv">;

type BaseCurveInput = {
	readonly curve: CalculationBaseCurveRecord;
	readonly curveKey: BaseCurveKey;
};

type CurveChannelsAndDomain = {
	readonly channels: CurveChannelsRecord;
	readonly domain: DomainRecord;
};

type DomainAccumulator = {
	hasValue: boolean;
	max: number;
	min: number;
};

const DerivedCalculationKinds: readonly DerivedCalculationKind[] = ["gm", "ss", "vth"];

export const createCalculatedCurveRecordsInputSignature = (
	input: CalculationRecordsInput,
): string => {
	const parts = [
		"axis",
		input.axis.xAxisRole ?? "",
		input.axis.xLabel ?? "",
		input.axis.xUnit ?? "",
		input.axis.yLabel ?? "",
		input.axis.yUnit ?? "",
	];
	for (const curve of collectCalculationBaseCurves(input)) {
		parts.push(
			"curve",
			curve.seriesId,
			curve.curveFamily,
			curve.ivMode ?? "",
			curve.itMode ?? "",
			curve.signature,
		);
	}
	return parts.join("\u001f");
};

export const createCalculatedCurveRecords = (
	input: CalculationRecordsInput,
	analysisBySeriesId: CalculationAnalysisBySeriesId = {},
): Array<CalculationDerivedCurveRecord | CalculationSecondDerivedCurveRecord> => {
	const records: Array<
		CalculationDerivedCurveRecord | CalculationSecondDerivedCurveRecord
	> = [];
	const gmRecords: CalculationDerivedCurveRecord[] = [];
	for (const curveInput of collectBaseCurveInputs(input)) {
		for (const kind of DerivedCalculationKinds) {
			const record = createDerivedCurveRecord(
				curveInput,
				kind,
				analysisBySeriesId,
			);
			if (!record) {
				continue;
			}

			records.push(record);
			if (record.curveFamily === "gm") {
				gmRecords.push(record);
			}
		}
	}

	for (const gmRecord of gmRecords) {
		const record = createSecondDerivedCurveRecord(gmRecord);
		if (record) {
			records.push(record);
		}
	}

	return records;
};

const collectBaseCurveInputs = (
	input: CalculationRecordsInput,
): BaseCurveInput[] =>
	Object.entries(input.baseCurvesByKey).map(([curveKey, curve]) => ({
		curve,
		curveKey: curveKey as BaseCurveKey,
	}));

const createDerivedCurveRecord = (
	input: BaseCurveInput,
	kind: DerivedCalculationKind,
	analysisBySeriesId: CalculationAnalysisBySeriesId,
): CalculationDerivedCurveRecord | null => {
	const analysis = analysisBySeriesId[input.curve.seriesId];
	const precomputedPoints = kind === "gm"
		? analysis?.gm
		: kind === "ss"
			? analysis?.ss
			: undefined;
	const points = precomputedPoints
		? [...precomputedPoints]
		: executeCalculation({
			kind,
			points: input.curve.points,
		});
	if (!points.length) {
		return null;
	}

	const curveFamily = getDerivedCurveFamily(kind);
	const { channels, domain } = createCurveChannelsAndDomain(points);
	return {
		seriesId: input.curve.seriesId,
		curveGeneration: "derived",
		curveFamily,
		lineage: {
			curveGeneration: "derived",
			derivedFamily: curveFamily,
			inputCurve: {
				seriesId: input.curve.seriesId,
				curveKey: input.curveKey,
				signature: input.curve.signature,
			},
		},
		points,
		channels,
		domain,
		signature: createCalculatedCurveSignature({
			algorithmId: getCalculationDescriptor(kind).algorithmId,
			curveKey: createDerivedCurveKey(curveFamily, input.curve.seriesId),
			inputSignature: input.curve.signature,
			points,
		}),
	};
};

const createSecondDerivedCurveRecord = (
	inputCurve: CalculationDerivedCurveRecord,
): CalculationSecondDerivedCurveRecord | null => {
	if (inputCurve.curveGeneration !== "derived" || inputCurve.curveFamily !== "gm") {
		return null;
	}

	const points = calculateSecondDerivativePoints(inputCurve.points);
	if (!points.length) {
		return null;
	}

	const curveKey = createSecondDerivedCurveKey(inputCurve.seriesId);
	const { channels, domain } = createCurveChannelsAndDomain(points);
	return {
		seriesId: inputCurve.seriesId,
		curveGeneration: "secondDerived",
		curveFamily: "secondDerivative",
		lineage: {
			curveGeneration: "secondDerived",
			secondDerivedFamily: "secondDerivative",
			inputCurve: {
				seriesId: inputCurve.seriesId,
				curveKey: createDerivedCurveKey(inputCurve.curveFamily, inputCurve.seriesId),
				signature: inputCurve.signature,
			},
		},
		points,
		channels,
		domain,
		signature: createCalculatedCurveSignature({
			algorithmId: "secondDerivative.centralDerivative",
			curveKey,
			inputSignature: inputCurve.signature,
			points,
		}),
	};
};

const getDerivedCurveFamily = (
	kind: DerivedCalculationKind,
): DerivedCurveFamily => {
	switch (kind) {
		case "gm":
			return "gm";
		case "ss":
			return "localSs";
		case "vth":
			return "thresholdFit";
	}
};

const createDerivedCurveKey = (
	family: DerivedCurveFamily,
	seriesId: SeriesId,
): DerivedCurveKey => `derived:${family}:default:${seriesId}` as DerivedCurveKey;

const createSecondDerivedCurveKey = (
	seriesId: SeriesId,
): SecondDerivedCurveKey =>
	`secondDerived:secondDerivative:default:${seriesId}` as SecondDerivedCurveKey;

const createCurveChannelsAndDomain = (
	points: readonly CurvePoint[],
): CurveChannelsAndDomain => {
	const yPositive: number[] = [];
	const yAbsPositive: number[] = [];
	const yLog10Abs: number[] = [];
	const xDomain = createDomainAccumulator();
	const yDomain = createDomainAccumulator();
	const yPositiveDomain = createDomainAccumulator();
	const yAbsPositiveDomain = createDomainAccumulator();
	const yLog10AbsDomain = createDomainAccumulator();

	for (const point of points) {
		const x = Number(point.x);
		const y = Number(point.y);
		addDomainValue(xDomain, x);
		addDomainValue(yDomain, y);

		const positive = y > 0 ? y : Number.NaN;
		const absolute = Math.abs(y);
		const absolutePositive = absolute > 0 ? absolute : Number.NaN;
		const log10Absolute = absolute > 0 ? Math.log10(absolute) : Number.NaN;
		yPositive.push(positive);
		yAbsPositive.push(absolutePositive);
		yLog10Abs.push(log10Absolute);
		addDomainValue(yPositiveDomain, positive);
		addDomainValue(yAbsPositiveDomain, absolutePositive);
		addDomainValue(yLog10AbsDomain, log10Absolute);
	}

	return {
		channels: {
			yPositive,
			yAbsPositive,
			yLog10Abs,
		},
		domain: {
			x: readDomainAccumulator(xDomain),
			y: readDomainAccumulator(yDomain),
			yPositive: readDomainAccumulator(yPositiveDomain),
			yAbsPositive: readDomainAccumulator(yAbsPositiveDomain),
			yLog10Abs: readDomainAccumulator(yLog10AbsDomain),
		},
	};
};

const createDomainAccumulator = (): DomainAccumulator => ({
	hasValue: false,
	max: -Infinity,
	min: Infinity,
});

const addDomainValue = (accumulator: DomainAccumulator, value: number): void => {
	if (!Number.isFinite(value)) {
		return;
	}

	accumulator.hasValue = true;
	accumulator.min = Math.min(accumulator.min, value);
	accumulator.max = Math.max(accumulator.max, value);
};

const readDomainAccumulator = (
	accumulator: DomainAccumulator,
): [number, number] | undefined => {
	if (!accumulator.hasValue) {
		return undefined;
	}

	return [accumulator.min, accumulator.max];
};

const createCalculatedCurveSignature = ({
	algorithmId,
	curveKey,
	inputSignature,
	points,
}: {
	readonly algorithmId: string;
	readonly curveKey: CurveKey;
	readonly inputSignature: string;
	readonly points: readonly CurvePoint[];
}): string => {
	let hash = 0x811c9dc5;
	const add = (value: unknown): void => {
		const text = String(value ?? "");
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193);
		}
		hash ^= 31;
		hash = Math.imul(hash, 0x01000193);
	};

	add(algorithmId);
	add(curveKey);
	add(inputSignature);
	add(points.length);

	return (hash >>> 0).toString(16).padStart(8, "0");
};
