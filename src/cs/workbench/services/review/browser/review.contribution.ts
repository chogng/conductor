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
	IRecipeService,
	type IRecipeService as IRecipeServiceType,
} from "src/cs/workbench/services/recipe/common/recipe";
import {
	IReviewService,
	ReviewContributionId,
	type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";
import {
	ISessionService,
	type SessionSnapshot,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	IUserTemplateService,
	type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export class ReviewContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IReviewService private readonly reviewService: IReviewServiceType,
		@IRecipeService private readonly recipeService: IRecipeServiceType,
		@IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
	) {
		super();

		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "tableModelChanged" || event.reason === "fileMetadataChanged") {
				this.enqueueChangedEvidence(event);
			}
		}));
		this._register(this.recipeService.onDidChangeRecipes(() => {
			this.enqueueCurrentEvidence();
		}));
		this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
			this.enqueueCurrentEvidence();
		}));
		this.enqueueCurrentEvidence();
	}

	public override dispose(): void {
		this.disposed = true;
		super.dispose();
	}

	private enqueueChangedEvidence(event: SessionChangeEvent): void {
		if (this.disposed) {
			return;
		}

		this.reviewService.enqueueForEvidence(
			getRawTableRefsForReviewEvent(
				event,
				this.sessionService.getSnapshot(),
			),
		);
	}

	private enqueueCurrentEvidence(): void {
		if (this.disposed) {
			return;
		}

		this.reviewService.enqueueAllCurrentEvidence();
	}
}

export const getRawTableRefsForReviewEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const refs = event.rawTableRefs?.length
		? event.rawTableRefs
		: getRawTableRefsFromAffectedFiles(event, snapshot);
	return filterEvidenceRefs(refs, snapshot);
};

const filterEvidenceRefs = (
	refs: readonly RawTableRef[],
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const file = snapshot.filesById[ref.fileId];
		if (!file?.raw.tablesById[ref.rawTableId] || !file.tableModelByRawTableId?.[ref.rawTableId]) {
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
	ReviewContributionId,
	ReviewContribution,
	WorkbenchPhase.AfterRestored,
);
