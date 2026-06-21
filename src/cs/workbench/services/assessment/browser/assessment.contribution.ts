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
	IAssessmentQueueService,
	type IAssessmentQueueService as IAssessmentQueueServiceType,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
	getRawTableRefsForAssessmentEvent,
} from "src/cs/workbench/services/assessment/browser/assessmentQueueService";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";

export class AssessmentContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IAssessmentQueueService private readonly assessmentQueueService: IAssessmentQueueServiceType,
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
		this.assessmentQueueService.enqueueRawTables(getRawTableRefsForAssessmentEvent(
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
		this.assessmentQueueService.enqueueRawTables(getRawTableRefsForAssessmentEvent(
			undefined,
			undefined,
			undefined,
			snapshot,
		));
	}
}

registerWorkbenchContribution2(
	AssessmentContributionId,
	AssessmentContribution,
	WorkbenchPhase.AfterRestored,
);
