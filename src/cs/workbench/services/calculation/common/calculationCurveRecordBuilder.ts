/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	executeCalculation,
	getCalculationDescriptor,
} from "src/cs/workbench/services/calculation/common/calculationExecutor";
import type { CalculationKind } from "src/cs/workbench/services/calculation/common/calculationTypes";
import { calculateSecondDerivativePoints } from "src/cs/workbench/services/calculation/common/gm";
import { createCalculatedDataRecordInputSignature } from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type {
	BaseCurveKey,
	BaseCurveRecord,
	CurveChannelsRecord,
	CurveKey,
	CurvePoint,
	CurveRecord,
	DerivedCurveFamily,
	DerivedCurveKey,
	DomainRecord,
	FileId,
	FileRecord,
	SecondDerivedCurveKey,
	SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	collectFileRecordBaseCurves,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";

type DerivedCalculationKind = Exclude<CalculationKind, "iv">;

type BaseCurveInput = {
	readonly curve: BaseCurveRecord;
	readonly curveKey: BaseCurveKey;
};

const DerivedCalculationKinds: readonly DerivedCalculationKind[] = ["gm", "ss", "vth"];

export const createCalculatedCurveRecordsInputSignature = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): string => createCalculatedDataRecordInputSignature(filesById, fileOrder);

export const createCalculatedCurveRecordsByFile = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): Record<FileId, CurveRecord[]> => {
	const recordsByFileId: Record<FileId, CurveRecord[]> = {};
	for (const file of getOrderedFileRecords(filesById, fileOrder)) {
		const records = createCalculatedCurveRecordsForFile(file);
		if (records.length) {
			recordsByFileId[file.id] = records;
		}
	}

	return recordsByFileId;
};

export const createCalculatedCurveRecordsForFile = (
	file: FileRecord,
): CurveRecord[] => {
	const records: CurveRecord[] = [];
	const gmRecords: CurveRecord[] = [];
	for (const input of collectBaseCurveInputs(file)) {
		for (const kind of DerivedCalculationKinds) {
			const record = createDerivedCurveRecord(file.id, input, kind);
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

const collectBaseCurveInputs = (file: FileRecord): BaseCurveInput[] => {
	const keyByCurve = new Map<BaseCurveRecord, BaseCurveKey>();
	for (const [curveKey, curve] of Object.entries(file.curvesByKey) as Array<[CurveKey, CurveRecord]>) {
		if (curve.curveGeneration === "base") {
			keyByCurve.set(curve, curveKey as BaseCurveKey);
		}
	}

	return collectFileRecordBaseCurves(file)
		.map((curve): BaseCurveInput | null => {
			const curveKey = keyByCurve.get(curve);
			return curveKey ? { curve, curveKey } : null;
		})
		.filter((input): input is BaseCurveInput => input !== null);
};

const createDerivedCurveRecord = (
	fileId: FileId,
	input: BaseCurveInput,
	kind: DerivedCalculationKind,
): CurveRecord | null => {
	const points = executeCalculation({
		kind,
		points: input.curve.points,
	});
	if (!points.length) {
		return null;
	}

	const curveFamily = getDerivedCurveFamily(kind);
	const channels = createCurveChannels(points.map(point => point.y));
	const domain = createDomainRecord(points, channels);
	return {
		fileId,
		seriesId: input.curve.seriesId,
		curveGeneration: "derived",
		curveFamily,
		lineage: {
			curveGeneration: "derived",
			derivedFamily: curveFamily,
			inputCurve: {
				fileId,
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
	inputCurve: CurveRecord,
): CurveRecord | null => {
	if (inputCurve.curveGeneration !== "derived" || inputCurve.curveFamily !== "gm") {
		return null;
	}

	const points = calculateSecondDerivativePoints(inputCurve.points);
	if (!points.length) {
		return null;
	}

	const curveKey = createSecondDerivedCurveKey(inputCurve.seriesId);
	const channels = createCurveChannels(points.map(point => point.y));
	const domain = createDomainRecord(points, channels);
	return {
		fileId: inputCurve.fileId,
		seriesId: inputCurve.seriesId,
		curveGeneration: "secondDerived",
		curveFamily: "secondDerivative",
		lineage: {
			curveGeneration: "secondDerived",
			secondDerivedFamily: "secondDerivative",
			inputCurve: {
				fileId: inputCurve.fileId,
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

const createCurveChannels = (yValues: readonly number[]): CurveChannelsRecord => ({
	yPositive: yValues.map(value => value > 0 ? value : Number.NaN),
	yAbsPositive: yValues.map(value => {
		const absolute = Math.abs(value);
		return absolute > 0 ? absolute : Number.NaN;
	}),
	yLog10Abs: yValues.map(value => {
		const absolute = Math.abs(value);
		return absolute > 0 ? Math.log10(absolute) : Number.NaN;
	}),
});

const createDomainRecord = (
	points: readonly CurvePoint[],
	channels: CurveChannelsRecord,
): DomainRecord => ({
	x: getFiniteDomain(points.map(point => point.x)),
	y: getFiniteDomain(points.map(point => point.y)),
	yPositive: getFiniteDomain(channels.yPositive ?? []),
	yAbsPositive: getFiniteDomain(channels.yAbsPositive ?? []),
	yLog10Abs: getFiniteDomain(channels.yLog10Abs ?? []),
});

const getFiniteDomain = (values: readonly unknown[]): [number, number] | undefined => {
	const finite = values
		.map(value => Number(value))
		.filter(value => Number.isFinite(value));
	if (!finite.length) {
		return undefined;
	}

	return [Math.min(...finite), Math.max(...finite)];
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
	for (const point of points) {
		add(point.x);
		add(point.y);
	}

	return (hash >>> 0).toString(16).padStart(8, "0");
};

const getOrderedFileRecords = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): FileRecord[] => {
	const seen = new Set<FileId>();
	const files: FileRecord[] = [];
	const pushFile = (fileId: FileId): void => {
		if (seen.has(fileId)) {
			return;
		}
		seen.add(fileId);

		const file = filesById[fileId];
		if (file) {
			files.push(file);
		}
	};

	for (const fileId of fileOrder) {
		pushFile(fileId);
	}
	for (const fileId of Object.keys(filesById)) {
		pushFile(fileId);
	}

	return files;
};
