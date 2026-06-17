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
import type { ImportFileAssessment } from "src/cs/workbench/services/assessment/common/assessment";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/test/browser/explorerSessionImport", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("replace commits imported records and selects the requested table file", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

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
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

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

  test("append ignores files already imported from the same source", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

    const first = commitExplorerSessionImport({
      explorerService,
      importedFiles: [
        createPreparedFileImportInfo("file-a", "A.csv", {
          sourceKey: "A.csv::2::1",
        }),
      ],
      mode: "append",
      sessionService: session,
    });
    const second = commitExplorerSessionImport({
      explorerService,
      importedFiles: [
        createPreparedFileImportInfo("file-a-next-id", "A.csv", {
          sourceKey: "A.csv::2::1",
        }),
      ],
      mode: "append",
      sessionService: session,
    });

    assert.deepEqual(first.importedFileIds, ["file-a"]);
    assert.deepEqual(second.importedFileIds, []);
    assert.equal(second.selectedFileId, null);
    assert.equal(second.shouldNavigateToTable, false);
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
  });

  test("append selects the imported file when session has files but explorer has no active raw file", () => {
    const session = store.add(new SessionService());

    commitExplorerSessionImport({
      explorerService: store.add(new ExplorerService()),
      importedFiles: [createPreparedFileImportInfo("file-a", "A.csv")],
      mode: "append",
      sessionService: session,
    });

    const explorerService = store.add(new ExplorerService());
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
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

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
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

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

  test("commits prepared import assessments with the imported raw table version", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

    commitExplorerSessionImport({
      explorerService,
      importedFiles: [
        createPreparedFileImportInfo("file-a", "Transfer.csv", {
          preparedAssessment: {
            curveFamily: "iv",
            curveType: "Transfer",
            curveTypeConfidence: "high",
            curveTypeNeedsTemplate: false,
            curveTypeReasons: ["Detected transfer data."],
            ivMode: "transfer",
            xAxisRole: "vg",
            xAxisRoleSource: "metadata",
          },
        }),
      ],
      mode: "append",
      sessionService: session,
    });

    const file = session.getSnapshot().filesById["file-a"];
    const assessment = file.assessmentsByRawTableId["file-a"];
    assert.equal(assessment.sourceRawTableVersion, file.rawTableVersionsById["file-a"]);
    assert.equal(assessment.blocks[0].label, "Transfer");
    assert.equal(assessment.blocks[0].family, "iv");
    assert.equal(assessment.blocks[0].ivMode, "transfer");
  });
});

const createPreparedFileImportInfo = (
  fileId: string,
  fileName: string,
  options: {
    readonly preparedAssessment?: ImportFileAssessment;
    readonly relativePath?: string | null;
    readonly sourceKey?: string;
  } = {},
): PreparedFileImportInfo => ({
  columnCount: 2,
  file: {} as File,
  fileId,
  fileName,
  importRecord: createImportedFileRecord(fileId, fileName, options),
  lastModified: 1,
  rowCount: 2,
  size: 2,
  preparedAssessment: options.preparedAssessment,
  relativePath: options.relativePath ?? null,
  sourceKey: options.sourceKey,
});

const createImportedFileRecord = (
  fileId: string,
  fileName: string,
  options: {
    readonly relativePath?: string | null;
    readonly sourceKey?: string;
  } = {},
): ImportedFileRecord => ({
  id: fileId,
  kind: "csv",
  name: fileName,
  raw: {
    fileId,
    fileName,
    lastModified: 1,
    relativePath: options.relativePath ?? null,
    ...(options.sourceKey ? { rawKey: options.sourceKey } : {}),
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
    size: 2,
  },
});
