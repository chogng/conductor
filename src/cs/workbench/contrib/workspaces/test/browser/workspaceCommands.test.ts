import assert from "assert";

import { URI } from "../../../../../base/common/uri.ts";
import {
  IFileDialogService,
  type IOpenDialogOptions,
} from "../../../../../platform/dialogs/common/dialogs.ts";
import { FileService } from "../../../../../platform/files/common/fileService.ts";
import { IFileService } from "../../../../../platform/files/common/files.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { IPathService, type IPathService as IPathServiceType } from "../../../../../workbench/services/path/common/pathService.ts";
import { addWorkspaceFolderHandler } from "../../browser/workspaceCommands.ts";

suite("workbench/contrib/workspaces/test/browser/workspaceCommands", () => {
  test("add workspace folder command returns the selected folder", async () => {
    const selectedFolder = URI.file("/data/import");
    const userHome = URI.file("/data");
    let openDialogDefaultUri: URI | undefined;
    const filesService = new FileService();
    const accessor = createAccessor([
      [IFileService, filesService],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async (options: IOpenDialogOptions) => {
          openDialogDefaultUri = options.defaultUri;
          return [selectedFolder];
        },
      }],
      [IPathService, {
        _serviceBrand: undefined,
        defaultUriScheme: "file",
        fileURI: async (path: string) => URI.file(path),
        path: Promise.resolve({} as IPathServiceType["path"] extends Promise<infer T> ? T : never),
        resolvedUserHome: userHome,
        userHome: () => userHome,
      }],
    ]);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder?.toString(), selectedFolder.toString());
    assert.equal(openDialogDefaultUri?.toString(), userHome.toString());
  });
});

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T => values.get(id as ServiceIdentifier<unknown>) as T,
  };
}
