/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { URI } from "src/cs/base/common/uri";
import { URI as URIClass } from "src/cs/base/common/uri";
import {
  convertImportFile,
  loadConvertedCsvFile,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type {
  FileConverterBackend,
  FileConverterPreparedFile,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  prepareFirstPendingImportFile,
  prepareRemainingPendingImportFiles,
  type FileImportPrepareFailure,
  type PendingImportFile,
} from "src/cs/workbench/services/files/browser/pendingImportFiles";

suite("workbench/services/files/test/browser/fileConverter", () => {
  test("converts browser CSV files without assessment semantics", async () => {
    const file = new File(["a,b\n1,2"], "sample.csv", {
      lastModified: 123,
      type: "text/csv",
    });

    const result = await convertImportFile(
      createFileConverterBackendStub(),
      file,
      { kind: "data" },
      {
        fileName: "sample.csv",
        lastModified: 123,
        size: file.size,
      },
    );

    assert.equal(result.file, file);
    assert.equal(result.normalizedCsvPath, null);
    assert.equal(result.normalizedSizeBytes, file.size);
    assert.equal(result.sourceName, "sample.csv");
  });

  test("loads normalized CSV artifacts through the conversion boundary", async () => {
    const service = createFileConverterBackendStub({
      canReadConvertedCsv: () => true,
      readConvertedCsv: async () => ({
        csvText: "x,y\n1,2",
        ok: true,
      }),
    });

    const loaded = await loadConvertedCsvFile({
      convertedCsvReaderService: service,
      fileName: "converted.csv",
      lastModified: 456,
      normalizedCsvPath: "C:/tmp/converted.csv",
    });

    assert.ok(loaded);
    assert.equal(loaded.name, "converted.csv");
    assert.equal(await loaded.text(), "x,y\n1,2");
  });
});

suite("workbench/services/files/browser/pendingImportFiles", () => {
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
  const file = new File(["Vg,Id\n0,1"], fileName, {
    lastModified: 123,
    type: "text/csv",
  });

  return createPendingFile({
    kind: "data",
    relativePath,
    resource: null,
    sourceFile: file,
    sourceName: fileName,
    sourceSize: file.size,
  });
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
