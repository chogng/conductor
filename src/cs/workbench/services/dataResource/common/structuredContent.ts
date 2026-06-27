/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createEmptyTableProjectionStructure } from "src/cs/workbench/services/table/common/tableProjection";
import {
	readTableModelContentRows,
	type TableModelContentSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type {
	CanonicalUnit,
	ColumnProfile,
	ColumnSemanticCandidate,
	LayoutCandidate,
	MeasurementBlockRecord,
	MeasurementColumnRef,
	MeasurementColumnRole,
	MeasurementFamily,
	MeasurementGroupRecord,
	SchemaFingerprint,
	TableProjectionDiagnostic,
	TableProjectionSourceRange,
	TableProjectionStructure,
} from "src/cs/workbench/services/table/common/tableProjection";

// TODO(conductor-architecture): Migration adapter.
// Structured content is a workbench domain resource shape. The aliases below
// isolate the current table-projection implementation while callers migrate to
// dataResource ownership.
export type StructuredCanonicalUnit = CanonicalUnit;
export type StructuredColumnProfile = ColumnProfile;
export type StructuredColumnSemanticCandidate = ColumnSemanticCandidate;
export type StructuredLayoutCandidate = LayoutCandidate;
export type StructuredMeasurementBlockRecord = MeasurementBlockRecord;
export type StructuredMeasurementColumnRef = MeasurementColumnRef;
export type StructuredMeasurementColumnRole = MeasurementColumnRole;
export type StructuredMeasurementFamily = MeasurementFamily;
export type StructuredMeasurementGroupRecord = MeasurementGroupRecord;
export type StructuredSchemaFingerprint = SchemaFingerprint;
export type StructuredContentDiagnostic = TableProjectionDiagnostic;
export type StructuredContentSourceRange = TableProjectionSourceRange;
export type StructuredContentStructure = TableProjectionStructure;
export type StructuredContentGridSnapshot = TableModelContentSnapshot;

export type StructuredContentEvidence = {
	readonly structure: StructuredContentStructure;
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly layoutCandidates: readonly StructuredLayoutCandidate[];
	readonly semanticCandidates: readonly StructuredColumnSemanticCandidate[];
	readonly groups: readonly StructuredMeasurementGroupRecord[];
	readonly blocks: readonly StructuredMeasurementBlockRecord[];
	readonly diagnostics: readonly StructuredContentDiagnostic[];
};

export const createEmptyStructuredContentStructure = (): StructuredContentStructure =>
	createEmptyTableProjectionStructure();

export const readStructuredContentRows = (
	content: StructuredContentGridSnapshot,
	startRow?: number,
	endRowExclusive?: number,
): readonly (readonly string[])[] =>
	readTableModelContentRows(content, startRow, endRowExclusive);
