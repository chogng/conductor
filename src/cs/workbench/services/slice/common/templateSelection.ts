/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "src/cs/base/common/uri";

const AUTO_TEMPLATE_SELECTION_ID = "auto";

export type TemplateSelection =
	| { readonly kind: "auto" }
	| { readonly kind: "saved"; readonly templateId: string };

export type TemplateSelectionResource = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export type TemplateSelectionResourceLike = {
	readonly resource?: URI | null;
	readonly sheetId?: string | null;
};

export type TemplateResourceSelection = {
	readonly resource: URI;
	readonly sheetId?: string | null;
	readonly selection: TemplateSelection;
};

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
	return selection.templateId;
};

export const resolveTemplateSelectionForResource = (
	resource: TemplateSelectionResourceLike | null | undefined,
	resourceSelections: readonly TemplateResourceSelection[],
	currentSelection: TemplateSelection,
): TemplateSelection => {
	const resourceKey = createTemplateSelectionResourceCacheKey(resource);
	if (!resourceKey) {
		return currentSelection;
	}

	return resourceSelections.find(selection =>
		createTemplateSelectionResourceCacheKey(selection) === resourceKey,
	)?.selection ?? currentSelection;
};

export const removeTemplateSelectionsForResources = (
	resourceSelections: readonly TemplateResourceSelection[],
	resources: Iterable<TemplateSelectionResourceLike | null | undefined>,
): readonly TemplateResourceSelection[] => {
	const resourceKeys = new Set<string>();
	for (const resource of resources) {
		const resourceKey = createTemplateSelectionResourceCacheKey(resource);
		if (resourceKey) {
			resourceKeys.add(resourceKey);
		}
	}
	if (!resourceKeys.size) {
		return resourceSelections;
	}

	const next = resourceSelections.filter(selection => {
		const resourceKey = createTemplateSelectionResourceCacheKey(selection);
		return !resourceKey || !resourceKeys.has(resourceKey);
	});
	return next.length === resourceSelections.length ? resourceSelections : next;
};

export const removeTemplateSelectionsForTemplate = (
	resourceSelections: readonly TemplateResourceSelection[],
	templateId: string | null | undefined,
): readonly TemplateResourceSelection[] => {
	const normalizedTemplateId = String(templateId ?? "").trim();
	if (!normalizedTemplateId) {
		return resourceSelections;
	}

	const next = resourceSelections.filter(({ selection }) =>
		getTemplateSelectionTemplateId(selection) !== normalizedTemplateId,
	);
	return next.length === resourceSelections.length ? resourceSelections : next;
};

export const normalizeTemplateSelectionResource = (
	resourceIdentity: TemplateSelectionResourceLike | null | undefined,
): TemplateSelectionResource | null => {
	const resource = resourceIdentity?.resource ? URI.revive(resourceIdentity.resource) : null;
	if (!resource) {
		return null;
	}

	const sheetId = normalizeText(resourceIdentity?.sheetId);
	return {
		resource,
		...(sheetId ? { sheetId } : {}),
	};
};

export const areTemplateResourceSelectionsEqual = (
	current: readonly TemplateResourceSelection[],
	next: readonly TemplateResourceSelection[],
): boolean => {
	if (current.length !== next.length) {
		return false;
	}

	const nextSelections = new Map<string, TemplateSelection>();
	for (const resourceSelection of next) {
		const resourceKey = createTemplateSelectionResourceCacheKey(resourceSelection);
		if (!resourceKey) {
			return false;
		}
		nextSelections.set(resourceKey, resourceSelection.selection);
	}

	for (const resourceSelection of current) {
		const resourceKey = createTemplateSelectionResourceCacheKey(resourceSelection);
		if (!resourceKey) {
			return false;
		}
		const nextSelection = nextSelections.get(resourceKey);
		if (!isSameTemplateSelection(resourceSelection.selection, nextSelection)) {
			return false;
		}
	}

	return true;
};

export const areTemplateSelectionsEqual = (
	current: TemplateSelection | undefined,
	next: TemplateSelection | undefined,
): boolean => {
	if (current?.kind === "auto" || next?.kind === "auto") {
		return current?.kind === next?.kind;
	}

	return getTemplateSelectionTemplateId(current) === getTemplateSelectionTemplateId(next);
};

const isSameTemplateSelection = areTemplateSelectionsEqual;

const createTemplateSelectionResourceCacheKey = (
	resourceIdentity: TemplateSelectionResourceLike | null | undefined,
): string | null => {
	const normalizedResource = normalizeTemplateSelectionResource(resourceIdentity);
	if (!normalizedResource) {
		return null;
	}

	return `${normalizedResource.resource.toString().replace(/\\/g, "/")}\u001f${normalizeText(normalizedResource.sheetId)}`;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();
