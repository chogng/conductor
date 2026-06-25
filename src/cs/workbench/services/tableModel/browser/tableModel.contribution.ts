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
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class TableModelContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@ITableModelQueueService private readonly tableModelQueueService: ITableModelQueueServiceType,
	) {
		super();

		this._register(this.sessionService.onDidChangeSession(event => {
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

		const snapshot = this.sessionService.getSnapshot();
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

		const snapshot = this.sessionService.getSnapshot();
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
