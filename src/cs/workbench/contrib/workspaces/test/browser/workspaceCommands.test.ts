import assert from "assert";

import { Event } from "../../../../../base/common/event.ts";
import { Disposable } from "../../../../../base/common/lifecycle.ts";
import { URI } from "../../../../../base/common/uri.ts";
import {
  IFileDialogService,
  type IOpenDialogOptions,
} from "../../../../../platform/dialogs/common/dialogs.ts";
import {
  FileType,
  IFileService,
  type IFileContent,
  type IFileService as IFileServiceType,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "../../../../../platform/files/common/files.ts";
import type { ServicesAccessor, ServiceIdentifier } from "../../../../../platform/instantiation/common/instantiation.ts";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
  type IStorageService as IStorageServiceType,
} from "../../../../../platform/storage/common/storage.ts";
import { AbstractStorageService } from "../../../../../platform/storage/common/storageService.ts";
import { IPathService, type IPathService as IPathServiceType } from "../../../../../workbench/services/path/common/pathService.ts";
import { addWorkspaceFolderHandler } from "../../browser/workspaceCommands.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/workspaces/test/browser/workspaceCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add workspace folder command returns the selected folder", async () => {
    const selectedFolder = URI.file("/data/import");
    const userHome = URI.file("/data");
    let openDialogDefaultUri: URI | undefined;
    const storageService = new TestStorageService();
    const accessor = createAccessor([
      [IFileService, new TestFileService()],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async (options: IOpenDialogOptions) => {
          openDialogDefaultUri = options.defaultUri;
          return [selectedFolder];
        },
      }],
      [IPathService, createPathService(userHome)],
      [IStorageService, storageService],
    ]);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder?.toString(), selectedFolder.toString());
    assert.equal(openDialogDefaultUri?.toString(), userHome.toString());
    assert.equal(
      storageService.get("workspaces.lastSelectedFolder", StorageScope.PROFILE),
      selectedFolder.toString(),
    );
  });

  test("add workspace folder command opens from the last selected folder when it still exists", async () => {
    const lastSelectedFolder = URI.file("/previous/import");
    const selectedFolder = URI.file("/next/import");
    const userHome = URI.file("/data");
    let openDialogDefaultUri: URI | undefined;
    const storageService = new TestStorageService();
    storeLastSelectedFolder(storageService, lastSelectedFolder);
    const accessor = createAccessor([
      [IFileService, new TestFileService([lastSelectedFolder])],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async (options: IOpenDialogOptions) => {
          openDialogDefaultUri = options.defaultUri;
          return [selectedFolder];
        },
      }],
      [IPathService, createPathService(userHome)],
      [IStorageService, storageService],
    ]);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder?.toString(), selectedFolder.toString());
    assert.equal(openDialogDefaultUri?.toString(), lastSelectedFolder.toString());
    assert.equal(
      storageService.get("workspaces.lastSelectedFolder", StorageScope.PROFILE),
      selectedFolder.toString(),
    );
  });

  test("add workspace folder command resolves services before async default folder lookup", async () => {
    const lastSelectedFolder = URI.file("/previous/import");
    const selectedFolder = URI.file("/next/import");
    const userHome = URI.file("/data");
    const storageService = new TestStorageService();
    storeLastSelectedFolder(storageService, lastSelectedFolder);
    let accessorIsValid = true;
    const accessor = createAccessor([
      [IFileService, new TestFileService([lastSelectedFolder], () => {
        accessorIsValid = false;
      })],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async () => [selectedFolder],
      }],
      [IPathService, createPathService(userHome)],
      [IStorageService, storageService],
    ], () => accessorIsValid);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder?.toString(), selectedFolder.toString());
  });

  test("add workspace folder command falls back to user home when the last selected folder is missing", async () => {
    const lastSelectedFolder = URI.file("/missing/import");
    const selectedFolder = URI.file("/data/import");
    const userHome = URI.file("/data");
    let openDialogDefaultUri: URI | undefined;
    const storageService = new TestStorageService();
    storeLastSelectedFolder(storageService, lastSelectedFolder);
    const accessor = createAccessor([
      [IFileService, new TestFileService()],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async (options: IOpenDialogOptions) => {
          openDialogDefaultUri = options.defaultUri;
          return [selectedFolder];
        },
      }],
      [IPathService, createPathService(userHome)],
      [IStorageService, storageService],
    ]);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder?.toString(), selectedFolder.toString());
    assert.equal(openDialogDefaultUri?.toString(), userHome.toString());
  });

  test("add workspace folder command does not overwrite the last selected folder when canceled", async () => {
    const lastSelectedFolder = URI.file("/previous/import");
    const userHome = URI.file("/data");
    const storageService = new TestStorageService();
    storeLastSelectedFolder(storageService, lastSelectedFolder);
    const accessor = createAccessor([
      [IFileService, new TestFileService([lastSelectedFolder])],
      [IFileDialogService, {
        _serviceBrand: undefined,
        showOpenDialog: async () => undefined,
      }],
      [IPathService, createPathService(userHome)],
      [IStorageService, storageService],
    ]);

    const folder = await addWorkspaceFolderHandler(accessor);

    assert.equal(folder, null);
    assert.equal(
      storageService.get("workspaces.lastSelectedFolder", StorageScope.PROFILE),
      lastSelectedFolder.toString(),
    );
  });
});

function createPathService(userHome: URI): IPathServiceType {
  return {
    _serviceBrand: undefined,
    defaultUriScheme: "file",
    fileURI: async (path: string) => URI.file(path),
    path: Promise.resolve({} as IPathServiceType["path"] extends Promise<infer T> ? T : never),
    resolvedUserHome: userHome,
    userHome: () => userHome,
  };
}

function storeLastSelectedFolder(
  storageService: IStorageServiceType,
  folder: URI,
): void {
  storageService.store(
    "workspaces.lastSelectedFolder",
    folder.toString(),
    StorageScope.PROFILE,
    StorageTarget.USER,
  );
}

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
  canUseAccessor: () => boolean = () => true,
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T => {
      if (!canUseAccessor()) {
        throw new Error("Service accessor is only valid during invocation.");
      }

      return values.get(id as ServiceIdentifier<unknown>) as T;
    },
  };
}

class TestStorageService extends AbstractStorageService implements IStorageServiceType {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    return [...this.values.keys()]
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

class TestFileService implements IFileServiceType {
  public readonly _serviceBrand = undefined;
  public readonly onDidFilesChange = Event.None;
  private readonly existingResources: Set<string>;

  constructor(
    existingResources: readonly URI[] = [],
    private readonly onExists?: () => void,
  ) {
    this.existingResources = new Set(existingResources.map(resource => resource.toString()));
  }

  public registerProvider(_scheme: string, _provider: IFileSystemProvider): Disposable {
    return Disposable.None;
  }

  public getProvider(_scheme: string): IFileSystemProvider | undefined {
    return undefined;
  }

  public exists(resource: URI): Promise<boolean> {
    this.onExists?.();
    return Promise.resolve(this.existingResources.has(resource.toString()));
  }

  public readDir(_resource: URI): Promise<readonly [string, FileType][]> {
    throw new Error("Not implemented.");
  }

  public readFile(_resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
    throw new Error("Not implemented.");
  }

  public writeFile(_resource: URI, _content: string): Promise<void> {
    throw new Error("Not implemented.");
  }

  public realpath(resource: URI): Promise<URI> {
    return Promise.resolve(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return Promise.resolve({
      ctime: 0,
      mtime: 0,
      path: resource.fsPath,
      size: 0,
      type: FileType.Directory,
    });
  }

  public watch(_resource: URI, _options?: IWatchOptions): Disposable {
    return Disposable.None;
  }
}
