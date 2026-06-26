/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { URI } from "src/cs/base/common/uri";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
	IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	INotificationService,
	Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	getRawTableRefsForFileIds,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import {
	ISessionService,
	type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
	FileRecord,
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	createSliceUriResourceKey,
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceUriRequest,
	type SliceUriTarget,
} from "src/cs/workbench/services/slice/common/slice";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
	type ReviewedTemplate,
	type UriTableReview,
} from "src/cs/workbench/services/review/common/review";
import {
	IWorkbenchLayoutService,
	type IWorkbenchLayoutService as IWorkbenchLayoutServiceType,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
	ITemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import {
	isAutoTemplateId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import { createTemplateFromEditorRecord } from "src/cs/workbench/services/template/common/templateEditorAdapter";
import {
	validateTemplateForApply,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
	createInlineTemplateSelection,
	type TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

export type RunSliceWithTemplateCommandOptions = {
	readonly incremental?: boolean;
};

export const runSliceWithTemplateHandler = (
	accessor: ServicesAccessor,
	options: RunSliceWithTemplateCommandOptions = {},
): void => {
	const explorerService = accessor.get(IExplorerService);
	const notificationService = accessor.get(INotificationService);
	if (explorerService.hasPendingSourceFiles) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.importing", "Files are still importing. Try again after import finishes."),
			severity: Severity.Warning,
		});
		return;
	}

	const sessionService = accessor.get(ISessionService);
	const sliceService = accessor.get(ISliceService);
	const reviewService = accessor.get(IReviewService);
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const snapshot = sessionService.getSnapshot();
	const refs = getSliceCommandRawTableRefs(snapshot, Boolean(options.incremental));
	const uriTargets = getSliceCommandUriTargets(
		explorerService.getPaneInput()?.files ?? [],
		sliceService,
		Boolean(options.incremental),
	);

	const selection = createSliceCommandTemplateSelection(accessor);
	if (!selection) {
		return;
	}

	if (!refs.length && !uriTargets.length) {
		notificationService.notify({
			id: "slice.notification",
			message: options.incremental
				? localize("slice.runWithTemplate.noNewFiles", "No new files to slice.")
				: localize("slice.runWithTemplate.noRawTables", "No raw tables are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	if (refs.length) {
		runSliceRefsWithTemplate(sliceService, refs, selection);
		layoutService.navigateToView("chart");
	}
	if (uriTargets.length) {
		void runUriTargetsWithTemplate({
			layoutService,
			notificationService,
			reviewService,
			selection,
			sliceService,
			targets: uriTargets,
		});
	}
};

export const getSliceCommandRawTableRefs = (
	snapshot: SessionSnapshot,
	incremental: boolean,
): RawTableRef[] => {
	const fileIds = snapshot.fileOrder.filter(fileId => {
		const file = snapshot.filesById[fileId];
		return file && (!incremental || !hasAnySliceRun(file));
	});
	return getRawTableRefsForFileIds(fileIds, snapshot);
};

const createSliceCommandTemplateSelection = (
	accessor: ServicesAccessor,
): TemplateSelection | null => {
	const templateViewStateService = accessor.get(ITemplateViewStateService);
	const notificationService = accessor.get(INotificationService);
	const state = templateViewStateService.getState();
	if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
		return { kind: "auto" };
	}

	const validation = validateTemplateForApply(state.formState);
	if (!validation.ok || !validation.normalized) {
		notificationService.notify({
			id: "slice.notification",
			message: validation.message || localize("slice.runWithTemplate.invalidTemplate", "Invalid template configuration."),
			severity: Severity.Warning,
		});
		return null;
	}

	const template = createTemplateFromEditorRecord({
		...validation.normalized,
		id: state.selectedTemplateId,
	});
	if (!template) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.invalidTemplate", "Invalid template configuration."),
			severity: Severity.Warning,
		});
		return null;
	}

	return createInlineTemplateSelection(template);
};

const runSliceRefsWithTemplate = (
	sliceService: ISliceServiceType,
	refs: readonly RawTableRef[],
	selection: TemplateSelection,
): void => {
	if (selection.kind === "auto") {
		sliceService.enqueueAuto(refs);
		return;
	}

	for (const ref of refs) {
		sliceService.runWithTemplate({
			ref,
			selection,
		});
	}
};

const runUriTargetsWithTemplate = async ({
	layoutService,
	notificationService,
	reviewService,
	selection,
	sliceService,
	targets,
}: {
	readonly notificationService: Pick<INotificationService, "notify">;
	readonly layoutService: Pick<IWorkbenchLayoutServiceType, "navigateToView">;
	readonly reviewService: IReviewServiceType;
	readonly selection: TemplateSelection;
	readonly sliceService: ISliceServiceType;
	readonly targets: readonly SliceUriTarget[];
}): Promise<void> => {
	const requests: SliceUriRequest[] = [];
	for (const target of targets) {
		const review = await reviewService.reviewUriTable({
			resource: target.resource,
			sheetId: target.sheetId ?? null,
		});
		const reviewedTemplate = selection.kind === "auto"
			? getAutoReviewedTemplate(review)
			: await getManualReviewedTemplate(reviewService, review, selection);
		if (!review.tableModel || !reviewedTemplate) {
			continue;
		}

		requests.push(createSliceUriRequest({
			review,
			reviewedTemplate,
			selection,
			target,
		}));
	}

	if (!requests.length) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.noReviewedUriTables", "No reviewed URI tables are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	sliceService.submitUri(requests);
	layoutService.navigateToView("chart");
};

const getAutoReviewedTemplate = (
	review: UriTableReview,
): ReviewedTemplate | null =>
	review.result?.decision.kind === "ready"
		? review.result.decision.reviewedTemplate
		: null;

const getManualReviewedTemplate = async (
	reviewService: IReviewServiceType,
	review: UriTableReview,
	selection: TemplateSelection,
): Promise<ReviewedTemplate | null> => {
	const manualSelection = getManualReviewSelection(selection);
	if (!manualSelection) {
		return null;
	}

	const result = await reviewService.reviewUriManualTemplate({
		target: {
			resource: review.resource,
			sheetId: review.sheetId ?? null,
		},
		selection: manualSelection,
	});
	return result.kind === "ready" ? result.reviewedTemplate : null;
};

const getManualReviewSelection = (
	selection: TemplateSelection,
): Parameters<IReviewServiceType["reviewUriManualTemplate"]>[0]["selection"] | null => {
	if (selection.kind === "inline") {
		return {
			kind: "inline",
			template: selection.template,
		};
	}
	if (selection.kind === "saved") {
		return {
			kind: "savedTemplate",
			templateId: selection.templateId,
		};
	}
	return null;
};

const createSliceUriRequest = ({
	review,
	reviewedTemplate,
	selection,
	target,
}: {
	readonly review: UriTableReview;
	readonly reviewedTemplate: ReviewedTemplate;
	readonly selection: TemplateSelection;
	readonly target: SliceUriTarget;
}): SliceUriRequest => {
	const requestSignature = createUriSliceRequestSignature({
		reviewSignature: review.reviewSignature,
		sourceModelVersion: review.sourceModelVersion,
		sourceVersion: review.sourceVersion,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	const resourceKey = createSliceUriResourceKey(target);
	return {
		id: `slice-uri-request:${resourceKey}:${requestSignature}`,
		target,
		tableModel: review.tableModel!,
		reviewedTemplate,
		reviewSignature: review.reviewSignature,
		trigger: selection.kind === "auto"
			? {
				kind: "reviewDecision",
				reviewSignature: review.reviewSignature ?? requestSignature,
				submittedBy: "system",
			}
			: {
				kind: "userCommand",
				commandId: "workbench.slice.runWithTemplate",
				submittedBy: "user",
			},
		requestSignature,
		createdAt: Date.now(),
		rowCount: review.rowCount ?? 0,
		columnCount: review.columnCount ?? 0,
		sourceModelVersion: review.sourceModelVersion ?? 0,
		sourceVersion: review.sourceVersion ?? 0,
	};
};

const getSliceCommandUriTargets = (
	files: readonly ExplorerFileEntry[],
	sliceService: ISliceServiceType,
	incremental: boolean,
): SliceUriTarget[] => {
	const state = sliceService.getState();
	const result: SliceUriTarget[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const target = createSliceUriTarget(file);
		if (!target) {
			continue;
		}
		const resourceKey = createSliceUriResourceKey(target);
		if (incremental && state.uriResultsByResourceKey.has(resourceKey)) {
			continue;
		}
		if (seen.has(resourceKey)) {
			continue;
		}

		seen.add(resourceKey);
		result.push(target);
	}
	return result;
};

const createSliceUriTarget = (
	file: ExplorerFileEntry,
): SliceUriTarget | null => {
	const resource = file.resource ? URI.revive(file.resource) : null;
	if (!resource || file.sourceStatus) {
		return null;
	}

	const sheetId = normalizeText(file.sheetId) || null;
	return {
		resource,
		sheetId,
	};
};

const hasAnySliceRun = (file: FileRecord): boolean =>
	Boolean(file.latestSliceRunId) ||
	Object.keys(file.sliceRunsById ?? {}).length > 0;

const createUriSliceRequestSignature = ({
	reviewSignature,
	sourceModelVersion,
	sourceVersion,
	templateFingerprint,
}: {
	readonly reviewSignature?: string;
	readonly sourceModelVersion?: number;
	readonly sourceVersion?: number;
	readonly templateFingerprint: string;
}): string => JSON.stringify({
	reviewSignature: normalizeText(reviewSignature),
	sourceModelVersion: Math.max(0, Math.floor(Number(sourceModelVersion) || 0)),
	sourceVersion: Math.max(0, Math.floor(Number(sourceVersion) || 0)),
	templateFingerprint,
});

const normalizeText = (value: unknown): string => String(value ?? "").trim();
