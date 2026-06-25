/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { TableFileService } from "src/cs/workbench/services/tableFile/browser/tableFileService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/tableFile/test/browser/tableFileService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("rejects unsupported resources at the table-file owner boundary", () => {
    const session = store.add(new SessionService());
    const tableFileService = new TableFileService(session);

    assert.throws(
      () => tableFileService.commitImport(createImportResult("notes.txt")),
      /Unsupported table file: notes\.txt/,
    );
    assert.deepEqual(session.getSnapshot().fileOrder, []);
  });

  test("commits supported TSV imports", () => {
    const session = store.add(new SessionService());
    const tableFileService = new TableFileService(session);

    const result = tableFileService.commitImport(createImportResult("transfer.tsv"));

    assert.deepEqual(result.importedFileIds, ["file-a"]);
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
  });

  test("allows display names when raw file name keeps the supported suffix", () => {
    const session = store.add(new SessionService());
    const tableFileService = new TableFileService(session);

    const result = tableFileService.commitImport({
      ...createImportResult("Transfer"),
      files: [createImportedFileRecord("Transfer", "Transfer.csv")],
    });

    assert.deepEqual(result.importedFileIds, ["file-a"]);
  });
});

const createImportResult = (
  fileName: string,
): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: [createImportedFileRecord(fileName)],
});

const createImportedFileRecord = (
  fileName: string,
  rawFileName = fileName,
): ImportedFileRecord => ({
  id: "file-a",
  kind: "csv",
  name: fileName,
  raw: {
    fileId: "file-a",
    fileName: rawFileName,
    rawTableOrder: ["file-a"],
    rawTablesById: {
      "file-a": {
        columnCount: 2,
        fileId: "file-a",
        maxCellLengths: [2, 5],
        rawTableId: "file-a",
        rowCount: 2,
        rows: {
          kind: "inline",
          values: [["Gate", "Drain"], ["0", "1e-9"]],
        },
        source: {
          kind: "csv",
        },
      },
    },
  },
});
