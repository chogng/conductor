/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CurveKey,
	FileId,
	MetricKey,
	RawTableRef,
	SheetId,
	SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";

export type SessionChangeReason =
	| "rawTablesChanged"
	| "tableFactsChanged"
	| "reviewChanged"
	| "sliceRunChanged"
	| "curvesChanged"
	| "metricsChanged"
	| "calculatedRecordsChanged"
	| "metricInputsChanged"
	| "fileMetadataChanged"
	| "filesRemoved"
	| "sessionCleared";

export type SessionAffectedRecords = {
	readonly fileIds?: readonly FileId[];
	readonly rawTableIds?: readonly SheetId[];
	readonly rawTableRefs?: readonly RawTableRef[];
	readonly seriesIds?: readonly SeriesId[];
	readonly curveKeys?: readonly CurveKey[];
	readonly metricKeys?: readonly MetricKey[];
};

export type SessionChangeEvent = SessionAffectedRecords & {
	readonly reason: SessionChangeReason;
	readonly sessionVersion: number;
};

export const createSessionChangeEvent = (
	reason: SessionChangeReason,
	sessionVersion: number,
	affected: SessionAffectedRecords = {},
): SessionChangeEvent => ({
	reason,
	sessionVersion,
	...getDefinedAffectedRecords(affected),
});

const getDefinedAffectedRecords = (
	affected: SessionAffectedRecords,
): SessionAffectedRecords => ({
	...(affected.fileIds?.length ? { fileIds: affected.fileIds } : {}),
	...(affected.rawTableIds?.length ? { rawTableIds: affected.rawTableIds } : {}),
	...(affected.rawTableRefs?.length ? { rawTableRefs: affected.rawTableRefs } : {}),
	...(affected.seriesIds?.length ? { seriesIds: affected.seriesIds } : {}),
	...(affected.curveKeys?.length ? { curveKeys: affected.curveKeys } : {}),
	...(affected.metricKeys?.length ? { metricKeys: affected.metricKeys } : {}),
});
