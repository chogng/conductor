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
} from "src/cs/workbench/services/slice/common/slice";
import {
	IReviewService,
	type IReviewService as IReviewServiceType,
	type ManualTemplateSelection,
	type ReviewedTemplateConfirmationReason,
	type ResourceReviewExecution,
} from "src/cs/workbench/services/review/common/review";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
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

type SliceCommandResource = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

type SliceCommandTemplateOptions = {
	readonly selection: TemplateSelection;
};

let sliceCommandRunActive = false;

export const runSliceWithTemplateHandler = (
	accessor: ServicesAccessor,
	options: RunSliceWithTemplateCommandOptions = {},
): void => {
	const explorerService = accessor.get(IExplorerService);
	const notificationService = accessor.get(INotificationService);
	if (explorerService.isImportingSources) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.importing", "Files are still importing. Try again after import finishes."),
			severity: Severity.Warning,
		});
		return;
	}

	const sliceService = accessor.get(ISliceService);
	if (sliceCommandRunActive || sliceService.getState().isRunning) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.alreadyRunning", "Template application is already running."),
			severity: Severity.Warning,
		});
		return;
	}

	const reviewService = accessor.get(IReviewService);
	const viewsService = accessor.get(IViewsService);
	const resources = getSliceCommandResources(
		explorerService.files,
		sliceService,
		Boolean(options.incremental),
	);

	const templateOptions = createSliceCommandTemplateOptions(accessor);
	if (!templateOptions) {
		return;
	}

	if (!resources.length) {
		notificationService.notify({
			id: "slice.notification",
			message: options.incremental
				? localize("slice.runWithTemplate.noNewResourceTables", "No new table resources to slice.")
				: localize("slice.runWithTemplate.noResourceTables", "No table resources are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	sliceCommandRunActive = true;
	void runResourcesWithTemplate({
		notificationService,
		reviewService,
		selection: templateOptions.selection,
		sliceService,
		viewsService,
		resources,
	}).catch(() => {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.failed", "Template application failed unexpectedly."),
			severity: Severity.Error,
		});
	}).finally(() => {
		sliceCommandRunActive = false;
	});
};

const createSliceCommandTemplateOptions = (
	accessor: ServicesAccessor,
): SliceCommandTemplateOptions | null => {
	const templateViewStateService = accessor.get(ITemplateViewStateService);
	const notificationService = accessor.get(INotificationService);
	const userTemplateService = accessor.get(IUserTemplateService);
	const state = templateViewStateService.getState();
	if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
		return {
			selection: { kind: "auto" },
		};
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

	return {
		selection: createTemplateSelection(templateId),
	};
};

const runResourcesWithTemplate = async ({
	notificationService,
	reviewService,
	selection,
	sliceService,
	viewsService,
	resources,
}: {
	readonly notificationService: Pick<INotificationService, "notify">;
	readonly reviewService: IReviewServiceType;
	readonly selection: TemplateSelection;
	readonly sliceService: ISliceServiceType;
	readonly viewsService: Pick<IViewsService, "openViewContainer">;
	readonly resources: readonly SliceCommandResource[];
}): Promise<void> => {
	const requests: SliceResourceRequest[] = [];
	let skippedCount = 0;
	for (let index = 0; index < resources.length; index += 1) {
		const resource = resources[index];
		if (!resource) {
			continue;
		}

		let skip: { readonly code: string; readonly message: string } | null = null;
		try {
			const resourceSelection = selection.kind === "saved"
				? selection
				: sliceService.getTemplateSelection(resource.resource, resource.sheetId);
			const reviewExecution = await reviewService.reviewResourceForExecution({
				resource: resource.resource,
				sheetId: resource.sheetId ?? null,
			});
			if (!reviewExecution) {
				skip = {
					code: "slice.reviewUnavailable",
					message: localize("slice.runWithTemplate.reviewUnavailable", "Review data is unavailable for this resource."),
				};
			} else {
				const reviewedTemplate = resourceSelection.kind === "auto"
					? reviewExecution.systemRecommendedReviewedTemplate ?? null
					: await getManualReviewedTemplate(reviewService, reviewExecution, resourceSelection);
				if (!reviewedTemplate) {
					skip = {
						code: "slice.reviewTemplateUnavailable",
						message: localize("slice.runWithTemplate.reviewTemplateUnavailable", "No valid reviewed template is available for this resource."),
					};
				} else {
					const request = createSliceResourceRequest({
						review: reviewExecution,
						reviewedTemplate,
						resource,
						selection: resourceSelection,
					});
					if (!request) {
						skip = {
							code: "slice.templateMeasurementMissing",
							message: localize("slice.runWithTemplate.templateMeasurementMissing", "The reviewed template has no measurement definition."),
						};
					} else {
						await confirmManualReviewedTemplate({
							review: reviewExecution,
							reviewedTemplate,
							reviewService,
							selection: resourceSelection,
						});
						requests.push(request);
					}
				}
			}
		} catch {
			skip = {
				code: "slice.resourcePreparationFailed",
				message: localize("slice.runWithTemplate.resourcePreparationFailed", "This resource could not be prepared for slicing."),
			};
		}

		if (!skip) {
			continue;
		}

		skippedCount += 1;
		sliceService.markResourceSkipped(
			resource.resource,
			resource.sheetId,
			skip.code,
			skip.message,
		);
	}

	if (!requests.length) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.noReviewedResourceTables", "No reviewed table resources are available to slice."),
			severity: skippedCount ? Severity.Warning : Severity.Info,
		});
		return;
	}

	sliceService.submitResource(requests);
	if (skippedCount) {
		notificationService.notify({
			id: "slice.notification",
			message: localize(
				"slice.runWithTemplate.partial",
				"Queued {0} resource(s) and skipped {1}.",
				{ 0: requests.length, 1: skippedCount },
			),
			severity: Severity.Warning,
		});
	}
	void viewsService.openViewContainer(ChartViewContainerId);
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
		resource: review.resource,
		...(review.contentHash ? { contentHash: review.contentHash } : {}),
		sheetId: review.sheetId ?? null,
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
			resource: review.resource,
			...(review.contentHash ? { contentHash: review.contentHash } : {}),
			sheetId: review.sheetId ?? null,
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
	resource,
	selection,
}: {
	readonly review: ResourceReviewExecution;
	readonly reviewedTemplate: ReviewedTemplate;
	readonly resource: SliceCommandResource;
	readonly selection: TemplateSelection;
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
	const resourceId = createSliceResourceId(resource.resource, resource.sheetId);
	return {
		id: `slice-resource-request:${resourceId}:${requestSignature}`,
		resource: resource.resource,
		sheetId: resource.sheetId ?? null,
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

const getSliceCommandResources = (
	files: readonly ExplorerFileEntry[],
	sliceService: ISliceServiceType,
	incremental: boolean,
): SliceCommandResource[] => {
	const result: SliceCommandResource[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const resource = createSliceCommandResource(file);
		if (!resource) {
			continue;
		}
		const resourceId = createSliceResourceId(resource.resource, resource.sheetId);
		if (incremental && sliceService.getResourceResult(resource.resource, resource.sheetId)) {
			continue;
		}
		if (seen.has(resourceId)) {
			continue;
		}

		seen.add(resourceId);
		result.push(resource);
	}
	return result;
};

const createSliceCommandResource = (
	file: ExplorerFileEntry,
): SliceCommandResource | null => {
	const resource = URI.revive(file.resource);
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

const createSliceResourceId = (
	resource: URI,
	sheetId?: string | null,
): string => {
	const resourceId = getSliceResourceIdentity(resource);
	const normalizedSheetId = normalizeText(sheetId);
	return normalizedSheetId ? `${resourceId}\u0000${normalizedSheetId}` : resourceId;
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
