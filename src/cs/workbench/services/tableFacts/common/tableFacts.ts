/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	IvSweepMode,
	MeasurementFamily,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
	RawTableFactsRecord,
} from "src/cs/workbench/services/template/common/tableFacts";

export type { RawTableFactsRecord };

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
