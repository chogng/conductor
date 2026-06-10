/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateImportPayloadHandler } from "src/cs/workbench/services/template/common/template";

export const formatTemplateExportFileName = (templateNameRaw?: string): string => {
  const safeTemplateName = String(templateNameRaw ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");

  return `${safeTemplateName || "analysis-template"}.json`;
};

export const downloadTemplateBundle = (bundle: unknown): string => {
  const record = bundle && typeof bundle === "object" ? bundle as Record<string, unknown> : {};
  const exportedTemplateName = String(record.name ?? "").trim();
  const filename = formatTemplateExportFileName(exportedTemplateName);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);

  return filename;
};

export const importTemplateFile = async (
  file: File,
  importTemplatesFromPayload: TemplateImportPayloadHandler,
): Promise<void> => {
  const raw = await file.text();
  const payload = JSON.parse(raw) as unknown;
  await importTemplatesFromPayload(payload, { fileName: file.name });
};
