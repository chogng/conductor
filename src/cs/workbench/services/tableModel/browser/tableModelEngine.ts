/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateTableModelInput,
	TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
	getColumnCount,
	getTableModelConfidenceScore,
	normalizePositiveCount,
	TableModel,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
} from "src/cs/workbench/services/tableModel/common/columnProfile";
import { detectMeasurementBlocks } from "src/cs/workbench/services/tableModel/common/blockDetector";
import { createTableModelReasonDiagnosticCodes } from "src/cs/workbench/services/tableModel/common/diagnostics";
import { detectLayoutCandidates } from "src/cs/workbench/services/tableModel/common/layoutCandidate";
import { detectRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/tableModel/common/semanticCandidate";
import {
	findExactSchemaProfileMatch,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import { createSchemaProfileBackedTableModelSeed } from "src/cs/workbench/services/tableModel/common/schemaProfileTableModel";
import { createImportTableModelSeedFromRows } from "src/cs/workbench/services/tableModel/browser/importTableModelSeed";

export class TableModelEngine {
	public async assess(
		input: CreateTableModelInput,
	): Promise<TableModelRecord> {
		const tableModelSeed = await createImportTableModelSeedFromRows(
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
		const effectiveTableModelSeed = createSchemaProfileBackedTableModelSeed({
			tableModelSeed,
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
		});
		const semanticCandidates = createColumnSemanticCandidates({
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
			tableModelSeed: effectiveTableModelSeed,
		});
		const columnProfile = createMeasurementColumnProfile({
			columnProfiles,
			rows: input.rows,
			semanticCandidates,
			structure,
			tableModelSeed: effectiveTableModelSeed,
		});
		const tableModelConfidence = getTableModelConfidenceScore(effectiveTableModelSeed);
		const diagnosticCodes = createTableModelReasonDiagnosticCodes(effectiveTableModelSeed.curveTypeReasons);
		const blocks = detectMeasurementBlocks({
			columnCount,
			columnProfile,
			diagnosticCodes,
			fileId: input.fileId,
			fileName: input.fileName,
			rawTableId: input.rawTableId,
			rowCount,
			structure,
			tableModelConfidence,
			tableModelSeed: effectiveTableModelSeed,
		});
		return TableModel.create({
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
			tableModelSeed: effectiveTableModelSeed,
		});
	}
}
