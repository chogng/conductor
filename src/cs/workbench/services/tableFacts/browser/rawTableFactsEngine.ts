/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateRawTableFactsInput,
	RawTableFactsRecord,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
} from "src/cs/workbench/services/tableFacts/common/columnProfile";
import { detectMeasurementBlocks } from "src/cs/workbench/services/tableFacts/common/blockDetector";
import { createTableFactsReasonDiagnosticCodes } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import { detectLayoutCandidates } from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import { detectRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import {
	findExactSchemaProfileMatch,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import {
	createRawTableFactsRecordFromImportSeed,
	getColumnCount,
	getTableFactsConfidenceScore,
	normalizePositiveCount,
} from "src/cs/workbench/services/tableFacts/common/tableFactsRecord";
import { createSchemaProfileBackedTableFactsSeed } from "src/cs/workbench/services/tableFacts/common/schemaProfileTableFacts";
import { createImportTableFactsSeedFromRows } from "src/cs/workbench/services/tableFacts/browser/importTableFactsSeed";

export class RawTableFactsEngine {
	public async assess(
		input: CreateRawTableFactsInput,
	): Promise<RawTableFactsRecord> {
		const tableFactsSeed = await createImportTableFactsSeedFromRows(
			input.fileName ?? input.rawTableId,
			input.rows,
		);
		const columnCount = normalizePositiveCount(input.columnCount) ?? getColumnCount(input.rows);
		const rowCount = normalizePositiveCount(input.rowCount) ?? input.rows.length;
		const structure = detectRawTableStructure(input.rows);
		const columnProfiles = createColumnProfiles({
			rows: input.rows,
			structure,
		});
		const layoutCandidates = detectLayoutCandidates({
			columnProfiles,
			structure,
		});
		const schemaProfileMatch = findExactSchemaProfileMatch({
			fingerprint: structure.fingerprint,
			profiles: input.schemaProfiles ?? [],
		});
		const effectiveTableFactsSeed = createSchemaProfileBackedTableFactsSeed({
			tableFactsSeed,
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
		});
		const semanticCandidates = createColumnSemanticCandidates({
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
			tableFactsSeed: effectiveTableFactsSeed,
		});
		const columnProfile = createMeasurementColumnProfile({
			columnProfiles,
			rows: input.rows,
			semanticCandidates,
			structure,
			tableFactsSeed: effectiveTableFactsSeed,
		});
		const tableFactsConfidence = getTableFactsConfidenceScore(effectiveTableFactsSeed);
		const diagnosticCodes = createTableFactsReasonDiagnosticCodes(effectiveTableFactsSeed.curveTypeReasons);
		const blocks = detectMeasurementBlocks({
			columnCount,
			columnProfile,
			diagnosticCodes,
			fileId: input.fileId,
			fileName: input.fileName,
			rawTableId: input.rawTableId,
			rowCount,
			structure,
			tableFactsConfidence,
			tableFactsSeed: effectiveTableFactsSeed,
		});
		return createRawTableFactsRecordFromImportSeed({
			...input,
			blocks,
			columnProfile,
			columnProfiles,
			columnCount,
			layoutCandidates,
			rowCount,
			rows: input.rows,
			schemaProfile: schemaProfileMatch?.profile ?? null,
			schemaProfileVersion: input.schemaProfileVersion,
			semanticCandidates,
			structure,
			tableFactsSeed: effectiveTableFactsSeed,
		});
	}
}
