/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import {
	ISessionService,
	type SessionSnapshot,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
	FileRecord,
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	AutoSliceContributionId,
	ISliceService,
	type ISliceService as ISliceServiceType,
} from "src/cs/workbench/services/slice/common/slice";
import { createSliceAssessmentSignature } from "src/cs/workbench/services/slice/common/slicePlanner";

export class AutoSliceContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "assessmentChanged") {
				this.enqueueChangedAssessments(event);
			}
		}));
		this.enqueueCurrentAssessments();
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
	}

	private enqueueChangedAssessments(event: SessionChangeEvent): void {
		if (this.disposed) {
			return;
		}

		this.sliceService.enqueueAuto(getAutoSliceRefsForEvent(
			event,
			this.sessionService.getSnapshot(),
		));
	}

	private enqueueCurrentAssessments(): void {
		if (this.disposed) {
			return;
		}

		this.sliceService.enqueueAuto(getAutoSliceRefsForSnapshot(this.sessionService.getSnapshot()));
	}
}

export const getAutoSliceRefsForEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const eventRefs = event.rawTableRefs?.length
		? event.rawTableRefs
		: getRawTableRefsFromAffectedFiles(event, snapshot);
	return getAutoSliceRefs(eventRefs, snapshot);
};

export const getAutoSliceRefsForSnapshot = (
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const refs: RawTableRef[] = [];
	for (const fileId of snapshot.fileOrder) {
		const file = snapshot.filesById[fileId];
		if (!file) {
			continue;
		}
		for (const rawTableId of file.raw.tableOrder) {
			refs.push({ fileId, rawTableId });
		}
	}
	return getAutoSliceRefs(refs, snapshot);
};

const getAutoSliceRefs = (
	refs: readonly RawTableRef[],
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const file = snapshot.filesById[ref.fileId];
		const assessment = file?.assessmentsByRawTableId[ref.rawTableId];
		if (!file || !assessment || !shouldAutoSliceAssessment(file, ref.rawTableId, assessment)) {
			continue;
		}
		const key = `${ref.fileId}\u0000${ref.rawTableId}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(ref);
	}
	return result;
};

const shouldAutoSliceAssessment = (
	file: FileRecord,
	rawTableId: string,
	assessment: RawTableAssessmentRecord,
): boolean =>
	assessment.decision.autoApplyAllowed === true &&
	Boolean(assessment.selectedTemplate) &&
	!hasBlockingSliceRun(file, rawTableId, assessment);

const hasBlockingSliceRun = (
	file: FileRecord,
	rawTableId: string,
	assessment: RawTableAssessmentRecord,
): boolean => {
	const run = file.latestSliceRunId ? file.sliceRunsById?.[file.latestSliceRunId] : undefined;
	if (!run || run.rawTableId !== rawTableId) {
		return false;
	}
	if (run.mode === "manual") {
		return true;
	}
	if (run.mode !== "auto") {
		return false;
	}

	return run.sourceRawTableVersion === assessment.sourceRawTableVersion &&
		run.sourceAssessmentSignature === createSliceAssessmentSignature(assessment) &&
		run.templateFingerprint === assessment.selectedTemplate?.templateFingerprint &&
		run.errors.length === 0;
};

const getRawTableRefsFromAffectedFiles = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
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
				refs.push({ fileId, rawTableId });
			}
		}
	}
	return refs;
};

registerWorkbenchContribution2(
	AutoSliceContributionId,
	AutoSliceContribution,
	WorkbenchPhase.AfterRestored,
);
