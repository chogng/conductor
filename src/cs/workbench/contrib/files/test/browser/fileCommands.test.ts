import assert from "assert";

import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { ExplorerService } from "../../../../../workbench/contrib/files/browser/explorerService.ts";
import { IExplorerService } from "../../../../../workbench/contrib/files/common/explorer.ts";
import { ITemplateService, type ITemplateService as ITemplateServiceType } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import {
  addFolderHandler,
  removeFileItemHandler,
  removeFolderHandler,
  setFileTemplateHandler,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  test("file item commands delegate to owning services", () => {
    const explorerService = new ExplorerService();
    let removedFileId: string | null = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const removalListener = explorerService.onDidRequestFileRemoval(request => {
      removedFileId = request.fileId;
    });
    const templateService = {
      _serviceBrand: undefined,
      setSelectionsByFileId: (updater: (previous: Record<string, TemplateSelection>) => Record<string, TemplateSelection>) => {
        const next = updater({});
        const selection = next["file-1"];
        if (selection) {
          templateSelection = { fileId: "file-1", selection };
        }
      },
    } as unknown as ITemplateServiceType;
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [ITemplateService, templateService],
    ]);

    removeFileItemHandler(accessor, " file-1 ");
    setFileTemplateHandler(accessor, "file-1", {
      kind: "template",
      templateId: "template-1",
    });
    setFileTemplateHandler(accessor, "file-2", {
      kind: "template",
      templateId: " ",
    });

    assert.equal(removedFileId, "file-1");
    assert.deepEqual(templateSelection, {
      fileId: "file-1",
      selection: {
        kind: "template",
        templateId: "template-1",
      },
    });
    removalListener.dispose();
  });

  test("folder commands delegate to explorer workflow requests", () => {
    const explorerService = new ExplorerService();
    let importRequests = 0;
    let removalRequests = 0;
    const importListener = explorerService.onDidRequestFolderImport(() => {
      importRequests += 1;
    });
    const removalListener = explorerService.onDidRequestSelectedFolderRemoval(() => {
      removalRequests += 1;
    });
    const accessor = createAccessor([
      [IExplorerService, explorerService],
    ]);

    addFolderHandler(accessor);
    removeFolderHandler(accessor);

    assert.equal(importRequests, 1);
    assert.equal(removalRequests, 1);
    importListener.dispose();
    removalListener.dispose();
  });
});

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}
