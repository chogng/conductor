import assert from "assert";

import type { URI } from "../../../../../base/common/uri.ts";
import { URI as URIClass } from "../../../../../base/common/uri.ts";
import { HTMLFileSystemProvider } from "../../../../../platform/files/browser/htmlFileSystemProvider.ts";
import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "../../../../../platform/files/browser/webFileSystemAccess.ts";
import { FileService } from "../../../../../platform/files/common/fileService.ts";
import type {
  FileConverterBackend,
  FileConverterPreparedFile,
} from "../../../../services/files/common/fileConverterBackend.ts";
import {
  canImportFolderWithFileService,
  collectDroppedFiles,
  collectFolderImportFiles,
  FileSourceWorkflow,
  getFolderImportSupportForFileService,
  prepareFirstPendingImportFile,
  prepareRemainingPendingImportFiles,
  type FileImportPrepareFailure,
  type FileSource,
  type PendingImportFile,
} from "../../browser/fileImportExport.ts";

suite("workbench/contrib/files/test/browser/fileImportExport", () => {
  test("folder import does not require browser folder picker for non-HTML file services", () => {
    const filesService = new FileService();

    assert.deepEqual(
      getFolderImportSupportForFileService(filesService),
      { reason: null, supported: true },
    );
    assert.equal(canImportFolderWithFileService(filesService), true);
  });

  function createFileHandle(name: string, text: string): FileSystemFileHandle {
    return {
      kind: "file",
      name,
      getFile: async () => new File([text], name, {
        lastModified: 1,
        type: "text/csv;charset=utf-8",
      }),
    };
  }

  function createDirectoryHandle({
    children,
    name,
    useValuesOnly = false,
  }: {
    readonly children: readonly FileSystemHandle[];
    readonly name: string;
    readonly useValuesOnly?: boolean;
  }): FileSystemDirectoryHandle {
    const getChild = (childName: string): FileSystemHandle | undefined =>
      children.find(child => child.name === childName);
    const handle: FileSystemDirectoryHandle = {
      kind: "directory",
      name,
      entries: useValuesOnly
        ? undefined
        : async function* entries() {
          for (const child of children) {
            yield [child.name, child];
          }
        },
      values: useValuesOnly
        ? async function* values() {
          for (const child of children) {
            yield child;
          }
        }
        : undefined,
      getDirectoryHandle: async (childName: string) => {
        const child = getChild(childName);
        if (child?.kind === "directory") {
          return child;
        }

        throw new Error(`Directory '${childName}' was not found.`);
      },
      getFileHandle: async (childName: string) => {
        const child = getChild(childName);
        if (child?.kind === "file") {
          return child;
        }

        throw new Error(`File '${childName}' was not found.`);
      },
    };

    if (!useValuesOnly) {
      handle[Symbol.asyncIterator] = handle.entries;
    }

    return handle;
  }

  function createUnreadableDirectoryHandle(name: string, message: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name,
      entries: async function* entries() {
        throw new Error(message);
      },
      values: undefined,
      getDirectoryHandle: async () => {
        throw new Error(message);
      },
      getFileHandle: async () => {
        throw new Error(message);
      },
    };
  }

  async function collectBrowserFolderFiles(root: FileSystemDirectoryHandle) {
    const provider = new HTMLFileSystemProvider();
    const filesService = new FileService();
    filesService.registerProvider("file", provider);
    const folder = await provider.registerDirectoryHandle(root);

    return collectFolderImportFiles(folder, filesService);
  }

  test("collectFolderImportFiles reads browser directory handles that only expose values", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder",
      useValuesOnly: true,
    });

    const result = await collectBrowserFolderFiles(root);

    assert.equal(result.readFailures.length, 0);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].relativePath, "selected-folder/transfer.csv");
    assert.equal(await (await result.files[0].loadFile()).text(), "Vg,Id\n0,1");
  });

  test("collectFolderImportFiles keeps raw percent signs in browser file names", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer%25.csv", "Vg,Id\n0,1"),
        createFileHandle("transfer%raw.csv", "Vg,Id\n1,2"),
      ],
      name: "selected-folder",
    });

    const result = await collectBrowserFolderFiles(root);

    assert.equal(result.readFailures.length, 0);
    assert.deepEqual(
      result.files.map(file => file.relativePath),
      [
        "selected-folder/transfer%25.csv",
        "selected-folder/transfer%raw.csv",
      ],
    );
    assert.equal(await (await result.files[0].loadFile()).text(), "Vg,Id\n0,1");
    assert.equal(await (await result.files[1].loadFile()).text(), "Vg,Id\n1,2");
  });

  test("collectFolderImportFiles keeps readable files when a child folder cannot be read", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
        createUnreadableDirectoryHandle("blocked", "Permission denied"),
      ],
      name: "selected-folder",
    });

    const result = await collectBrowserFolderFiles(root);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].relativePath, "selected-folder/transfer.csv");
    assert.equal(result.readFailures.length, 1);
    assert.equal(result.readFailures[0].fileName, "blocked");
    assert.equal(result.readFailures[0].relativePath, "selected-folder/blocked");
    assert.equal(result.readFailures[0].message, "Permission denied");
  });

  test("collectDroppedFiles reads file system handles before FileList fallback", async () => {
    const file = createCsvFile("transfer.csv", "Vg,Id\n0,1");
    const result = await collectDroppedFiles(createDataTransfer({
      files: [file],
      items: [{
        getAsFileSystemHandle: async () => createStableFileHandle(file),
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["transfer.csv"]);
    assert.equal(result.length, 1);
  });

  test("collectDroppedFiles preserves dropped directory relative paths", async () => {
    const result = await collectDroppedFiles(createDataTransfer({
      files: [],
      items: [{
        getAsFileSystemHandle: async () => createDirectoryHandle({
          children: [
            createDirectoryHandle({
              children: [
                createFileHandle("nested.csv", "Vg,Id\n0,1"),
              ],
              name: "child",
            }),
          ],
          name: "root",
        }),
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["root/child/nested.csv"]);
  });

  test("collectDroppedFiles falls back to webkit entries", async () => {
    const result = await collectDroppedFiles(createDataTransfer({
      files: [],
      items: [{
        webkitGetAsEntry: () => createWebkitDirectoryEntry("folder", [
          createWebkitFileEntry(createCsvFile("A.csv", "Vg,Id\n0,1")),
        ]),
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["folder/A.csv"]);
  });

  test("prepares the selected relative path first", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const result = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: createFileConverterBackendStub(),
      pendingImportFiles: [
        createDataPendingFile("A.csv", "folder/A.csv"),
        createDataPendingFile("B.csv", "folder/B.csv"),
        createDataPendingFile("C.csv", "folder/C.csv"),
      ],
      selectedRelativePath: "folder/B.csv",
    });

    assert.deepEqual([...result.attemptedIndexes], [1]);
    assert.equal(result.result?.prepared.fileInfo.fileName, "B.csv");
    assert.equal(failedFiles.length, 0);
  });

  test("appends remaining prepared files in pending import order", async () => {
    const backend = createControlledPathBackend();
    const failedFiles: FileImportPrepareFailure[] = [];
    const appendedFileNames: string[] = [];

    const importPromise = prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: backend,
      onPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      pendingImportFiles: [
        createPathPendingFile("A.csv", "folder/A.csv"),
        createPathPendingFile("B.csv", "folder/B.csv"),
        createPathPendingFile("C.csv", "folder/C.csv"),
      ],
      skippedIndexes: new Set<number>(),
    });

    await nextTurn();
    assert.deepEqual(backend.fileNames, ["A.csv", "B.csv", "C.csv"]);

    backend.resolve("C.csv", "Vg,Id\n0,3");
    await nextTurn();
    assert.deepEqual(appendedFileNames, []);

    backend.resolve("A.csv", "Vg,Id\n0,1");
    await nextTurn();
    assert.deepEqual(appendedFileNames, ["A.csv"]);

    backend.resolve("B.csv", "Vg,Id\n0,2");
    const acceptedCount = await importPromise;

    assert.equal(acceptedCount, 3);
    assert.deepEqual(appendedFileNames, ["A.csv", "B.csv", "C.csv"]);
    assert.equal(failedFiles.length, 0);
  });

  test("dropped file import appends instead of replacing existing files", async () => {
    const appendedFileNames: string[] = [];
    const replacedFileNames: string[] = [];
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async () => null,
      },
      fileConverterBackendService: createFileConverterBackendStub(),
      filesService: new FileService(),
      getFiles: () => [{
        fileId: "existing-file",
        fileName: "Existing.csv",
        itemKey: "file:existing-file",
        sourceKey: "Existing.csv::8::1",
      }],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
      onErrorChange: () => undefined,
      onRemoveFiles: () => undefined,
      onReplacePreparedFiles: preparedFiles => {
        replacedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      syncView: () => undefined,
    });

    await (workflow as unknown as {
      importFiles(files: readonly FileSource[]): Promise<void>;
    }).importFiles([createDataFileSource("Added.csv")]);
    workflow.dispose();

    assert.deepEqual(appendedFileNames, ["Added.csv"]);
    assert.deepEqual(replacedFileNames, []);
  });

  test("closing imported sources prevents delayed prepared files from appending", async () => {
    const backend = createControlledPathBackend();
    const appendedFileNames: string[] = [];
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async () => null,
      },
      fileConverterBackendService: backend,
      filesService: new FileService(),
      getFiles: () => [],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
      onErrorChange: () => undefined,
      onRemoveFiles: () => undefined,
      onReplacePreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      syncView: () => undefined,
    });

    const importPromise = (workflow as unknown as {
      importFiles(files: readonly FileSource[]): Promise<void>;
    }).importFiles([
      createPathFileSource("A.csv", "folder/A.csv"),
      createPathFileSource("B.csv", "folder/B.csv"),
    ]);

    await nextTurn();
    assert.deepEqual(backend.fileNames, ["A.csv"]);

    workflow.closeImportedSources();
    backend.resolve("A.csv", "Vg,Id\n0,1");
    await importPromise;
    workflow.dispose();

    assert.deepEqual(appendedFileNames, []);
  });
});

const createFileConverterBackendStub = (
  overrides: Partial<FileConverterBackend> = {},
): FileConverterBackend => ({
  canPrepareFile: () => false,
  prepareFile: async () => ({
    ok: false,
  }),
  canReadConvertedCsv: () => false,
  readConvertedCsv: async () => ({
    ok: false,
  }),
  ...overrides,
});

type TestDataTransferItem = Partial<DataTransferItem> & {
  readonly getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  readonly webkitGetAsEntry?: () => unknown;
};

function createDataTransfer({
  files,
  items,
}: {
  readonly files: readonly File[];
  readonly items: readonly TestDataTransferItem[];
}): DataTransfer {
  return {
    files,
    items,
  } as unknown as DataTransfer;
}

function createCsvFile(fileName: string, text: string): File {
  return new File([text], fileName, {
    lastModified: 1,
    type: "text/csv;charset=utf-8",
  });
}

function createStableFileHandle(file: File): FileSystemFileHandle {
  return {
    kind: "file",
    name: file.name,
    getFile: async () => file,
  };
}

function createWebkitFileEntry(file: File) {
  return {
    isDirectory: false,
    isFile: true,
    name: file.name,
    file: (resolve: (file: File) => void) => resolve(file),
  };
}

function createWebkitDirectoryEntry(
  name: string,
  entries: readonly unknown[],
) {
  return {
    isDirectory: true,
    isFile: false,
    name,
    createReader: () => {
      let hasRead = false;
      return {
        readEntries: (resolve: (entries: readonly unknown[]) => void) => {
          if (hasRead) {
            resolve([]);
            return;
          }

          hasRead = true;
          resolve(entries);
        },
      };
    },
  };
}

function createControlledPathBackend(): FileConverterBackend & {
  readonly fileNames: readonly string[];
  resolve(fileName: string, csvText: string): void;
} {
  const requests = new Map<string, {
    readonly payload: { readonly fileName: string; readonly path: string };
    readonly resolve: (value: FileConverterPreparedFile) => void;
  }>();
  const fileNames: string[] = [];

  return {
    canPrepareFile: () => true,
    canReadConvertedCsv: () => false,
    fileNames,
    prepareFile: payload => {
      fileNames.push(payload.fileName);
      return new Promise<FileConverterPreparedFile>(resolve => {
        requests.set(payload.fileName, { payload, resolve });
      });
    },
    readConvertedCsv: async () => ({ ok: false }),
    resolve: (fileName, csvText) => {
      const request = requests.get(fileName);
      assert.ok(request, `Expected pending backend request for ${fileName}`);
      request.resolve({
        csvText,
        ok: true,
        sourcePath: request.payload.path,
      });
    },
  };
}

function createDataPendingFile(
  fileName: string,
  relativePath: string,
): PendingImportFile {
  const file = createCsvFile(fileName, "Vg,Id\n0,1");

  return createPendingFile({
    kind: "data",
    relativePath,
    resource: null,
    sourceFile: file,
    sourceName: fileName,
    sourceSize: file.size,
  });
}

function createDataFileSource(fileName: string): FileSource {
  const file = createCsvFile(fileName, "Vg,Id\n0,1");

  return {
    file,
    kind: "data",
    relativePath: null,
    resource: null,
  };
}

function createPathFileSource(
  fileName: string,
  relativePath: string,
): FileSource {
  return {
    canUseNativePath: true,
    fileName,
    kind: "path",
    lastModified: 123,
    relativePath,
    resource: URIClass.file(`C:/data/${fileName}`),
    size: 12,
  };
}

function createPathPendingFile(
  fileName: string,
  relativePath: string,
): PendingImportFile {
  return createPendingFile({
    canUseNativePath: true,
    kind: "path",
    relativePath,
    resource: URIClass.file(`C:/data/${fileName}`),
    sourceName: fileName,
    sourceSize: 12,
  });
}

function createPendingFile({
  canUseNativePath = false,
  kind,
  relativePath,
  resource,
  sourceFile,
  sourceName,
  sourceSize,
}: {
  readonly canUseNativePath?: boolean;
  readonly kind: "data" | "path";
  readonly relativePath: string;
  readonly resource: URI | null;
  readonly sourceFile?: File;
  readonly sourceName: string;
  readonly sourceSize: number;
}): PendingImportFile {
  return {
    canUseNativePath,
    finishFilePerf: () => undefined,
    kind,
    lastModified: 123,
    relativePath,
    resource,
    sourceFile,
    sourceName,
    sourceSize,
    sourceKey: `${relativePath}::${sourceSize}::123`,
  };
}

function nextTurn(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
