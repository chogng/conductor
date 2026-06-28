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
import { IMPORT_ERROR_NOTIFICATION_ID } from "../../browser/fileConstants.ts";
import { NotificationService } from "../../../../services/notification/common/notificationService.ts";
import {
  canImportFolderWithFileService,
  collectDroppedFiles,
  collectFolderImportFiles,
  collectFolderImportFilesIncrementally,
  collectPendingImportFiles,
  FileSourceWorkflow,
  FolderImportSourceCollector,
  getPendingImportAppendBatchSize,
  getPendingImportPrepareConcurrency,
  getFolderImportSupportForFileService,
  prepareFirstPendingImportFile,
  prepareRemainingPendingImportFiles,
  type FileImportPrepareFailure,
  type FileSource,
  type PendingImportFile,
} from "../../browser/fileImportExport.ts";
import { TableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/test/browser/fileImportExport", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let notificationService: NotificationService;

  setup(() => {
    notificationService = store.add(new NotificationService());
  });

  teardown(() => {
    notificationService.clearNotifications();
  });

  test("pending import prepare concurrency scales with hardware and stays bounded", () => {
    assert.equal(getPendingImportPrepareConcurrency(Number.NaN), 8);
    assert.equal(getPendingImportPrepareConcurrency(1), 4);
    assert.equal(getPendingImportPrepareConcurrency(4), 8);
    assert.equal(getPendingImportPrepareConcurrency(8), 16);
    assert.equal(getPendingImportPrepareConcurrency(64), 16);
  });

  test("pending import append window keeps first feedback quick before bulk landing", () => {
    assert.equal(getPendingImportAppendBatchSize(199, 50), 50);
    assert.equal(getPendingImportAppendBatchSize(200, 0), 50);
    assert.equal(getPendingImportAppendBatchSize(200, 49), 50);
    assert.equal(getPendingImportAppendBatchSize(200, 50), 100);
    assert.equal(getPendingImportAppendBatchSize(520, 250), 100);
  });

  test("folder import does not require browser folder picker for non-HTML file services", () => {
    const filesService = store.add(new FileService());

    assert.deepEqual(
      getFolderImportSupportForFileService(filesService),
      { reason: null, supported: true },
    );
    assert.equal(canImportFolderWithFileService(filesService, notificationService), true);
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
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
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

  test("collectFolderImportFiles publishes current folder files before nested folders", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("2.csv", "Vg,Id\n0,2"),
        createDirectoryHandle({
          children: [
            createFileHandle("10.csv", "Vg,Id\n0,10"),
            createFileHandle("3.csv", "Vg,Id\n0,3"),
          ],
          name: "TRANSFER",
        }),
        createDirectoryHandle({
          children: [
            createFileHandle("1.csv", "Vg,Id\n0,1"),
          ],
          name: "OUTPUT",
        }),
        createFileHandle("4.tsv", "Vg\tId\n0\t4"),
        createFileHandle("1.xlsx", "workbook"),
      ],
      name: "293K",
    });

    const result = await collectBrowserFolderFiles(root);

    assert.deepEqual(
      result.files.map(file => file.relativePath),
      [
        "293K/2.csv",
        "293K/4.tsv",
        "293K/1.xlsx",
        "293K/OUTPUT/1.csv",
        "293K/TRANSFER/3.csv",
        "293K/TRANSFER/10.csv",
      ],
    );
  });

  test("collectFolderImportFiles does not let child folder reads block root file batches", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("2.csv", "Vg,Id\n0,2"),
        createFileHandle("4.csv", "Vg,Id\n0,4"),
        createDirectoryHandle({
          children: [
            createFileHandle("3.csv", "Vg,Id\n0,3"),
          ],
          name: "transfer",
        }),
      ],
      name: "293K",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const batchPaths: string[][] = [];

    const result = await collectFolderImportFilesIncrementally(folder, filesService, {
      onBatch: ({ files }) => {
        batchPaths.push(files.map(file => {
          assert.ok(typeof file.relativePath === "string");
          return file.relativePath;
        }));
      },
    });

    assert.deepEqual(batchPaths[0], ["293K/2.csv", "293K/4.csv"]);
    assert.deepEqual(batchPaths[1], ["293K/transfer/3.csv"]);
    assert.deepEqual(result.files.map(file => file.relativePath), [
      "293K/2.csv",
      "293K/4.csv",
      "293K/transfer/3.csv",
    ]);
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

  test("collectFolderImportFiles skips unsupported files before stat", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
        createFileHandle("notes.txt", "not a table"),
        createFileHandle("legacy.xls", "legacy workbook"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const originalStat = filesService.stat.bind(filesService);
    let unsupportedStatCount = 0;
    filesService.stat = async resource => {
      if (resource.path.endsWith("/notes.txt")) {
        unsupportedStatCount += 1;
        throw new Error("Unsupported files should not be statted.");
      }

      return originalStat(resource);
    };

    const result = await collectFolderImportFiles(folder, filesService);

    assert.deepEqual(result.files.map(file => file.relativePath), [
      "selected-folder/transfer.csv",
      "selected-folder/legacy.xls",
    ]);
    assert.equal(result.readFailures.length, 0);
    assert.equal(unsupportedStatCount, 0);
  });

  test("FolderImportSourceCollector delegates table support checks to format service", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
        createFileHandle("notes.txt", "not a table"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const formatService = new RecordingTableFormatService();
    const result = await new FolderImportSourceCollector(
      filesService,
      formatService,
    ).collect(folder);

    assert.deepEqual(result.files.map(file => file.relativePath), ["selected-folder/transfer.csv"]);
    assert.deepEqual([...formatService.checkedNames].sort(), ["notes.txt", "transfer.csv"]);
  });

  test("collectFolderImportFiles reports the file path when stat returns invalid metadata", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("ok.csv", "Vg,Id\n0,1"),
        createFileHandle("broken.csv", "Vg,Id\n1,2"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const originalStat = filesService.stat.bind(filesService);
    filesService.stat = async resource =>
      resource.path.endsWith("/broken.csv")
        ? undefined as never
        : originalStat(resource);

    const result = await collectFolderImportFiles(folder, filesService);

    assert.deepEqual(result.files.map(file => file.relativePath), ["selected-folder/ok.csv"]);
    assert.equal(result.readFailures.length, 1);
    assert.equal(result.readFailures[0].fileName, "broken.csv");
    assert.equal(result.readFailures[0].relativePath, "selected-folder/broken.csv");
    assert.equal(result.readFailures[0].message, "The file metadata could not be read.");
  });

  test("folder file load tolerates invalid metadata after collection", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("flaky.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const originalStat = filesService.stat.bind(filesService);
    let statCount = 0;
    filesService.stat = async resource => {
      if (resource.path.endsWith("/flaky.csv")) {
        statCount += 1;
        if (statCount > 1) {
          return undefined as never;
        }
      }

      return originalStat(resource);
    };

    const result = await collectFolderImportFiles(folder, filesService);
    const file = await result.files[0].loadFile();

    assert.equal(result.readFailures.length, 0);
    assert.equal(file.name, "flaky.csv");
    assert.equal(await file.text(), "Vg,Id\n0,1");
  });

  test("folder file content read failures do not block resource prepare", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("broken-content.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const originalReadFile = filesService.readFile.bind(filesService);
    filesService.readFile = async (resource, options) =>
      resource.path.endsWith("/broken-content.csv")
        ? undefined as never
        : originalReadFile(resource, options);

    const result = await collectFolderImportFiles(folder, filesService);
    const failedFiles: FileImportPrepareFailure[] = [];
    const pendingImportFiles = collectPendingImportFiles([...result.files]).pendingImportFiles;
    const firstImport = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      filesService,
      pendingImportFiles,
      selectedRelativePath: null,
    });

    assert.equal(firstImport.result?.prepared.fileInfo.fileName, "broken-content.csv");
    assert.equal(failedFiles.length, 0);
  });

  test("folder file prepare does not read content before table open", async () => {
    const root = createDirectoryHandle({
      children: [
        createFileHandle("flaky-content.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder",
    });
    const provider = store.add(new HTMLFileSystemProvider());
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", provider));
    const folder = await provider.registerDirectoryHandle(root);
    const originalReadFile = filesService.readFile.bind(filesService);
    let readCount = 0;
    filesService.readFile = async (resource, options) => {
      if (resource.path.endsWith("/flaky-content.csv")) {
        readCount += 1;
        if (readCount === 1) {
          return undefined as never;
        }
      }

      return originalReadFile(resource, options);
    };

    const result = await collectFolderImportFiles(folder, filesService);
    const failedFiles: FileImportPrepareFailure[] = [];
    const pendingImportFiles = collectPendingImportFiles([...result.files]).pendingImportFiles;
    const firstImport = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      filesService,
      pendingImportFiles,
      selectedRelativePath: null,
    });

    assert.equal(firstImport.result?.prepared.fileInfo.fileName, "flaky-content.csv");
    assert.equal(readCount, 0);
    assert.equal(failedFiles.length, 0);
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

  test("collectDroppedFiles skips unsupported file system handles before reading", async () => {
    let unsupportedReadCount = 0;
    const unsupportedHandle: FileSystemFileHandle = {
      kind: "file",
      name: "notes.txt",
      getFile: async () => {
        unsupportedReadCount += 1;
        return new File(["not a table"], "notes.txt", {
          lastModified: 1,
          type: "text/plain",
        });
      },
    };

    const result = await collectDroppedFiles(createDataTransfer({
      files: [],
      items: [{
        getAsFileSystemHandle: async () => createDirectoryHandle({
          children: [
            unsupportedHandle,
            createFileHandle("transfer.csv", "Vg,Id\n0,1"),
          ],
          name: "root",
        }),
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["root/transfer.csv"]);
    assert.equal(unsupportedReadCount, 0);
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

  test("collectDroppedFiles snapshots webkit entries before async handle fallback", async () => {
    let canReadEntry = true;
    const entry = createWebkitDirectoryEntry("folder", [
      createWebkitFileEntry(createCsvFile("A.csv", "Vg,Id\n0,1")),
    ]);
    const result = await collectDroppedFiles(createDataTransfer({
      files: [],
      items: [{
        getAsFileSystemHandle: async () => {
          canReadEntry = false;
          return null;
        },
        webkitGetAsEntry: () => canReadEntry ? entry : null,
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["folder/A.csv"]);
  });

  test("collectDroppedFiles falls back to data transfer item files", async () => {
    const file = createCsvFile("A.csv", "Vg,Id\n0,1");
    const result = await collectDroppedFiles(createDataTransfer({
      files: [],
      items: [{
        getAsFile: () => file,
      }],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["A.csv"]);
  });

  test("collectDroppedFiles skips unsupported FileList entries", async () => {
    const result = await collectDroppedFiles(createDataTransfer({
      files: [
        createCsvFile("transfer.csv", "Vg,Id\n0,1"),
        new File(["not a table"], "notes.txt", {
          lastModified: 1,
          type: "text/plain",
        }),
      ],
      items: [],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["transfer.csv"]);
  });

  test("collectDroppedFiles keeps FileList webkit relative paths", async () => {
    const file = createDirectoryFile("folder/A.csv", "Vg,Id\n0,1");
    const result = await collectDroppedFiles(createDataTransfer({
      files: [file],
      items: [],
    }));

    assert.deepEqual(result.map(source => source.relativePath), ["folder/A.csv"]);
  });

  test("collectPendingImportFiles keeps unsupported source guard", () => {
    const result = collectPendingImportFiles([
      createDataFileSource("notes.txt"),
      createDataFileSource("legacy.xls"),
    ]);

    assert.equal(result.hasAnyUnsupportedFiles, true);
    assert.equal(result.pendingImportFiles.length, 1);
    assert.equal(result.pendingImportFiles[0]?.sourceName, "legacy.xls");
    assert.equal(result.unsupportedCount, 1);
  });

  test("prepares the selected relative path first", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", store.add(new HTMLFileSystemProvider())));
    const result = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      filesService,
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

  test("prepare failures include relative paths in file lists", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const filesService = store.add(new FileService());
    const result = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      filesService,
      pendingImportFiles: [
        createDataPendingFile("A.csv", "folder/A.csv"),
      ],
      selectedRelativePath: null,
    });

    assert.equal(result.result, null);
    assert.equal(failedFiles.length, 1);
    assert.equal(failedFiles[0].fileName, "folder/A.csv");
  });

  test("appends remaining prepared files in pending import order", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const filesService = store.add(new FileService());
    const appendedFileNames: string[] = [];

    const acceptedCount = await prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      filesService,
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

    assert.equal(acceptedCount, 3);
    assert.deepEqual(appendedFileNames, ["A.csv", "B.csv", "C.csv"]);
    assert.equal(failedFiles.length, 0);
  });

  test("path prepare preserves table resource metadata", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const filesService = store.add(new FileService());
    const preparedPaths: string[] = [];

    const acceptedCount = await prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      filesService,
      onPreparedFiles: preparedFiles => {
        preparedPaths.push(...preparedFiles.map(file =>
          String(file.fileInfo.resource?.fsPath ?? "").replace(/\\/g, "/")
        ));
      },
      pendingImportFiles: [
        createPathPendingFile("A.csv", "folder/A.csv"),
        createPathPendingFile("B.csv", "folder/B.csv"),
      ],
      skippedIndexes: new Set<number>(),
    });

    assert.equal(acceptedCount, 2);
    assert.deepEqual(preparedPaths, ["C:/data/A.csv", "C:/data/B.csv"]);
    assert.equal(failedFiles.length, 0);
  });

  test("large path imports use larger append windows after first feedback", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const filesService = store.add(new FileService());
    const appendCounts: number[] = [];

    const acceptedCount = await prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      filesService,
      onPreparedFiles: preparedFiles => {
        appendCounts.push(preparedFiles.length);
      },
      pendingImportFiles: Array.from({ length: 200 }, (_value, index) =>
        createPathPendingFile(`${index}.csv`, `folder/${index}.csv`)),
      skippedIndexes: new Set<number>(),
    });

    assert.equal(acceptedCount, 200);
    assert.deepEqual(appendCounts, [50, 100, 50]);
    assert.equal(failedFiles.length, 0);
  });

  test("dropped file import appends instead of replacing existing files", async () => {
    const appendedFileNames: string[] = [];
    const replacedFileNames: string[] = [];
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", store.add(new HTMLFileSystemProvider())));
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async <R,>() => undefined as R | undefined,
      },
      filesService,
      getFiles: () => [{
        fileId: "existing-file",
        fileName: "Existing.csv",
        itemKey: "Existing.csv::8::1",
      }],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
      onRemoveSourceItems: () => undefined,
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
    const appendedFileNames: string[] = [];
    const filesService = store.add(new FileService());
    store.add(filesService.registerProvider("file", store.add(new HTMLFileSystemProvider())));
    const delayedSource = createDelayedLoadFileSource("A.csv", "folder/A.csv");
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async <R,>() => undefined as R | undefined,
      },
      filesService,
      getFiles: () => [],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
      onRemoveSourceItems: () => undefined,
      onReplacePreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      syncView: () => undefined,
    });

    const importPromise = (workflow as unknown as {
      importFiles(files: readonly FileSource[]): Promise<void>;
    }).importFiles([delayedSource.source]);

    await nextTurn();
    workflow.closeImportedSources();
    delayedSource.resolve();
    await importPromise;
    workflow.dispose();

    assert.deepEqual(appendedFileNames, []);
  });

  test("folder import top-level read errors include the failing path", async () => {
    const error = new Error("Permission denied") as Error & {
      fileName: string;
      relativePath: string;
    };
    error.fileName = "blocked.csv";
    error.relativePath = "293K/blocked.csv";

    const messages: string[] = [];
    const notificationDisposable = notificationService.onDidChangeToast(event => {
      if (event.kind === "show" && event.options.id === IMPORT_ERROR_NOTIFICATION_ID) {
        messages.push(event.options.message);
      }
    });
    const originalConsoleError = console.error;
    console.error = () => undefined;
    notificationService.closeNotification(IMPORT_ERROR_NOTIFICATION_ID);
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async () => {
          throw error;
        },
      },
      filesService: store.add(new FileService()),
      getFiles: () => [],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: () => undefined,
      onDraggingChange: () => undefined,
      onRemoveSourceItems: () => undefined,
      onReplacePreparedFiles: () => undefined,
      syncView: () => undefined,
    });

    try {
      await (workflow as unknown as {
        doOpenFolderDialog(): Promise<void>;
      }).doOpenFolderDialog();
    } finally {
      workflow.dispose();
      notificationDisposable.dispose();
      notificationService.closeNotification(IMPORT_ERROR_NOTIFICATION_ID);
      console.error = originalConsoleError;
    }

    const message = messages.at(-1);
    assert.ok(message?.includes("293K/blocked.csv"), String(message));
    assert.ok(message?.includes("Permission denied"), String(message));
  });
});

type TestDataTransferItem = Omit<Partial<DataTransferItem>, "webkitGetAsEntry"> & {
  readonly getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  readonly webkitGetAsEntry?: () => unknown;
};

class RecordingTableFormatService extends TableFormatService {
  public readonly checkedNames: string[] = [];

  public override canHandle(resource: URI | string | null | undefined): boolean {
    this.checkedNames.push(getResourceName(resource));
    return super.canHandle(resource);
  }
}

function getResourceName(resource: URI | string | null | undefined): string {
  if (typeof resource === "string") {
    return resource.split(/[\\/]/).pop() || resource;
  }

  const path = String(resource?.path ?? "");
  return path.split(/[\\/]/).pop() || path;
}

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

function createDirectoryFile(path: string, text: string): File {
  const name = path.split("/").pop() || path;
  const file = createCsvFile(name, text);
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: path,
  });

  return file;
}

function createStableFileHandle(file: File): FileSystemFileHandle {
  return {
    kind: "file",
    name: file.name,
    getFile: async () => file,
  };
}

function createWebkitFileEntry(file: File): FileSystemFileEntry {
  return {
    filesystem: {} as FileSystem,
    fullPath: `/${file.name}`,
    isDirectory: false,
    isFile: true,
    name: file.name,
    file: (resolve: (file: File) => void) => resolve(file),
    getParent: () => undefined,
  } as unknown as FileSystemFileEntry;
}

function createWebkitDirectoryEntry(
  name: string,
  entries: readonly unknown[],
): FileSystemDirectoryEntry {
  return {
    filesystem: {} as FileSystem,
    fullPath: `/${name}`,
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
    getParent: () => undefined,
  } as unknown as FileSystemDirectoryEntry;
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

function createDelayedLoadFileSource(
  fileName: string,
  relativePath: string,
): {
  readonly source: FileSource;
  resolve(): void;
} {
  let resolveLoad: ((file: File) => void) | null = null;
  return {
    source: {
      canUseNativePath: false,
      fileName,
      kind: "path",
      lastModified: 123,
      loadFile: () => new Promise<File>(resolve => {
        resolveLoad = resolve;
      }),
      relativePath,
      resource: URIClass.file(""),
      size: 12,
    },
    resolve: () => {
      resolveLoad?.(createCsvFile(fileName, "Vg,Id\n0,1"));
    },
  };
}

function createPathFileSource(fileName: string, relativePath: string): FileSource {
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
    itemKey: `${relativePath}::${sourceSize}::123`,
  };
}

function nextTurn(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
