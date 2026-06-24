/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	TABLE_FACTS_RULE_VERSION,
	type RawTableFactsRecord,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type {
	CreateRawTableFactsInput,
	ImportTableFactsSeed,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	createMeasurementBlockId,
	detectMeasurementBlocks,
} from "src/cs/workbench/services/tableFacts/common/blockDetector";
import {
	detectLayoutCandidates,
	type LayoutCandidate,
} from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import {
	createTableFactsReasonDiagnosticCodes,
	createTableFactsReasonDiagnostics,
} from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type {
	MeasurementBlockRecord,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
	type ColumnProfile,
	type MeasurementColumnProfile,
} from "src/cs/workbench/services/tableFacts/common/columnProfile";
import {
	detectRawTableStructure,
	type RawTableStructure,
} from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import { findExactSchemaProfileMatch } from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";

export type CreateRawTableFactsRecordFromImportSeedInput =
	Omit<CreateRawTableFactsInput, "rows"> & {
		readonly tableFactsSeed: ImportTableFactsSeed;
		readonly blocks?: readonly MeasurementBlockRecord[];
		readonly columnProfile?: MeasurementColumnProfile;
		readonly columnProfiles?: readonly ColumnProfile[];
		readonly layoutCandidates?: readonly LayoutCandidate[];
		readonly rows?: CreateRawTableFactsInput["rows"];
		readonly schemaProfile?: SchemaProfile | null;
		readonly semanticCandidates?: readonly ColumnSemanticCandidate[];
		readonly structure?: RawTableStructure;
	};

export const createRawTableFactsRecordFromImportSeed = (
	input: CreateRawTableFactsRecordFromImportSeedInput,
): RawTableFactsRecord => {
	const tableFactsSeed = input.tableFactsSeed;
	const columnCount = normalizePositiveCount(input.columnCount) ?? 0;
	const rowCount = normalizePositiveCount(input.rowCount) ?? 0;
	const schemaProfileVersion = normalizeSchemaProfileVersion(input.schemaProfileVersion);
	const diagnosticCodes = createTableFactsReasonDiagnosticCodes(tableFactsSeed.curveTypeReasons);
	const structure = input.structure ?? detectRawTableStructure(input.rows ?? []);
	const schemaProfile = input.schemaProfile ??
		findExactSchemaProfileMatch({
			fingerprint: structure.fingerprint,
			profiles: input.schemaProfiles ?? [],
		})?.profile ??
		null;
	const columnProfiles = input.columnProfiles ??
		createColumnProfiles({
			rows: input.rows ?? [],
			structure,
		});
	const layoutCandidates = input.layoutCandidates ??
		detectLayoutCandidates({
			columnProfiles,
			structure,
		});
	const semanticCandidates = input.semanticCandidates ??
		createColumnSemanticCandidates({
			columnProfiles,
			schemaProfile,
			tableFactsSeed,
		});
	const columnProfile = input.columnProfile ??
		createMeasurementColumnProfile({
			columnProfiles,
			rows: input.rows ?? [],
			semanticCandidates,
			structure,
			tableFactsSeed,
		});
	const tableFactsConfidence = getTableFactsConfidenceScore(tableFactsSeed);
	const blocks = input.blocks ?? detectMeasurementBlocks({
		columnCount,
		columnProfile,
		diagnosticCodes,
		fileId: input.fileId,
		fileName: input.fileName,
		rawTableId: input.rawTableId,
		rowCount,
		structure,
		tableFactsConfidence,
		tableFactsSeed,
	});
	const diagnostics = createTableFactsReasonDiagnostics({
		reasons: tableFactsSeed.curveTypeReasons,
		relatedBlockId: blocks[0]?.id ?? createMeasurementBlockId(input.rawTableId, 0),
	});

	return {
		tableFactsRuleVersion: TABLE_FACTS_RULE_VERSION,
		schemaProfileVersion,
		fileId: input.fileId,
		rawTableId: input.rawTableId,
		sourceRawTableVersion: input.sourceRawTableVersion,
		structure,
		columnProfiles,
		layoutCandidates,
		semanticCandidates,
		groups: [],
		blocks,
		diagnostics,
		createdAt: Date.now(),
	};
};

export const getColumnCount = (rows: readonly (readonly unknown[])[]): number => {
	let columnCount = 0;
	for (const row of rows) {
		columnCount = Math.max(columnCount, row.length);
	}
	return columnCount;
};

export const getTableFactsConfidenceScore = (
	tableFactsSeed: ImportTableFactsSeed,
): number => {
	const confidence = tableFactsSeed.curveTypeConfidence;
	switch (confidence) {
		case "high":
			return 0.9;
		case "medium":
			return 0.6;
		case "low":
			return 0.3;
	}

	const exhaustive: never = confidence;
	return exhaustive;
};

export const normalizePositiveCount = (value: unknown): number | undefined => {
	const count = Math.floor(Number(value));
	return Number.isFinite(count) && count > 0 ? count : undefined;
};

export const normalizeSchemaProfileVersion = (value: unknown): number => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : 0;
};
