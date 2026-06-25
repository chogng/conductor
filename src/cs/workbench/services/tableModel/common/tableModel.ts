/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
	type ColumnProfile,
	type MeasurementColumnProfile,
} from "src/cs/workbench/services/tableModel/common/columnProfile";
import {
	createTableModelReasonDiagnosticCodes,
	createTableModelReasonDiagnostics,
	type TableModelDiagnostic,
} from "src/cs/workbench/services/tableModel/common/diagnostics";
import {
	detectLayoutCandidates,
	type LayoutCandidate,
} from "src/cs/workbench/services/tableModel/common/layoutCandidate";
import {
	createMeasurementBlockId,
	detectMeasurementBlocks,
} from "src/cs/workbench/services/tableModel/common/blockDetector";
import type {
	IvSweepMode,
	MeasurementBlockRecord,
	MeasurementFamily,
	MeasurementGroupRecord,
} from "src/cs/workbench/services/tableModel/common/measurement";
import {
	detectRawTableStructure,
	type RawTableStructure,
} from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import {
	createColumnSemanticCandidates,
	type ColumnSemanticCandidate,
} from "src/cs/workbench/services/tableModel/common/semanticCandidate";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import { findExactSchemaProfileMatch } from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import type {
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";

// Bump this when table-model heuristics change in a way that should invalidate
// stored TableModel records.
export const TABLE_MODEL_RULE_VERSION = 2;

export type TableModelRecord = {
	readonly tableModelRuleVersion: number;
	readonly schemaProfileVersion: number;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly sourceModelVersion?: number;
	readonly sourceRawTableVersion: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableModelDiagnostic[];
	readonly createdAt: number;
};

export const getTableModelRuleVersion = (
	record: {
		readonly tableModelRuleVersion?: number;
	},
): number =>
	normalizeRuleVersion(record.tableModelRuleVersion) ?? 0;

export interface TableModel {
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly sourceMetadata: TableModelSourceMetadata;
}

export type TableModelSourceMetadata = {
	readonly fileId: string;
	readonly rawTableId: string;
	readonly fileName?: string | null;
	readonly rowCount?: number;
	readonly columnCount?: number;
	readonly sourceModelVersion?: number;
	readonly sourceRawTableVersion: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
};

export type TableModelCreateInput =
	Omit<CreateTableModelInput, "rows"> & {
		readonly tableModelSeed: ImportTableModelSeed;
		readonly blocks?: readonly MeasurementBlockRecord[];
		readonly columnProfile?: MeasurementColumnProfile;
		readonly columnProfiles?: readonly ColumnProfile[];
		readonly layoutCandidates?: readonly LayoutCandidate[];
		readonly rows?: CreateTableModelInput["rows"];
		readonly schemaProfile?: SchemaProfile | null;
		readonly semanticCandidates?: readonly ColumnSemanticCandidate[];
		readonly structure?: RawTableStructure;
	};

export namespace TableModel {
	export const create = (
		input: TableModelCreateInput,
	): TableModelRecord => {
		const tableModelSeed = input.tableModelSeed;
		const columnCount = normalizePositiveCount(input.columnCount) ?? 0;
		const rowCount = normalizePositiveCount(input.rowCount) ?? 0;
		const schemaProfileVersion = normalizeSchemaProfileVersion(input.schemaProfileVersion);
		const diagnosticCodes = createTableModelReasonDiagnosticCodes(tableModelSeed.curveTypeReasons);
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
				tableModelSeed,
			});
		const columnProfile = input.columnProfile ??
			createMeasurementColumnProfile({
				columnProfiles,
				rows: input.rows ?? [],
				semanticCandidates,
				structure,
				tableModelSeed,
			});
		const tableModelConfidence = getTableModelConfidenceScore(tableModelSeed);
		const blocks = input.blocks ?? detectMeasurementBlocks({
			columnCount,
			columnProfile,
			diagnosticCodes,
			fileId: input.fileId,
			fileName: input.fileName,
			rawTableId: input.rawTableId,
			rowCount,
			structure,
			tableModelConfidence,
			tableModelSeed,
		});
		const diagnostics = createTableModelReasonDiagnostics({
			reasons: tableModelSeed.curveTypeReasons,
			relatedBlockId: blocks[0]?.id ?? createMeasurementBlockId(input.rawTableId, 0),
		});

		return {
			tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
			schemaProfileVersion,
			fileId: input.fileId,
			rawTableId: input.rawTableId,
			...(normalizeSourceModelVersion(input.sourceModelVersion) !== undefined
				? { sourceModelVersion: normalizeSourceModelVersion(input.sourceModelVersion) }
				: {}),
			sourceRawTableVersion: input.sourceRawTableVersion,
			...(normalizeSourceText(input.sourceUri) ? { sourceUri: normalizeSourceText(input.sourceUri) } : {}),
			...(normalizeSourceModelVersion(input.sourceVersion) !== undefined
				? { sourceVersion: normalizeSourceModelVersion(input.sourceVersion) }
				: {}),
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

	export const fromRecord = (
		record: TableModelRecord,
		sourceMetadata?: Partial<TableModelSourceMetadata>,
	): TableModel => ({
		structure: record.structure,
		columnProfiles: record.columnProfiles,
		layoutCandidates: record.layoutCandidates,
		semanticCandidates: record.semanticCandidates,
		blocks: record.blocks,
		sourceMetadata: {
			fileId: record.fileId,
			rawTableId: record.rawTableId,
			...(record.sourceModelVersion !== undefined ? { sourceModelVersion: record.sourceModelVersion } : {}),
			sourceRawTableVersion: record.sourceRawTableVersion,
			...(record.sourceUri ? { sourceUri: record.sourceUri } : {}),
			...(record.sourceVersion !== undefined ? { sourceVersion: record.sourceVersion } : {}),
			...sourceMetadata,
		},
	});
}

export const ITableModelProducerService = createDecorator<ITableModelProducerService>("tableModelProducerService");
export const ITableModelQueueService = createDecorator<ITableModelQueueService>("tableModelQueueService");
export const TableModelContributionId = "workbench.services.tableModel.lifecycle";

export type TableModelRows = readonly (readonly string[])[];

export type ImportTableModelSeedAxisRole = "vg" | "vd" | null;

export type ImportTableModelSeedAxisRoleSource =
	| "filename"
	| "hint"
	| "label"
	| "metadata"
	| "schemaProfile"
	| "shape"
	| null;

export type ImportTableModelSeed = {
	curveFamily: MeasurementFamily;
	curveType: string | null;
	curveTypeConfidence: "high" | "medium" | "low";
	curveTypeNeedsReview: boolean;
	curveTypeReasons: string[];
	ivMode?: IvSweepMode | null;
	xAxisRole: ImportTableModelSeedAxisRole;
	xAxisRoleSource: ImportTableModelSeedAxisRoleSource;
};

export type TableModelFileInput = {
	readonly name: string;
	slice(start?: number, end?: number): {
		text(): Promise<string>;
	};
};

export type CreateTableModelInput = {
	readonly columnCount?: number;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly rowCount?: number;
	readonly sourceModelVersion?: number;
	readonly sourceRawTableVersion: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
	readonly rows: TableModelRows;
	readonly fileName?: string | null;
	readonly schemaProfiles?: readonly SchemaProfile[];
	readonly schemaProfileVersion?: number;
};

export interface ITableModelProducerService {
	readonly _serviceBrand: undefined;

	createImportTableModelSeedFromFile(file: TableModelFileInput): Promise<ImportTableModelSeed>;
	createImportTableModelSeedFromRows(fileName: string, rows: TableModelRows): Promise<ImportTableModelSeed>;
	getOrCreate(input: CreateTableModelInput): Promise<TableModelRecord>;
}

export type TableModelQueuePriority = "visible" | "nearby" | "background";

// Conductor-specific service-local queue state for Explorer projections.
// This is not a canonical Session record.
export type TableModelRawTableQueueState = {
	readonly fileId: string;
	readonly priority: TableModelQueuePriority;
	readonly rawTableId: string;
	readonly sourceRawTableVersion: number;
	readonly state: "queued" | "running";
};

export type TableModelQueueSnapshot = {
	readonly rawTables: readonly TableModelRawTableQueueState[];
};

export interface ITableModelQueueService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTableModelQueueState: Event<void>;

	enqueueRawTables(refs: readonly RawTableRef[]): void;
	getQueueSnapshot(): TableModelQueueSnapshot;
	prioritizeRawTables(
		refs: readonly RawTableRef[],
		priority: TableModelQueuePriority,
	): void;
}

type TableModelRawTableSnapshot = {
	readonly filesById: Readonly<Record<string, {
		readonly id: string;
		readonly raw: {
			readonly tableOrder: readonly string[];
			readonly tablesById: Readonly<Record<string, unknown>>;
		};
	}>>;
};

export const getRawTableRefsForFileIds = (
	fileIds: readonly string[],
	snapshot: TableModelRawTableSnapshot,
): RawTableRef[] => {
	const refs: RawTableRef[] = [];
	const seenFileIds = new Set<string>();
	for (const fileId of fileIds) {
		const normalizedFileId = String(fileId ?? "").trim();
		if (!normalizedFileId || seenFileIds.has(normalizedFileId)) {
			continue;
		}
		seenFileIds.add(normalizedFileId);

		const file = snapshot.filesById[normalizedFileId];
		if (!file) {
			continue;
		}

		for (const rawTableId of file.raw.tableOrder) {
			if (file.raw.tablesById[rawTableId]) {
				refs.push({ fileId: file.id, rawTableId });
			}
		}
	}

	return uniqueRawTableRefs(refs);
};

const uniqueRawTableRefs = (
	refs: readonly RawTableRef[],
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const fileId = String(ref.fileId ?? "").trim();
		const rawTableId = String(ref.rawTableId ?? "").trim();
		const key = `${fileId}\u0000${rawTableId}`;
		if (!fileId || !rawTableId || seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push({ fileId, rawTableId });
	}

	return result;
};

const normalizeRuleVersion = (
	value: unknown,
): number | undefined => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : undefined;
};

const normalizeSourceModelVersion = (
	value: unknown,
): number | undefined => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : undefined;
};

const normalizeSourceText = (
	value: unknown,
): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};

export const getColumnCount = (rows: readonly (readonly unknown[])[]): number => {
	let columnCount = 0;
	for (const row of rows) {
		columnCount = Math.max(columnCount, row.length);
	}
	return columnCount;
};

export const getTableModelConfidenceScore = (
	tableModelSeed: ImportTableModelSeed,
): number => {
	const confidence = tableModelSeed.curveTypeConfidence;
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
