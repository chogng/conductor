/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  commitExplorerSessionImport,
} from "src/cs/workbench/contrib/files/browser/explorerSessionImport";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type {
  PreparedFileImportInfo,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import type { ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";

suite("workbench/contrib/files/test/browser/explorerSessionImport", () => {
  test("replace commits imported records and selects the requested table file", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();

    const result = commitExplorerSessionImport({
      explorerService,
      importedFiles: [
        createPreparedFileImportInfo("file-a", "A.csv"),
        createPreparedFileImportInfo("file-b", "B.csv"),
      ],
      mode: "replace",
      selectedFileId: "file-b",
      sessionService: session,
    });

    assert.deepEqual(result.importedFileIds, ["file-a", "file-b"]);
    assert.equal(result.selectedFileId, "file-b");
    assert.equal(result.shouldNavigateToTable, true);
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a", "file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-b");
  });

  test("append selects first imported file only when no raw table file is active", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();

    const first = commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-a", "A.csv")],
      mode: "append",
      sessionService: session,
    });

    const second = commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-b", "B.csv")],
      mode: "append",
      sessionService: session,
    });

    assert.equal(first.selectedFileId, "file-a");
    assert.equal(second.selectedFileId, "file-a");
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a", "file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
  });

  test("append selects the imported file when session has files but explorer has no active raw file", () => {
    const session = new SessionService();

    commitExplorerSessionImport({
      explorerService: new ExplorerService(),
      importedFiles: [createPreparedFileImportInfo("file-a", "A.csv")],
      mode: "append",
      sessionService: session,
    });

    const explorerService = new ExplorerService();
    const result = commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-b", "B.csv")],
      mode: "append",
      sessionService: session,
    });

    assert.equal(result.selectedFileId, "file-b");
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a", "file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-b");
  });

  test("replace clears previous session data before committing imported records", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();

    commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-a", "A.csv")],
      mode: "append",
      sessionService: session,
    });
    commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-b", "B.csv")],
      mode: "replace",
      sessionService: session,
    });

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-b");
  });

  test("commits imported row records through the session owner", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();

    commitExplorerSessionImport({
      explorerService,
      importedFiles: [createPreparedFileImportInfo("file-a", "Transfer.csv")],
      mode: "append",
      sessionService: session,
    });

    assert.deepEqual(
      session.getSnapshot().filesById["file-a"].raw.tablesById["file-a"].rowStore,
      {
        kind: "memory",
        rows: [["Vg", "Id"], ["0", "1e-9"]],
      },
    );
  });
});

const createPreparedFileImportInfo = (
  fileId: string,
  fileName: string,
): PreparedFileImportInfo => ({
  columnCount: 2,
  file: {} as File,
  fileId,
  fileName,
  importRecord: createImportedFileRecord(fileId, fileName),
  lastModified: 1,
  rowCount: 2,
  size: 2,
});

const createImportedFileRecord = (
  fileId: string,
  fileName: string,
): ImportedFileRecord => ({
  id: fileId,
  kind: "csv",
  name: fileName,
  raw: {
    fileId,
    fileName,
    rawTableOrder: [fileId],
    rawTablesById: {
      [fileId]: {
        columnCount: 2,
        fileId,
        maxCellLengths: [2, 4],
        rawTableId: fileId,
        rowCount: 2,
        rows: {
          kind: "inline",
          values: [["Vg", "Id"], ["0", "1e-9"]],
        },
        source: {
          kind: "csv",
        },
      },
    },
  },
});
