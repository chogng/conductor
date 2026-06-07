import assert from "assert";

import { FileService } from "../../../../../platform/files/common/fileService.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { IViewsService, type IViewsService as IViewsServiceType } from "../../../../../workbench/services/views/common/viewsService.ts";
import type { TemplateSelection } from "../../../template/common/templateSelection.ts";
import {
  canImportFolderWithFileService,
  getFolderImportSupportForFileService,
  removeFileItemHandler,
  setFileTemplateHandler,
} from "../../browser/fileCommands.ts";

suite("workbench/contrib/files/test/browser/fileCommands", () => {
  test("folder import does not require browser folder picker for non-HTML file services", () => {
    const filesService = new FileService();

    assert.deepEqual(
      getFolderImportSupportForFileService(filesService),
      { reason: null, supported: true },
    );
    assert.equal(canImportFolderWithFileService(filesService), true);
  });

  test("file item commands delegate to files pane", () => {
    let removedFileId: string | null = null;
    let templateSelection:
      | { readonly fileId: string; readonly selection: TemplateSelection }
      | null = null;
    const view = {
      removeFile: (fileId: string) => {
        removedFileId = fileId;
      },
      setFileTemplateSelection: (
        fileId: string,
        selection: TemplateSelection,
      ) => {
        templateSelection = { fileId, selection };
      },
    };
    const accessor = createAccessor([
      [IViewsService, {
        _serviceBrand: undefined,
        getViewWithId: () => view,
      } as unknown as IViewsServiceType],
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
