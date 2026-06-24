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
import type {
  FileConverterBackend,
  FileConverterPreparePayload,
  FileConverterPreparedFile,
} from "../../../../services/files/common/fileConverterBackend.ts";
import {
  createImportTableFactsSeedFromRows,
} from "../../../../services/tableFacts/browser/importTableFactsSeed.ts";
import { NotificationService } from "../../../../services/notification/common/notificationService.ts";
import {
  canImportFolderWithFileService,
  collectDroppedFiles,
  collectFolderImportFiles,
  collectPendingImportFiles,
  FileSourceWorkflow,
  getPendingImportAppendBatchSize,
  getPendingImportPrepareConcurrency,
  getFolderImportSupportForFileService,
  prepareFirstPendingImportFile,
  prepareRemainingPendingImportFiles,
  type FileImportPrepareFailure,
  type FileSource,
  type PendingImportFile,
} from "../../browser/fileImportExport.ts";
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

  test("collectFolderImportFiles follows Explorer tree order for nested folders", async () => {
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
        createFileHandle("1.xlsx", "workbook"),
      ],
      name: "293K",
    });

    const result = await collectBrowserFolderFiles(root);

    assert.deepEqual(
      result.files.map(file => file.relativePath),
      [
        "293K/OUTPUT/1.csv",
        "293K/TRANSFER/3.csv",
        "293K/TRANSFER/10.csv",
        "293K/2.csv",
        "293K/1.xlsx",
      ],
    );
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

  test("folder file load content failures become relative path prepare failures", async () => {
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
      fileConverterBackend: createFileConverterBackendStub(),
      pendingImportFiles,
      selectedRelativePath: null,
    });

    assert.equal(firstImport.result, null);
    assert.equal(failedFiles.length, 1);
    assert.equal(failedFiles[0].fileName, "selected-folder/broken-content.csv");
    assert.equal(failedFiles[0].message, "The file content could not be read.");
  });

  test("folder file load retries transient invalid file content", async () => {
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
      fileConverterBackend: createFileConverterBackendStub(),
      pendingImportFiles,
      selectedRelativePath: null,
    });

    assert.equal(firstImport.result?.prepared.fileInfo.fileName, "flaky-content.csv");
    assert.equal(failedFiles.length, 0);
  });

  test("creates prepared table facts from converted inline rows", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const firstImport = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      createPreparedTableFactsSeedFromRows: createImportTableFactsSeedFromRows,
      failedFiles,
      fileConverterBackend: createFileConverterBackendStub(),
      pendingImportFiles: [
        createDataPendingFile("transfer.csv", "device/transfer.csv"),
      ],
      selectedRelativePath: null,
    });

    const assessment = firstImport.result?.prepared.fileInfo.preparedTableFactsSeed;
    assert.ok(assessment);
    assert.equal(assessment.curveFamily, "iv");
    assert.equal(assessment.ivMode, "transfer");
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

  test("collectDroppedFiles keeps FileList webkit relative paths", async () => {
    const file = createDirectoryFile("folder/A.csv", "Vg,Id\n0,1");
    const result = await collectDroppedFiles(createDataTransfer({
      files: [file],
      items: [],
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

  test("prepare failures include relative paths in file lists", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const result = await prepareFirstPendingImportFile({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: createFileConverterBackendStub(),
      pendingImportFiles: [
        createPathPendingFile("A.csv", "folder/A.csv"),
      ],
      selectedRelativePath: null,
    });

    assert.equal(result.result, null);
    assert.equal(failedFiles.length, 1);
    assert.equal(failedFiles[0].fileName, "folder/A.csv");
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

  test("passes source metadata to path batch prepare backend", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const payloads: FileConverterPreparePayload[] = [];
    const backend = createFileConverterBackendStub({
      canPrepareFile: () => true,
      prepareFilesStream: async (nextPayloads, onResult) => {
        payloads.push(...nextPayloads);
        const results = nextPayloads.map((payload, index): FileConverterPreparedFile => ({
          csvText: `Vg,Id\n0,${index}`,
          ok: true,
          sourcePath: payload.path,
        }));
        results.forEach((result, index) => onResult({ index, result }));
        return results;
      },
    });

    const acceptedCount = await prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: backend,
      onPreparedFiles: () => undefined,
      pendingImportFiles: [
        createPathPendingFile("A.csv", "folder/A.csv"),
        createPathPendingFile("B.csv", "folder/B.csv"),
      ],
      skippedIndexes: new Set<number>(),
    });

    assert.equal(acceptedCount, 2);
    assert.deepEqual(payloads.map(payload => ({
      fileName: payload.fileName,
      path: payload.path,
      sourceMtimeMs: payload.sourceMtimeMs,
      sourceSizeBytes: payload.sourceSizeBytes,
    })), [
      {
        fileName: "A.csv",
        path: "/C:/data/A.csv",
        sourceMtimeMs: 123,
        sourceSizeBytes: 12,
      },
      {
        fileName: "B.csv",
        path: "/C:/data/B.csv",
        sourceMtimeMs: 123,
        sourceSizeBytes: 12,
      },
    ]);
    assert.equal(failedFiles.length, 0);
  });

  test("streams large path batch imports through a larger append window after first feedback", async () => {
    const failedFiles: FileImportPrepareFailure[] = [];
    const appendCounts: number[] = [];
    const backend = createFileConverterBackendStub({
      canPrepareFile: () => true,
      prepareFilesStream: async (payloads, onResult) => {
        const results = payloads.map((payload, index): FileConverterPreparedFile => ({
          csvText: `Vg,Id\n0,${index}`,
          ok: true,
          sourcePath: payload.path,
        }));
        results.forEach((result, index) => onResult({ index, result }));
        return results;
      },
    });

    const acceptedCount = await prepareRemainingPendingImportFiles({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: backend,
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
    const workflow = new FileSourceWorkflow({
      commandService: {
        executeCommand: async <R,>() => undefined as R | undefined,
      },
      fileConverterBackendService: createFileConverterBackendStub(),
      filesService: store.add(new FileService()),
      getFiles: () => [{
        fileId: "existing-file",
        fileName: "Existing.csv",
        itemKey: "file:existing-file",
        sourceKey: "Existing.csv::8::1",
      }],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
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
        executeCommand: async <R,>() => undefined as R | undefined,
      },
      fileConverterBackendService: backend,
      filesService: store.add(new FileService()),
      getFiles: () => [],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: preparedFiles => {
        appendedFileNames.push(...preparedFiles.map(file => file.fileInfo.fileName));
      },
      onDraggingChange: () => undefined,
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
      fileConverterBackendService: createFileConverterBackendStub(),
      filesService: store.add(new FileService()),
      getFiles: () => [],
      getSelectedRelativePath: () => null,
      isDisposed: () => false,
      notificationService,
      onAppendPreparedFiles: () => undefined,
      onDraggingChange: () => undefined,
      onRemoveFiles: () => undefined,
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

type TestDataTransferItem = Omit<Partial<DataTransferItem>, "webkitGetAsEntry"> & {
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

function createControlledPathBackend(): FileConverterBackend & {
  readonly fileNames: readonly string[];
  resolve(fileName: string, csvText: string): void;
} {
  const requests = new Map<string, {
    readonly payload: FileConverterPreparePayload;
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
    sourceKey: `${relativePath}::${sourceSize}::123`,
  };
}

function nextTurn(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
