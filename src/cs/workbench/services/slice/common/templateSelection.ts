/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

const AUTO_TEMPLATE_SELECTION_ID = "auto";

export type TemplateSelection =
	| { readonly kind: "auto" }
	| { readonly kind: "saved"; readonly templateId: string }
	| { readonly kind: "inline"; readonly template: Template };

export type TemplateSelectionsByFileId = Record<string, TemplateSelection>;

export const createTemplateSelection = (
	templateId: string | null | undefined,
): TemplateSelection => {
	const normalizedTemplateId = String(templateId ?? "").trim();
	if (!normalizedTemplateId || isAutoTemplateId(normalizedTemplateId)) {
		return { kind: "auto" };
	}

	return {
		kind: "saved",
		templateId: normalizedTemplateId,
	};
};

export const isAutoTemplateId = (templateId: unknown): boolean => {
	const normalizedTemplateId = String(templateId ?? "").trim();
	return normalizedTemplateId === AUTO_TEMPLATE_SELECTION_ID;
};

export const createInlineTemplateSelection = (template: Template): TemplateSelection => ({
	kind: "inline",
	template,
});

export const isSavedTemplateSelection = (
	selection: TemplateSelection | null | undefined,
): selection is Extract<TemplateSelection, { readonly kind: "saved" }> =>
	selection?.kind === "saved";

export const getTemplateSelectionTemplateId = (
	selection: TemplateSelection | null | undefined,
): string | null =>
	isSavedTemplateSelection(selection)
		? String(selection.templateId ?? "").trim() || null
		: null;

export const getTemplateSelectionId = (selection: TemplateSelection): string => {
	if (selection.kind === "auto") {
		return AUTO_TEMPLATE_SELECTION_ID;
	}
	if (selection.kind === "inline") {
		return `inline:${selection.template.id}`;
	}
	return selection.templateId;
};

export const resolveTemplateSelectionForFile = (
	fileId: string | null | undefined,
	fileSelections: TemplateSelectionsByFileId,
	currentSelection: TemplateSelection,
): TemplateSelection => {
	const normalizedFileId = String(fileId ?? "").trim();
	if (!normalizedFileId) {
		return currentSelection;
	}

	return fileSelections[normalizedFileId] ?? currentSelection;
};

export const removeTemplateSelectionsForFiles = (
	fileSelections: TemplateSelectionsByFileId,
	fileIds: Iterable<string>,
): TemplateSelectionsByFileId => {
	let next: TemplateSelectionsByFileId | null = null;
	for (const fileId of fileIds) {
		const normalizedFileId = String(fileId ?? "").trim();
		if (!normalizedFileId || !fileSelections[normalizedFileId]) {
			continue;
		}

		next ??= { ...fileSelections };
		delete next[normalizedFileId];
	}

	return next ?? fileSelections;
};

export const removeTemplateSelectionsForTemplate = (
	fileSelections: TemplateSelectionsByFileId,
	templateId: string | null | undefined,
): TemplateSelectionsByFileId => {
	const normalizedTemplateId = String(templateId ?? "").trim();
	if (!normalizedTemplateId) {
		return fileSelections;
	}

	let next: TemplateSelectionsByFileId | null = null;
	for (const [fileId, selection] of Object.entries(fileSelections)) {
		if (getTemplateSelectionTemplateId(selection) !== normalizedTemplateId) {
			continue;
		}

		next ??= { ...fileSelections };
		delete next[fileId];
	}

	return next ?? fileSelections;
};
