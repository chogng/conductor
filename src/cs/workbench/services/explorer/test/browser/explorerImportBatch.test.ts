/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { URI } from "src/cs/base/common/uri";
import { URI as URIClass } from "src/cs/base/common/uri";
import type {
  FileConverterBackend,
  FileConverterPreparedFile,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import type { PendingImportFile } from "src/cs/workbench/services/files/browser/pendingImportFiles";
import {
  prepareFirstExplorerImportFile,
  prepareRemainingExplorerImportFiles,
} from "src/cs/workbench/services/explorer/browser/explorerImportBatch";
import type { ImportFilePrepareFailure } from "src/cs/workbench/services/explorer/browser/explorerImportPipeline";

suite("workbench/services/explorer/test/browser/explorerImportBatch", () => {
  test("prepares the selected relative path first", async () => {
    const failedFiles: ImportFilePrepareFailure[] = [];
    const result = await prepareFirstExplorerImportFile({
      canApplyResult: () => true,
      failedFiles,
      fileConverterBackend: createNoopBackend(),
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

  test("appends remaining prepared files in explorer order", async () => {
    const backend = createControlledPathBackend();
    const failedFiles: ImportFilePrepareFailure[] = [];
    const appendedFileNames: string[] = [];

    const importPromise = prepareRemainingExplorerImportFiles({
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

function createNoopBackend(): FileConverterBackend {
  return {
    canPrepareFile: () => false,
    canReadConvertedCsv: () => false,
    prepareFile: async () => ({ ok: false }),
    readConvertedCsv: async () => ({ ok: false }),
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
