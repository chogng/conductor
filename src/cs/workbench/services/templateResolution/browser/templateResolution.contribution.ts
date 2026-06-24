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
	ISessionService,
	type ISessionService as ISessionServiceType,
	type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
	ITemplateResolutionService,
	TemplateResolutionContributionId,
	type ITemplateResolutionService as ITemplateResolutionServiceType,
} from "src/cs/workbench/services/templateResolution/common/templateResolution";
import {
	IUserTemplateService,
	type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export class TemplateResolutionContribution extends Disposable implements IWorkbenchContribution {
	private disposed = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@ITemplateResolutionService private readonly templateResolutionService: ITemplateResolutionServiceType,
		@IRecipeService private readonly recipeService: IRecipeServiceType,
		@IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
	) {
		super();

		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "assessmentChanged" || event.reason === "fileMetadataChanged") {
				this.enqueueChangedAssessments(event);
			}
		}));
		this._register(this.recipeService.onDidChangeRecipes(() => {
			this.enqueueCurrentAssessments();
		}));
		this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
			this.enqueueCurrentAssessments();
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

		this.templateResolutionService.enqueueForAssessments(
			getRawTableRefsForTemplateResolutionEvent(
				event,
				this.sessionService.getSnapshot(),
			),
		);
	}

	private enqueueCurrentAssessments(): void {
		if (this.disposed) {
			return;
		}

		this.templateResolutionService.enqueueAllCurrentAssessments();
	}
}

export const getRawTableRefsForTemplateResolutionEvent = (
	event: SessionChangeEvent,
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const refs = event.rawTableRefs?.length
		? event.rawTableRefs
		: getRawTableRefsFromAffectedFiles(event, snapshot);
	return filterAssessmentRefs(refs, snapshot);
};

const filterAssessmentRefs = (
	refs: readonly RawTableRef[],
	snapshot: SessionSnapshot,
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const file = snapshot.filesById[ref.fileId];
		if (!file?.raw.tablesById[ref.rawTableId] || !file.assessmentsByRawTableId?.[ref.rawTableId]) {
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
	TemplateResolutionContributionId,
	TemplateResolutionContribution,
	WorkbenchPhase.AfterRestored,
);
