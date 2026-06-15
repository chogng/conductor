/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	AssessmentContributionId,
	IAssessmentService,
	type IAssessmentService as IAssessmentServiceType,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
	IRawTableRowsReaderService,
	type IRawTableRowsReaderService as IRawTableRowsReaderServiceType,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type {
	FileRecord,
	RawTableRef,
	TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ISessionService,
	type SessionSnapshot,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class AssessmentContribution extends Disposable implements IWorkbenchContribution {
	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IAssessmentService private readonly assessmentService: IAssessmentServiceType,
		@IRawTableRowsReaderService private readonly rawTableRowsReaderService: IRawTableRowsReaderServiceType,
	) {
		super();

		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "rawTablesChanged") {
				void this.assessChangedRawTables(event);
			}
		}));
	}

	private async assessChangedRawTables(event: SessionChangeEvent): Promise<void> {
		const snapshot = this.sessionService.getSnapshot();
		for (const ref of getRawTableRefsForEvent(event, snapshot)) {
			const file = snapshot.filesById[ref.fileId];
			if (!file) {
				continue;
			}

			const rawTableId = ref.rawTableId;
			const table = file.raw.tablesById[rawTableId];
			if (!table || hasCurrentAssessment(file, rawTableId)) {
				continue;
			}

			const rows = await readRowsForAssessment(file, table, this.rawTableRowsReaderService);
			if (!rows) {
				continue;
			}

			const assessment = await this.assessmentService.assessRawTable({
				fileId: file.id,
				fileName: getAssessmentSourceName(file),
				rawTableId,
				rows,
				sourceRawTableVersion: file.rawTableVersionsById[rawTableId] ?? 0,
			});
			this.sessionService.commitRawTableAssessment(assessment);
		}
	}
}

const hasCurrentAssessment = (
	file: FileRecord,
	rawTableId: string,
): boolean =>
	file.assessmentsByRawTableId[rawTableId]?.sourceRawTableVersion ===
		(file.rawTableVersionsById[rawTableId] ?? 0);

const getRawTableRefsForEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	if (event.rawTableRefs?.length) {
		return uniqueRawTableRefs(event.rawTableRefs);
	}

	const refs: RawTableRef[] = [];
	const fileIds = event.fileIds?.length ? event.fileIds : snapshot.fileOrder;
	for (const fileId of fileIds) {
		const file = snapshot.filesById[fileId];
		if (!file) {
			continue;
		}

		const rawTableIds = event.rawTableIds?.length
			? event.rawTableIds
			: file.raw.tableOrder;
		for (const rawTableId of rawTableIds) {
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

const readRowsForAssessment = (
	file: FileRecord,
	table: TableRecord,
	rawTableRowsReaderService: IRawTableRowsReaderServiceType,
) => rawTableRowsReaderService.readRawTableRows({
	fallbackFile: file.raw.file,
	fileName: file.raw.fileName,
	lastModified: file.raw.lastModified,
	rowStore: table.rowStore ?? null,
});

const getAssessmentSourceName = (
	file: FileRecord,
): string => normalizeSourceName(file.raw.relativePath) ??
	normalizeSourceName(file.raw.filePath) ??
	file.raw.fileName;

const normalizeSourceName = (
	value: unknown,
): string | null => {
	const normalized = String(value ?? "").trim();
	return normalized || null;
};

registerWorkbenchContribution2(
	AssessmentContributionId,
	AssessmentContribution,
	WorkbenchPhase.AfterRestored,
);
