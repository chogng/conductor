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
	ReviewApplyContributionId,
	createReviewRecordSignature,
	type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";
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
	ISliceService,
	type SliceRequest,
	type ISliceService as ISliceServiceType,
} from "src/cs/workbench/services/slice/common/slice";

export class ReviewApplyContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@ISliceService private readonly sliceService: ISliceServiceType,
	) {
		super();
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "reviewChanged") {
				this.enqueueChangedReviews(event);
			}
		}));
		this.enqueueCurrentReviews();
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
	}

	private enqueueChangedReviews(event: SessionChangeEvent): void {
		if (this.disposed) {
			return;
		}

		this.sliceService.submit(getReviewApplyRequestsForEvent(
			event,
			this.sessionService.getSnapshot(),
		));
	}

	private enqueueCurrentReviews(): void {
		if (this.disposed) {
			return;
		}

		this.sliceService.submit(getReviewApplyRequestsForSnapshot(this.sessionService.getSnapshot()));
	}
}

export const getReviewApplyRequestsForEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): SliceRequest[] => getReviewApplyRefsForEvent(event, snapshot)
	.map(ref => createSliceRequestForReview(snapshot.filesById[ref.fileId], ref.rawTableId))
	.filter((request): request is SliceRequest => Boolean(request));

export const getReviewApplyRequestsForSnapshot = (
	snapshot: SessionSnapshot,
): SliceRequest[] => getReviewApplyRefsForSnapshot(snapshot)
	.map(ref => createSliceRequestForReview(snapshot.filesById[ref.fileId], ref.rawTableId))
	.filter((request): request is SliceRequest => Boolean(request));

export const getReviewApplyRefsForEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const eventRefs = event.rawTableRefs?.length
		? event.rawTableRefs
		: getRawTableRefsFromAffectedFiles(event, snapshot);
	return getReviewApplyRefs(eventRefs, snapshot);
};

export const getReviewApplyRefsForSnapshot = (
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
	return getReviewApplyRefs(refs, snapshot);
};

const getReviewApplyRefs = (
	refs: readonly RawTableRef[],
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const file = snapshot.filesById[ref.fileId];
		if (!file || !shouldApplyReview(file, ref.rawTableId)) {
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

const shouldApplyReview = (
	file: FileRecord,
	rawTableId: string,
): boolean => {
	const decision = file.rawTableReviewsByRawTableId?.[rawTableId]?.decision;
	return decision?.kind === "ready" &&
		decision.application.kind === "systemRecommended" &&
		!hasManualSliceRun(file, rawTableId);
};

const createSliceRequestForReview = (
	file: FileRecord | undefined,
	rawTableId: string,
): SliceRequest | null => {
	const review = file?.rawTableReviewsByRawTableId?.[rawTableId];
	if (!file || !isSystemRecommendedReview(review)) {
		return null;
	}
	const reviewedTemplate = review.decision.reviewedTemplate;
	const reviewSignature = createReviewRecordSignature(review);
	const requestSignature = createSliceRequestSignature({
		reviewSignature,
		sourceRawTableVersion: review.sourceRawTableVersion,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	return {
		id: `slice-request:${file.id}:${rawTableId}:${requestSignature}`,
		ref: {
			fileId: file.id,
			rawTableId,
		},
		sourceRawTableVersion: review.sourceRawTableVersion,
		reviewedTemplate,
		trigger: {
			kind: "reviewDecision",
			reviewSignature,
			submittedBy: "system",
		},
		requestSignature,
		createdAt: Date.now(),
	};
};

const isSystemRecommendedReview = (
	review: RawTableReviewRecord | undefined,
): review is RawTableReviewRecord & {
	readonly decision: Extract<RawTableReviewRecord["decision"], { readonly kind: "ready" }>;
} =>
	review?.decision.kind === "ready" &&
	review.decision.application.kind === "systemRecommended";

const createSliceRequestSignature = ({
	reviewSignature,
	sourceRawTableVersion,
	templateFingerprint,
}: {
	readonly reviewSignature: string;
	readonly sourceRawTableVersion: number;
	readonly templateFingerprint: string;
}): string => JSON.stringify({
	reviewSignature,
	sourceRawTableVersion,
	templateFingerprint,
});

const hasManualSliceRun = (
	file: FileRecord,
	rawTableId: string,
): boolean => {
	const run = file.latestSliceRunId ? file.sliceRunsById?.[file.latestSliceRunId] : undefined;
	if (!run || run.rawTableId !== rawTableId) {
		return false;
	}
	return run.mode === "manual";
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
	ReviewApplyContributionId,
	ReviewApplyContribution,
	WorkbenchPhase.AfterRestored,
);
