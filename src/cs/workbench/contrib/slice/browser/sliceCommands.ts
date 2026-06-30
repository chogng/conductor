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
	type SliceResourceRequest,
	type SliceResourceTarget,
} from "src/cs/workbench/services/slice/common/slice";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
	type ManualTemplateSelection,
	type ReviewedTemplateConfirmationReason,
	type ResourceReviewExecution,
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
	const resourceTargets = getSliceCommandResourceTargets(
		explorerService.files,
		sliceService,
		Boolean(options.incremental),
	);

	const selection = createSliceCommandTemplateSelection(accessor);
	if (!selection) {
		return;
	}

	if (!resourceTargets.length) {
		notificationService.notify({
			id: "slice.notification",
			message: options.incremental
				? localize("slice.runWithTemplate.noNewResourceTables", "No new table resources to slice.")
				: localize("slice.runWithTemplate.noResourceTables", "No table resources are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	void runResourceTargetsWithTemplate({
		layoutService,
		notificationService,
		reviewService,
		selection,
		sliceService,
		targets: resourceTargets,
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

const runResourceTargetsWithTemplate = async ({
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
	readonly targets: readonly SliceResourceTarget[];
}): Promise<void> => {
	const requests: SliceResourceRequest[] = [];
	for (const target of targets) {
		const reviewExecution = await reviewService.reviewResourceForExecution({
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

		const request = createSliceResourceRequest({
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
			message: localize("slice.runWithTemplate.noReviewedResourceTables", "No reviewed table resources are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	sliceService.submitResource(requests);
	layoutService.navigateToView("chart");
};

const getManualReviewedTemplate = async (
	reviewService: IReviewServiceType,
	review: ResourceReviewExecution,
	selection: TemplateSelection,
): Promise<ReviewedTemplate | null> => {
	const manualSelection = getManualReviewSelection(selection);
	if (!manualSelection) {
		return null;
	}

	const result = await reviewService.reviewResourceManualTemplate({
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
	readonly review: ResourceReviewExecution;
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

const createSliceResourceRequest = ({
	review,
	reviewedTemplate,
	selection,
	target,
}: {
	readonly review: ResourceReviewExecution;
	readonly reviewedTemplate: ReviewedTemplate;
	readonly selection: TemplateSelection;
	readonly target: SliceResourceTarget;
}): SliceResourceRequest | null => {
	if (!reviewedTemplate.template.measurement) {
		return null;
	}

	const requestSignature = createResourceSliceRequestSignature({
		reviewSignature: review.reviewSignature,
		sourceModelVersion: review.sourceModelVersion,
		sourceVersion: review.sourceVersion,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	const sourceContentSignature = createSliceSourceContentSignature({
		sourceSheetId: review.sheetId ?? null,
		sourceModelVersion: review.sourceModelVersion,
		sourceUri: getSliceResourceIdentity(review.resource),
		sourceVersion: review.sourceVersion,
	}, {
		reviewSignature: review.reviewSignature,
	});
	const targetId = createSliceResourceTargetId(target);
	return {
		id: `slice-resource-request:${targetId}:${requestSignature}`,
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

const getSliceCommandResourceTargets = (
	files: readonly ExplorerFileEntry[],
	sliceService: ISliceServiceType,
	incremental: boolean,
): SliceResourceTarget[] => {
	const result: SliceResourceTarget[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const target = createSliceResourceTarget(file);
		if (!target) {
			continue;
		}
		const targetId = createSliceResourceTargetId(target);
		if (incremental && sliceService.getResourceResult(target)) {
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

const createSliceResourceTarget = (
	file: ExplorerFileEntry,
): SliceResourceTarget | null => {
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

const createResourceSliceRequestSignature = ({
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

const createSliceResourceTargetId = (
	target: SliceResourceTarget,
): string => {
	const resource = getSliceResourceIdentity(target.resource);
	const sheetId = normalizeText(target.sheetId);
	return sheetId ? `${resource}\u0000${sheetId}` : resource;
};

const getSliceResourceIdentity = (
	resource: unknown,
): string => {
	const text = getSliceResourceString(resource);
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

const getSliceResourceString = (
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
