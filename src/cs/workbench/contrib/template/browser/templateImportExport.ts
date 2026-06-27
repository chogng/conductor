/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { joinPath } from "src/cs/base/common/resources";
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

    const content = await this.filesService.readFile(resource);
    const payload = JSON.parse(new TextDecoder().decode(content.value)) as unknown;
    await importTemplatesFromPayload(payload, { fileName: getResourceFileName(resource) });
  }
}

export type TemplateExportResult =
  | {
    readonly kind: "canceled";
  }
  | {
    readonly fileName: string;
    readonly kind: "downloaded";
  }
  | {
    readonly fileName: string;
    readonly kind: "saved";
    readonly resource: URI;
  };

export class TemplateExportController {
  constructor(
    private readonly dialogsService: IFileDialogService,
    private readonly filesService: IFileService,
    private readonly pathService: IPathService,
  ) {}

  async exportTemplateToDialog(
    bundle: unknown,
    options: {
      readonly templateName?: string;
    } = {},
  ): Promise<TemplateExportResult> {
    const fileName = formatTemplateExportFileName(options.templateName ?? getTemplateBundleName(bundle));
    if (this.dialogsService.canSaveFile()) {
      const resource = await this.dialogsService.showSaveDialog({
        defaultUri: joinPath(this.pathService.userHome({ preferLocal: true }), fileName),
        filters: [
          {
            name: localize("template.export.jsonFilter", "JSON templates"),
            extensions: ["json"],
          },
        ],
        saveLabel: localize("template.export.saveLabel", "Export template"),
        title: localize("template.export.dialogTitle", "Export template"),
      });
      if (!resource) {
        return { kind: "canceled" };
      }

      await this.filesService.writeFile(resource, formatTemplateExportJson(bundle));
      return {
        fileName: getResourceFileName(resource),
        kind: "saved",
        resource,
      };
    }

    if (!downloadTemplateJson(bundle, fileName)) {
      return { kind: "canceled" };
    }

    return {
      fileName,
      kind: "downloaded",
    };
  }
}

export const formatTemplateExportFileName = (templateNameRaw?: string): string => {
  const safeTemplateName = String(templateNameRaw ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ");

  return `${safeTemplateName || "analysis-template"}.json`;
};

export const importTemplateFile = async (
  file: File,
  importTemplatesFromPayload: TemplateImportPayloadHandler,
): Promise<void> => {
  const raw = await file.text();
  const payload = JSON.parse(raw) as unknown;
  await importTemplatesFromPayload(payload, { fileName: file.name });
};

const getTemplateBundleName = (bundle: unknown): string => {
  const record = bundle && typeof bundle === "object" ? bundle as Record<string, unknown> : {};
  return String(record.name ?? "").trim();
};

const formatTemplateExportJson = (bundle: unknown): string => `${JSON.stringify(bundle, null, 2)}\n`;

const downloadTemplateJson = (bundle: unknown, fileName: string): boolean => {
  const documentRef = globalThis.document;
  const urlApi = globalThis.URL;
  if (
    !documentRef ||
    typeof documentRef.createElement !== "function" ||
    !documentRef.body ||
    typeof Blob !== "function" ||
    typeof urlApi?.createObjectURL !== "function" ||
    typeof urlApi.revokeObjectURL !== "function"
  ) {
    return false;
  }

  const href = urlApi.createObjectURL(new Blob([formatTemplateExportJson(bundle)], {
    type: "application/json;charset=utf-8",
  }));
  const revokeObjectURL = urlApi.revokeObjectURL.bind(urlApi);
  const anchor = documentRef.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.style.display = "none";
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => revokeObjectURL(href), 0);
  }

  return true;
};

const getResourceFileName = (resource: URI): string => {
  const normalizedPath = resource.path.replace(/\\/g, "/");
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1) || "template.json";
};
