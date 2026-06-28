/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "src/cs/base/common/uri";

const AUTO_TEMPLATE_SELECTION_ID = "auto";

export type TemplateSelection =
	| { readonly kind: "auto" }
	| { readonly kind: "saved"; readonly templateId: string };

export type TemplateSelectionTarget = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export type TemplateSelectionTargetLike = {
	readonly resource?: URI | null;
	readonly sheetId?: string | null;
};

export type TemplateTargetSelection = {
	readonly target: TemplateSelectionTarget;
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

export const resolveTemplateSelectionForTarget = (
	target: TemplateSelectionTargetLike | null | undefined,
	targetSelections: readonly TemplateTargetSelection[],
	currentSelection: TemplateSelection,
): TemplateSelection => {
	const targetKey = createTemplateSelectionTargetCacheKey(target);
	if (!targetKey) {
		return currentSelection;
	}

	return targetSelections.find(selection =>
		createTemplateSelectionTargetCacheKey(selection.target) === targetKey,
	)?.selection ?? currentSelection;
};

export const removeTemplateSelectionsForTargets = (
	targetSelections: readonly TemplateTargetSelection[],
	targets: Iterable<TemplateSelectionTargetLike | null | undefined>,
): readonly TemplateTargetSelection[] => {
	const targetKeys = new Set<string>();
	for (const target of targets) {
		const targetKey = createTemplateSelectionTargetCacheKey(target);
		if (targetKey) {
			targetKeys.add(targetKey);
		}
	}
	if (!targetKeys.size) {
		return targetSelections;
	}

	const next = targetSelections.filter(selection => {
		const targetKey = createTemplateSelectionTargetCacheKey(selection.target);
		return !targetKey || !targetKeys.has(targetKey);
	});
	return next.length === targetSelections.length ? targetSelections : next;
};

export const removeTemplateSelectionsForTemplate = (
	targetSelections: readonly TemplateTargetSelection[],
	templateId: string | null | undefined,
): readonly TemplateTargetSelection[] => {
	const normalizedTemplateId = String(templateId ?? "").trim();
	if (!normalizedTemplateId) {
		return targetSelections;
	}

	const next = targetSelections.filter(({ selection }) =>
		getTemplateSelectionTemplateId(selection) !== normalizedTemplateId,
	);
	return next.length === targetSelections.length ? targetSelections : next;
};

export const normalizeTemplateSelectionTarget = (
	target: TemplateSelectionTargetLike | null | undefined,
): TemplateSelectionTarget | null => {
	const resource = target?.resource ? URI.revive(target.resource) : null;
	if (!resource) {
		return null;
	}

	const sheetId = normalizeText(target?.sheetId);
	return {
		resource,
		...(sheetId ? { sheetId } : {}),
	};
};

export const areTemplateTargetSelectionsEqual = (
	current: readonly TemplateTargetSelection[],
	next: readonly TemplateTargetSelection[],
): boolean => {
	if (current.length !== next.length) {
		return false;
	}

	const nextSelections = new Map<string, TemplateSelection>();
	for (const targetSelection of next) {
		const targetKey = createTemplateSelectionTargetCacheKey(targetSelection.target);
		if (!targetKey) {
			return false;
		}
		nextSelections.set(targetKey, targetSelection.selection);
	}

	for (const targetSelection of current) {
		const targetKey = createTemplateSelectionTargetCacheKey(targetSelection.target);
		if (!targetKey) {
			return false;
		}
		const nextSelection = nextSelections.get(targetKey);
		if (!isSameTemplateSelection(targetSelection.selection, nextSelection)) {
			return false;
		}
	}

	return true;
};

const isSameTemplateSelection = (
	current: TemplateSelection | undefined,
	next: TemplateSelection | undefined,
): boolean => {
	if (current?.kind === "auto" || next?.kind === "auto") {
		return current?.kind === next?.kind;
	}

	return getTemplateSelectionTemplateId(current) === getTemplateSelectionTemplateId(next);
};

const createTemplateSelectionTargetCacheKey = (
	target: TemplateSelectionTargetLike | null | undefined,
): string | null => {
	const normalizedTarget = normalizeTemplateSelectionTarget(target);
	if (!normalizedTarget) {
		return null;
	}

	return `${normalizedTarget.resource.toString().replace(/\\/g, "/")}\u001f${normalizeText(normalizedTarget.sheetId)}`;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();
