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
	ITableModelQueueService,
	TableModelContributionId,
	type ITableModelQueueService as ITableModelQueueServiceType,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
	getRawTableRefsForTableModelEvent,
} from "src/cs/workbench/services/tableModel/browser/tableModelQueueService";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ITableFileService,
	type ITableFileService as ITableFileServiceType,
} from "src/cs/workbench/services/tablefile/common/tableFile";

export class TableModelContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ITableFileService private readonly tableFileService: ITableFileServiceType,
		@ITableModelQueueService private readonly tableModelQueueService: ITableModelQueueServiceType,
	) {
		super();

		this._register(this.tableFileService.onDidChangeTableFiles(event => {
			if (event.reason === "rawTablesChanged") {
				this.enqueueChangedRawTables(event);
			}
		}));
		this.enqueueCurrentRawTables();
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
	}

	private enqueueChangedRawTables(event: SessionChangeEvent): void {
		if (this.disposed) {
			return;
		}

		const snapshot = this.tableFileService.getSnapshot();
		this.tableModelQueueService.enqueueRawTables(getRawTableRefsForTableModelEvent(
			event.rawTableRefs,
			event.fileIds,
			event.rawTableIds,
			snapshot,
		));
	}

	private enqueueCurrentRawTables(): void {
		if (this.disposed) {
			return;
		}

		const snapshot = this.tableFileService.getSnapshot();
		this.tableModelQueueService.enqueueRawTables(getRawTableRefsForTableModelEvent(
			undefined,
			undefined,
			undefined,
			snapshot,
		));
	}
}

registerWorkbenchContribution2(
	TableModelContributionId,
	TableModelContribution,
	WorkbenchPhase.AfterRestored,
);
