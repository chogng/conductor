/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { URI } from "src/cs/base/common/uri";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	INotificationService,
	Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceUriRequest,
	type SliceUriTarget,
} from "src/cs/workbench/services/slice/common/slice";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
	type ManualTemplateSelection,
	type ReviewedTemplateConfirmationReason,
	type UriReviewExecution,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import {
	IWorkbenchLayoutService,
	type IWorkbenchLayoutService as IWorkbenchLayoutServiceType,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
	ITemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import {
	createTemplateSelection,
	isAutoTemplateId,
	type TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
	IUserTemplateService,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import {
	createSliceSourceContentSignature,
} from "src/cs/workbench/services/slice/common/slicePlanner";

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

	const sliceService = accessor.get(ISliceService);
	const reviewService = accessor.get(IReviewService);
	const layoutService = accessor.get(IWorkbenchLayoutService);
	const uriTargets = getSliceCommandUriTargets(
		explorerService.files,
		sliceService,
		Boolean(options.incremental),
	);

	const selection = createSliceCommandTemplateSelection(accessor);
	if (!selection) {
		return;
	}

	if (!uriTargets.length) {
		notificationService.notify({
			id: "slice.notification",
			message: options.incremental
				? localize("slice.runWithTemplate.noNewUriTables", "No new table resources to slice.")
				: localize("slice.runWithTemplate.noUriTables", "No table resources are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	void runUriTargetsWithTemplate({
		layoutService,
		notificationService,
		reviewService,
		selection,
		sliceService,
		targets: uriTargets,
	});
};

const createSliceCommandTemplateSelection = (
	accessor: ServicesAccessor,
): TemplateSelection | null => {
	const templateViewStateService = accessor.get(ITemplateViewStateService);
	const notificationService = accessor.get(INotificationService);
	const userTemplateService = accessor.get(IUserTemplateService);
	const state = templateViewStateService.getState();
	if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
		return { kind: "auto" };
	}

	const templateId = String(state.selectedTemplateId).trim();
	if (state.mode === "editor") {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.saveTemplateBeforeRun", "Save the selected template before slicing."),
			severity: Severity.Warning,
		});
		return null;
	}

	if (!userTemplateService.getTemplate(templateId)) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.templateNotFound", "The selected template could not be found."),
			severity: Severity.Warning,
		});
		return null;
	}

	return createTemplateSelection(templateId);
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
		const reviewExecution = await reviewService.reviewUriForExecution({
			resource: target.resource,
			sheetId: target.sheetId ?? null,
		});
		if (!reviewExecution) {
			continue;
		}

		const reviewedTemplate = selection.kind === "auto"
			? reviewExecution.systemRecommendedReviewedTemplate ?? null
			: await getManualReviewedTemplate(reviewService, reviewExecution, selection);
		if (!reviewedTemplate) {
			continue;
		}

		const request = createSliceUriRequest({
			review: reviewExecution,
			reviewedTemplate,
			selection,
			target,
		});
		if (request) {
			await confirmManualReviewedTemplate({
				review: reviewExecution,
				reviewedTemplate,
				reviewService,
				selection,
			});
			requests.push(request);
		}
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

const getManualReviewedTemplate = async (
	reviewService: IReviewServiceType,
	review: UriReviewExecution,
	selection: TemplateSelection,
): Promise<ReviewedTemplate | null> => {
	const manualSelection = getManualReviewSelection(selection);
	if (!manualSelection) {
		return null;
	}

	const result = await reviewService.reviewUriManualTemplate({
		target: {
			resource: review.resource,
			...(review.contentHash ? { contentHash: review.contentHash } : {}),
			sheetId: review.sheetId ?? null,
		},
		selection: manualSelection,
	});
	return result.kind === "ready" ? result.reviewedTemplate : null;
};

const confirmManualReviewedTemplate = async ({
	review,
	reviewedTemplate,
	reviewService,
	selection,
}: {
	readonly review: UriReviewExecution;
	readonly reviewedTemplate: ReviewedTemplate;
	readonly reviewService: IReviewServiceType;
	readonly selection: TemplateSelection;
}): Promise<void> => {
	const reason = getReviewedTemplateConfirmationReason(selection);
	if (!reason) {
		return;
	}

	try {
		await reviewService.confirmReviewedTemplate({
			target: {
				resource: review.resource,
				...(review.contentHash ? { contentHash: review.contentHash } : {}),
				sheetId: review.sheetId ?? null,
			},
			reviewedTemplate,
			reason,
		});
	} catch {
		// Confirmation is a learning side effect. It must not block explicit Slice execution.
	}
};

const getReviewedTemplateConfirmationReason = (
	selection: TemplateSelection,
): ReviewedTemplateConfirmationReason | null => {
	if (selection.kind === "saved") {
		return "user";
	}
	return null;
};

const getManualReviewSelection = (
	selection: TemplateSelection,
): ManualTemplateSelection | null => {
	if (selection.kind === "saved") {
		return {
			kind: "user",
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
	readonly review: UriReviewExecution;
	readonly reviewedTemplate: ReviewedTemplate;
	readonly selection: TemplateSelection;
	readonly target: SliceUriTarget;
}): SliceUriRequest | null => {
	if (!reviewedTemplate.template.measurement) {
		return null;
	}

	const requestSignature = createUriSliceRequestSignature({
		reviewSignature: review.reviewSignature,
		sourceModelVersion: review.sourceModelVersion,
		sourceVersion: review.sourceVersion,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	const sourceContentSignature = createSliceSourceContentSignature({
		sourceSheetId: review.sheetId ?? null,
		sourceModelVersion: review.sourceModelVersion,
		sourceUri: getSliceUriTargetResourceIdentity(review.resource),
		sourceVersion: review.sourceVersion,
	}, {
		reviewSignature: review.reviewSignature,
	});
	const targetId = createSliceUriTargetId(target);
	return {
		id: `slice-uri-request:${targetId}:${requestSignature}`,
		target,
		reviewedTemplate,
		reviewSignature: review.reviewSignature,
		trigger: selection.kind === "auto"
			? {
				kind: "reviewDecision",
				reviewSignature: review.reviewSignature,
				submittedBy: "system",
			}
			: {
				kind: "userCommand",
				commandId: "workbench.slice.runWithTemplate",
				submittedBy: "user",
			},
		requestSignature,
		createdAt: Date.now(),
		rowCount: review.rowCount,
		columnCount: review.columnCount,
		sourceContentSignature,
		sourceModelVersion: review.sourceModelVersion,
		sourceVersion: review.sourceVersion,
	};
};

const getSliceCommandUriTargets = (
	files: readonly ExplorerFileEntry[],
	sliceService: ISliceServiceType,
	incremental: boolean,
): SliceUriTarget[] => {
	const result: SliceUriTarget[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const target = createSliceUriTarget(file);
		if (!target) {
			continue;
		}
		const targetId = createSliceUriTargetId(target);
		if (incremental && sliceService.getUriResult(target)) {
			continue;
		}
		if (seen.has(targetId)) {
			continue;
		}

		seen.add(targetId);
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

const createUriSliceRequestSignature = ({
	reviewSignature,
	sourceModelVersion,
	sourceVersion,
	templateFingerprint,
}: {
	readonly reviewSignature: string;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
	readonly templateFingerprint: string;
}): string => JSON.stringify({
	reviewSignature: normalizeText(reviewSignature),
	sourceModelVersion: Math.max(0, Math.floor(sourceModelVersion)),
	sourceVersion: Math.max(0, Math.floor(sourceVersion)),
	templateFingerprint,
});

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const createSliceUriTargetId = (
	target: SliceUriTarget,
): string => {
	const resource = getSliceUriTargetResourceIdentity(target.resource);
	const sheetId = normalizeText(target.sheetId);
	return sheetId ? `${resource}\u0000${sheetId}` : resource;
};

const getSliceUriTargetResourceIdentity = (
	resource: unknown,
): string => {
	const text = getSliceUriTargetResourceString(resource);
	if (text) {
		return text.replace(/\\/g, "/");
	}

	if (resource && typeof resource === "object") {
		const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
		const scheme = normalizeText(candidate.scheme);
		const path = normalizeText(candidate.path);
		if (scheme && path) {
			const authority = normalizeText(candidate.authority);
			const query = normalizeText(candidate.query);
			const fragment = normalizeText(candidate.fragment);
			return (scheme === "file"
				? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
				: `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
			).replace(/\\/g, "/");
		}
	}

	return "";
};

const getSliceUriTargetResourceString = (
	resource: unknown,
): string => {
	if (!resource) {
		return "";
	}

	if (typeof resource === "string") {
		return normalizeText(resource);
	}

	const toString = (resource as { readonly toString?: unknown }).toString;
	if (typeof toString === "function" && toString !== Object.prototype.toString) {
		const text = normalizeText(toString.call(resource));
		return text === "[object Object]" ? "" : text;
	}

	return "";
};
