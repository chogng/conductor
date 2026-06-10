/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { TemplateImportPayloadHandler } from "src/cs/workbench/services/template/common/template";

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
          name: localize("template_json_filter", "JSON templates"),
          extensions: ["json"],
        },
      ],
      openLabel: localize("template_import_open_label", "Import template"),
      title: localize("template_import_dialog_title", "Import template"),
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

const getResourceFileName = (resource: URI): string => {
  const normalizedPath = resource.path.replace(/\\/g, "/");
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1) || "template.json";
};
