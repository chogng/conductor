/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";

export type TemplateImportPayloadHandler = (
  payload: unknown,
  options: { fileName: string },
) => Promise<unknown> | unknown;

export class TemplateImportController {
  constructor(
    private readonly dialogsService: IFileDialogService,
    private readonly filesService: IFileService,
    private readonly pathService: IPathService,
  ) {}

  async importTemplateFromDialog(
    importTemplatesFromPayload: TemplateImportPayloadHandler,
  ): Promise<void> {
    const resources = await this.dialogsService.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: this.pathService.userHome({ preferLocal: true }),
      filters: [
        {
          name: localize("template.import.jsonFilter", "JSON templates"),
          extensions: ["json"],
        },
      ],
      openLabel: localize("template.import.openLabel", "Import template"),
      title: localize("template.import.dialogTitle", "Import template"),
    });
    const resource = resources?.[0];
    if (!resource) {
      return;
    }

    const content = await this.filesService.readFile(resource, { encoding: "utf8" });
    const payload = JSON.parse(content.value) as unknown;
    await importTemplatesFromPayload(payload, { fileName: getResourceFileName(resource) });
  }
}

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

const getResourceFileName = (resource: URI): string => {
  const normalizedPath = resource.path.replace(/\\/g, "/");
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1) || "template.json";
};
