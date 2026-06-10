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
	TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ISessionService,
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
		for (const fileId of event.fileIds ?? snapshot.fileOrder) {
			const file = snapshot.filesById[fileId];
			if (!file) {
				continue;
			}

			const rawTableIds = event.rawTableIds?.length
				? event.rawTableIds
				: file.raw.tableOrder;
			for (const rawTableId of rawTableIds) {
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
					fileName: file.raw.fileName,
					rawTableId,
					rows,
					sourceRawTableVersion: file.rawTableVersionsById[rawTableId] ?? 0,
				});
				this.sessionService.commitRawTableAssessment(assessment);
			}
		}
	}
}

const hasCurrentAssessment = (
	file: FileRecord,
	rawTableId: string,
): boolean =>
	file.assessmentsByRawTableId[rawTableId]?.sourceRawTableVersion ===
		(file.rawTableVersionsById[rawTableId] ?? 0);

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

registerWorkbenchContribution2(
	AssessmentContributionId,
	AssessmentContribution,
	WorkbenchPhase.AfterRestored,
);
