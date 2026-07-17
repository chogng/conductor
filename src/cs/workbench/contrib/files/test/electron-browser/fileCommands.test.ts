import assert from "assert";

import { isWindows } from "../../../../../base/common/platform.ts";
import { URI } from "../../../../../base/common/uri.ts";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import { INativeHostService } from "../../../../../platform/native/common/native.ts";
import { ExplorerService } from "../../browser/explorerService.ts";
import { IExplorerService } from "../../browser/files.ts";
import { RENAME_FILE_ITEM_COMMAND_ID } from "../../browser/fileActions.ts";
import { REVEAL_IN_OS_COMMAND_ID } from "../../common/files.ts";
import "../../browser/fileActions.contribution.ts";
import "../../electron-browser/fileActions.contribution.ts";
import { resolveRevealResources } from "../../electron-browser/fileCommands.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/test/electron-browser/fileCommands", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reveal in OS command resolves Explorer file paths", () => {
    const explorerService = store.add(new ExplorerService());
    const sourceResource = URI.file("C:/data/source.csv");
    const normalizedResource = URI.file("C:/tmp/normalized.csv");
    const files = [
      {
        fileId: "source-file",
        fileName: "source.csv",
        resource: sourceResource,
        sourcePath: "C:/data/source.csv",
      },
      {
        fileId: "normalized-file",
        fileName: "normalized.csv",
        resource: normalizedResource,
        normalizedCsvPath: "C:/tmp/normalized.csv",
      },
    ];
    explorerService.replaceFiles(files);
    explorerService.select(sourceResource);

    const sourceResources = resolveRevealResources(
      createAccessor([[IExplorerService, explorerService]]),
      { resource: sourceResource },
    );
    const normalizedResources = resolveRevealResources(
      createAccessor([[IExplorerService, explorerService]]),
      { resource: normalizedResource },
    );

    assert.equal(sourceResources.length, 1);
    assert.equal(sourceResources[0].fsPath, toExpectedFsPath("C:/data/source.csv"));
    assert.equal(normalizedResources.length, 1);
    assert.equal(normalizedResources[0].fsPath, toExpectedFsPath("C:/tmp/normalized.csv"));
  });

  test("registered reveal in OS command delegates to native host", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("C:/data/file.csv");
    const files = [{
      fileId: "file-1",
      fileName: "file.csv",
      resource,
      sourcePath: "C:/data/file.csv",
    }];
    explorerService.replaceFiles(files);
    explorerService.select(resource);

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

    CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID)?.handler(accessor, { resource });

    assert.equal(revealedPath, toExpectedFsPath("C:/data/file.csv"));
    assert.ok(CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID));
  });

  test("reveal in OS rejects URI-only Explorer row targets", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("C:/data/file.csv");
    explorerService.replaceFiles([{
      fileId: "file-1",
      fileName: "file.csv",
      resource,
      sourcePath: "C:/data/file.csv",
    }]);
    explorerService.select(resource);

    assert.deepEqual(
      resolveRevealResources(createAccessor([[IExplorerService, explorerService]]), resource),
      [],
    );
  });

  test("registered rename command enters Explorer editable state", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("C:/data/file.csv");
    const files = [{
      fileId: "file-1",
      fileName: "file.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.select(resource);
    const accessor = createAccessor([[IExplorerService, explorerService]]);

    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, { resource });

    assert.deepEqual(explorerService.getContext().editable, {
      isEditing: true,
      resource: {
        resource,
      },
    });
  });

  test("registered rename command rejects URI-only Explorer row targets", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("C:/data/file.csv");
    explorerService.replaceFiles([{
      fileId: "file-1",
      fileName: "file.csv",
      resource,
    }]);
    explorerService.select(resource);
    const accessor = createAccessor([[IExplorerService, explorerService]]);

    CommandsRegistry.getCommand(RENAME_FILE_ITEM_COMMAND_ID)?.handler(accessor, resource);

    assert.equal(explorerService.getContext().editable, null);
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
