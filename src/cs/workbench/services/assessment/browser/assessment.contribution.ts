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
	IRawTableFactsQueueService,
	RawTableFactsContributionId,
	type IRawTableFactsQueueService as IRawTableFactsQueueServiceType,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	getRawTableRefsForTableFactsEvent,
} from "src/cs/workbench/services/assessment/browser/assessmentQueueService";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class RawTableFactsContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IRawTableFactsQueueService private readonly rawTableFactsQueueService: IRawTableFactsQueueServiceType,
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
		this.rawTableFactsQueueService.enqueueRawTables(getRawTableRefsForTableFactsEvent(
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
		this.rawTableFactsQueueService.enqueueRawTables(getRawTableRefsForTableFactsEvent(
			undefined,
			undefined,
			undefined,
			snapshot,
		));
	}
}

export { RawTableFactsContribution as AssessmentContribution };

registerWorkbenchContribution2(
	RawTableFactsContributionId,
	RawTableFactsContribution,
	WorkbenchPhase.AfterRestored,
);
