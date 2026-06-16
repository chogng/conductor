import assert from "assert";

import { isWindows } from "../../../../../base/common/platform.ts";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { INativeHostService } from "../../../../../platform/native/common/native.ts";
import { ExplorerService } from "../../browser/explorerService.ts";
import { IExplorerService } from "../../browser/files.ts";
import { RENAME_FILE_ITEM_COMMAND_ID, REVEAL_IN_OS_COMMAND_ID } from "../../common/files.ts";
import "../../browser/fileActions.contribution.ts";
import "../../electron-browser/fileActions.contribution.ts";
import { resolveRevealResources } from "../../electron-browser/fileCommands.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/test/electron-browser/fileCommands", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reveal in OS command resolves Explorer file paths", () => {
    const explorerService = store.add(new ExplorerService());
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
    assert.equal(sourceResources[0].fsPath, toExpectedFsPath("C:/data/source.csv"));
    assert.equal(normalizedResources.length, 1);
    assert.equal(normalizedResources[0].fsPath, toExpectedFsPath("C:/tmp/normalized.csv"));
  });

  test("registered reveal in OS command delegates to native host", () => {
    const explorerService = store.add(new ExplorerService());
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-1",
        fileName: "file.csv",
        sourcePath: "C:/data/file.csv",
      }],
      mode: "table",
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
    } as unknown as INativeHostService;
    const accessor = createAccessor([
      [IExplorerService, explorerService],
      [INativeHostService, nativeHostService],
    ]);

    CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID)?.handler(accessor, "file-1");

    assert.equal(revealedPath, toExpectedFsPath("C:/data/file.csv"));
    assert.ok(CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID));
  });

  test("registered rename command enters Explorer editable state", () => {
    const explorerService = store.add(new ExplorerService());
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-1",
        fileName: "file.csv",
      }],
      mode: "table",
      selectedFileId: "file-1",
      selectionKind: "table",
      thumbnailFiles: [],
    });
    const accessor = createAccessor([[IExplorerService, explorerService]]);

    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, "file-1");

    assert.deepEqual(explorerService.getContext().editable, {
      isEditing: true,
      resource: {
        fileId: "file-1",
        kind: "table",
      },
    });
  });
});

const toExpectedFsPath = (path: string): string =>
  isWindows ? path.replace(/\//g, "\\") : `/${path}`;

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}
