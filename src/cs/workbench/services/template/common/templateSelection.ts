/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  AUTO_TEMPLATE_ID,
  isAutoTemplateId,
} from "src/cs/workbench/services/template/common/autoTemplate";
import type { TemplateRecord } from "src/cs/workbench/services/template/common/template";

export type TemplateSelection =
  | { readonly kind: "auto" }
  | { readonly kind: "template"; readonly templateId: string };

export type TemplateSelectionsByFileId = Record<string, TemplateSelection>;

export type CurrentTemplateSelectionDisplay = {
  readonly label: string;
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
    kind: "template",
    templateId: normalizedTemplateId,
  };
};

export const getTemplateSelectionId = (selection: TemplateSelection): string =>
  selection.kind === "auto" ? AUTO_TEMPLATE_ID : selection.templateId;

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
    if (selection.kind !== "template" || selection.templateId !== normalizedTemplateId) {
      continue;
    }

    next ??= { ...fileSelections };
    delete next[fileId];
  }

  return next ?? fileSelections;
};

export const getTemplateSelectionLabel = (
  selection: TemplateSelection,
  templates: readonly TemplateRecord[] | null | undefined,
): string => {
  if (selection.kind === "auto") {
    return localize("template.autoExtraction", "Auto extraction");
  }

  return templates?.find((template) => template.id === selection.templateId)?.name ||
    selection.templateId;
};

export const createCurrentTemplateSelectionDisplay = ({
  formName,
  selectedTemplateId,
}: {
  readonly formName?: string | null;
  readonly selectedTemplateId?: string | null;
}): CurrentTemplateSelectionDisplay => {
  const selection = createTemplateSelection(selectedTemplateId);
  if (selection.kind === "auto") {
    return {
      label: localize("template.autoExtraction", "Auto extraction"),
      selection,
    };
  }

  const normalizedFormName = String(formName ?? "").trim();
  return {
    label: normalizedFormName || selection.templateId,
    selection,
  };
};
