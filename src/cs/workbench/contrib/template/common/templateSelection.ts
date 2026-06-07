import { localize } from "src/cs/nls";
import {
  AUTO_TEMPLATE_ID,
  isAutoTemplateId,
} from "src/cs/workbench/contrib/template/common/autoTemplate";
import type { TemplateRecord } from "src/cs/workbench/contrib/template/common/template";

export type TemplateSelection =
  | { readonly kind: "auto" }
  | { readonly kind: "template"; readonly templateId: string };

export type TemplateSelectionsByFileId = Record<string, TemplateSelection>;

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

export const getTemplateSelectionLabel = (
  selection: TemplateSelection,
  templates: readonly TemplateRecord[] | null | undefined,
): string => {
  if (selection.kind === "auto") {
    return localize("template_auto_extraction", "Auto extraction");
  }

  return templates?.find((template) => template.id === selection.templateId)?.name ||
    selection.templateId;
};
