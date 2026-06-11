import assert from "assert";

import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "../../../../../platform/native/common/native.ts";
import { ExplorerService } from "../../browser/explorerService.ts";
import { IExplorerService } from "../../browser/files.ts";
import { REVEAL_IN_OS_COMMAND_ID } from "../../common/files.ts";
import "../../electron-browser/fileActions.contribution.ts";
import { resolveRevealResources } from "../../electron-browser/fileCommands.ts";

suite("workbench/contrib/files/test/electron-browser/fileCommands", () => {
  test("reveal in OS command resolves Explorer file paths", () => {
    const explorerService = new ExplorerService();
    explorerService.updatePaneInput({
      files: [
        {
          fileId: "source-file",
          fileName: "source.csv",
          sourcePath: "C:/data/source.csv",
        },
        {
          fileId: "normalized-file",
          fileName: "normalized.csv",
          normalizedCsvPath: "C:/tmp/normalized.csv",
        },
      ],
      mode: "table",
      onFileImported: () => {},
      onFileRemoved: () => {},
      onFilesAdded: () => {},
      onFilesRemoved: () => {},
      onFilesReplaced: () => {},
      selectedFileId: "source-file",
      selectionKind: "table",
      thumbnailFiles: [],
    });

    const sourceResources = resolveRevealResources(
      createAccessor([[IExplorerService, explorerService]]),
      "source-file",
    );
    const normalizedResources = resolveRevealResources(
      createAccessor([[IExplorerService, explorerService]]),
      "normalized-file",
    );

    assert.equal(sourceResources.length, 1);
    assert.equal(sourceResources[0].fsPath, "C:\\data\\source.csv");
    assert.equal(normalizedResources.length, 1);
    assert.equal(normalizedResources[0].fsPath, "C:\\tmp\\normalized.csv");
  });

  test("registered reveal in OS command delegates to native host", () => {
    const explorerService = new ExplorerService();
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-1",
        fileName: "file.csv",
        sourcePath: "C:/data/file.csv",
      }],
      mode: "table",
      onFileImported: () => {},
      onFileRemoved: () => {},
      onFilesAdded: () => {},
      onFilesRemoved: () => {},
      onFilesReplaced: () => {},
      selectedFileId: "file-1",
      selectionKind: "table",
      thumbnailFiles: [],
    });

    let revealedPath: string | null = null;
    const nativeHostService = {
      _serviceBrand: undefined,
      showItemInFolder: (path: string) => {
        revealedPath = path;
      },
    } as unknown as INativeHostServiceType;
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [INativeHostService, nativeHostService],
    ]);

    CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID)?.handler(accessor, "file-1");

    assert.equal(revealedPath, "C:\\data\\file.csv");
    assert.ok(CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID));
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
