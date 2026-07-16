/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createCalculatedCurveRecordsForFile,
	createCalculatedCurveRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import {
	createCalculatedMetricRecordsForFile,
	createCalculatedMetricRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import type {
	CurveRecord,
	FileId,
	MetricRecord,
	SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
	CalculationFileRecord,
} from "src/cs/workbench/services/calculation/common/canonicalFileProjection";

export type CalculatedRecordsByFile = {
	readonly curvesByFileId: Record<FileId, CurveRecord[]>;
	readonly metricsByFileId: Record<FileId, MetricRecord[]>;
};

export type CalculatedCurveRecord =
	CalculatedRecordsByFile["curvesByFileId"][FileId][number];
export type CalculatedMetricRecord =
	CalculatedRecordsByFile["metricsByFileId"][FileId][number];

export const createCalculatedRecordsInputSignature = (
	filesById: Record<FileId, CalculationFileRecord>,
	fileOrder: readonly FileId[],
): string => createCalculatedCurveRecordsInputSignature(
	filesById,
	fileOrder,
) + "\u001e" + createCalculatedMetricRecordsInputSignature(
	filesById,
	fileOrder,
);

export const createCalculatedRecordsByFile = (
	filesById: Record<FileId, CalculationFileRecord>,
	fileOrder: readonly FileId[],
	analysisByFileId: Readonly<Record<FileId, CalculationAnalysisBySeriesId | undefined>> = {},
): CalculatedRecordsByFile => {
	const curvesByFileId: Record<FileId, CurveRecord[]> = {};
	const metricsByFileId: Record<FileId, MetricRecord[]> = {};
	for (const file of getOrderedFileRecords(filesById, fileOrder)) {
		const analysisBySeriesId = analysisByFileId[file.id];
		const curves = createCalculatedCurveRecordsForFile(
			file,
			analysisBySeriesId,
		);
		if (curves.length) {
			curvesByFileId[file.id] = curves;
		}

		const metrics = createCalculatedMetricRecordsForFile(file, {
			analysisBySeriesId,
			derivativePointsBySeriesId: createDerivativePointsBySeriesId(curves),
		});
		if (metrics.length) {
			metricsByFileId[file.id] = metrics;
		}
	}

	return {
		curvesByFileId,
		metricsByFileId,
	};
};

const createDerivativePointsBySeriesId = (
	curves: readonly CurveRecord[],
): Readonly<Record<SeriesId, CurveRecord["points"]>> => {
	const pointsBySeriesId: Record<SeriesId, CurveRecord["points"]> = {};
	for (const curve of curves) {
		if (curve.curveGeneration === "derived" && curve.curveFamily === "gm") {
			pointsBySeriesId[curve.seriesId] = curve.points;
		}
	}
	return pointsBySeriesId;
};

const getOrderedFileRecords = (
	filesById: Record<FileId, CalculationFileRecord>,
	fileOrder: readonly FileId[],
): CalculationFileRecord[] => {
	const seen = new Set<FileId>();
	const files: CalculationFileRecord[] = [];
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
