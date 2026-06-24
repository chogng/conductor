/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ColumnProfile } from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type { TableFactsDiagnostic } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type { LayoutCandidate } from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import type {
	IvSweepMode,
	MeasurementBlockRecord,
	MeasurementFamily,
	MeasurementGroupRecord,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type { RawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";

// Bump this when table-fact heuristics change in a way that should invalidate
// stored raw table fact records.
export const TABLE_FACTS_RULE_VERSION = 2;

export type RawTableFactsRecord = {
	readonly tableFactsRuleVersion: number;
	readonly schemaProfileVersion: number;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly sourceRawTableVersion: number;
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableFactsDiagnostic[];
	readonly createdAt: number;
};

export const getRawTableFactsRuleVersion = (
	record: {
		readonly tableFactsRuleVersion?: number;
	},
): number =>
	normalizeRuleVersion(record.tableFactsRuleVersion) ?? 0;

export type RawTableFacts = {
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly sourceMetadata: RawTableFactsSourceMetadata;
};

export type RawTableFactsSourceMetadata = {
	readonly fileId: string;
	readonly rawTableId: string;
	readonly fileName?: string | null;
	readonly rowCount?: number;
	readonly columnCount?: number;
	readonly sourceRawTableVersion: number;
};

export const createRawTableFactsFromRecord = (
	record: RawTableFactsRecord,
	sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts => ({
	structure: record.structure,
	columnProfiles: record.columnProfiles,
	layoutCandidates: record.layoutCandidates,
	semanticCandidates: record.semanticCandidates,
	blocks: record.blocks,
	sourceMetadata: {
		fileId: record.fileId,
		rawTableId: record.rawTableId,
		sourceRawTableVersion: record.sourceRawTableVersion,
		...sourceMetadata,
	},
});

export const IRawTableFactsService = createDecorator<IRawTableFactsService>("rawTableFactsService");
export const IRawTableFactsQueueService = createDecorator<IRawTableFactsQueueService>("rawTableFactsQueueService");
export const RawTableFactsContributionId = "workbench.services.rawTableFacts.lifecycle";

export type RawTableFactsRows = readonly (readonly string[])[];

export type ImportTableFactsSeedAxisRole = "vg" | "vd" | null;

export type ImportTableFactsSeedAxisRoleSource =
	| "filename"
	| "hint"
	| "label"
	| "metadata"
	| "schemaProfile"
	| "shape"
	| null;

export type ImportTableFactsSeed = {
	curveFamily: MeasurementFamily;
	curveType: string | null;
	curveTypeConfidence: "high" | "medium" | "low";
	curveTypeNeedsReview: boolean;
	curveTypeReasons: string[];
	ivMode?: IvSweepMode | null;
	xAxisRole: ImportTableFactsSeedAxisRole;
	xAxisRoleSource: ImportTableFactsSeedAxisRoleSource;
};

export type RawTableFactsFileInput = {
	readonly name: string;
	slice(start?: number, end?: number): {
		text(): Promise<string>;
	};
};

export type CreateRawTableFactsInput = {
	readonly columnCount?: number;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly rowCount?: number;
	readonly sourceRawTableVersion: number;
	readonly rows: RawTableFactsRows;
	readonly fileName?: string | null;
	readonly schemaProfiles?: readonly SchemaProfile[];
	readonly schemaProfileVersion?: number;
};

export interface IRawTableFactsService {
	readonly _serviceBrand: undefined;

	createImportTableFactsSeedFromFile(file: RawTableFactsFileInput): Promise<ImportTableFactsSeed>;
	createImportTableFactsSeedFromRows(fileName: string, rows: RawTableFactsRows): Promise<ImportTableFactsSeed>;
	createRawTableFacts(input: CreateRawTableFactsInput): Promise<RawTableFactsRecord>;
}

export type RawTableFactsQueuePriority = "visible" | "nearby" | "background";

// Conductor-specific service-local queue state for Explorer projections.
// This is not a canonical Session record.
export type RawTableFactsRawTableQueueState = {
	readonly fileId: string;
	readonly priority: RawTableFactsQueuePriority;
	readonly rawTableId: string;
	readonly sourceRawTableVersion: number;
	readonly state: "queued" | "running";
};

export type RawTableFactsQueueSnapshot = {
	readonly rawTables: readonly RawTableFactsRawTableQueueState[];
};

export interface IRawTableFactsQueueService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRawTableFactsQueueState: Event<void>;

	enqueueRawTables(refs: readonly RawTableRef[]): void;
	getQueueSnapshot(): RawTableFactsQueueSnapshot;
	prioritizeRawTables(
		refs: readonly RawTableRef[],
		priority: RawTableFactsQueuePriority,
	): void;
}

type RawTableFactsRawTableSnapshot = {
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
	snapshot: RawTableFactsRawTableSnapshot,
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
