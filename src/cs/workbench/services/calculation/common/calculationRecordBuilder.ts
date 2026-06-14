/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createCalculatedCurveRecordsByFile,
	createCalculatedCurveRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import {
	createCalculatedMetricRecordsByFile,
	createCalculatedMetricRecordsInputSignature,
} from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type {
	CurveRecord,
	FileId,
	FileRecord,
	MetricRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type CalculatedRecordsByFile = {
	readonly curvesByFileId: Record<FileId, CurveRecord[]>;
	readonly metricsByFileId: Record<FileId, MetricRecord[]>;
};

export const createCalculatedRecordsInputSignature = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): string => createCalculatedCurveRecordsInputSignature(
	filesById,
	fileOrder,
) + "\u001e" + createCalculatedMetricRecordsInputSignature(
	filesById,
	fileOrder,
);

export const createCalculatedRecordsByFile = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
): CalculatedRecordsByFile => ({
	curvesByFileId: createCalculatedCurveRecordsByFile(filesById, fileOrder),
	metricsByFileId: createCalculatedMetricRecordsByFile(filesById, fileOrder),
});
