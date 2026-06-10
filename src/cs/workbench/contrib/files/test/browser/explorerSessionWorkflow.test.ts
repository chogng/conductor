/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createExplorerSessionWorkflow } from "src/cs/workbench/contrib/files/browser/explorerSessionWorkflow";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import type {
  ExplorerImportedSessionFile,
} from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ImportedFileRecord } from "src/cs/workbench/services/files/common/files";

suite("workbench/contrib/files/browser/explorerSessionWorkflow", () => {
  test("replacing imported files selects the first file and resets preview state", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFile({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      normalizedCsvPath: "C:/tmp/transfer.csv",
      sourceKey: "transfer.csv::24::123",
      rowCount: 2,
      columnCount: 2,
    });
    let invalidated = 0;
    let resetPreviewWorkerCount = 0;
    let resetProcessingWorkerCount = 0;
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      clearPreviewState: () => undefined,
      commitFileImport: session.commitFileImport,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => {
        invalidated += 1;
      },
      explorerService,
      previewFile: null,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetPreviewWorker: () => {
        resetPreviewWorkerCount += 1;
      },
      resetProcessingWorker: () => {
        resetProcessingWorkerCount += 1;
      },
    });

    workflow.handleFilesReplaced([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
    assert.equal(invalidated, 2);
    assert.equal(resetPreviewWorkerCount, 1);
    assert.equal(resetProcessingWorkerCount, 1);
  });

  test("adding imported files selects the first file when no target is active", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFile({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      rowCount: 2,
      columnCount: 2,
    });
    let invalidated = 0;
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      clearPreviewState: () => undefined,
      commitFileImport: session.commitFileImport,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => {
        invalidated += 1;
      },
      explorerService,
      previewFile: null,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetPreviewWorker: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesAdded([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
    assert.equal(invalidated, 1);
  });

  test("adding more files preserves selection from an earlier replace in the same workflow", () => {
    const session = new SessionService();
    const firstFile = createImportedSessionFile({
      file: {},
      fileId: "file-a",
      fileName: "A.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const secondFile = createImportedSessionFile({
      file: {},
      fileId: "file-b",
      fileName: "B.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      clearPreviewState: () => undefined,
      commitFileImport: session.commitFileImport,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => undefined,
      explorerService,
      previewFile: null,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetPreviewWorker: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesReplaced([firstFile]);
    workflow.handleFilesAdded([secondFile]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a", "file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
  });

  test("commits imported file records through session import results", () => {
    const session = new SessionService();
    const importedFile: ExplorerImportedSessionFile = {
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      importRecord: createImportedFileRecord("file-a", "Transfer.csv"),
    };
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      clearPreviewState: () => undefined,
      commitFileImport: session.commitFileImport,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => undefined,
      explorerService,
      previewFile: null,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetPreviewWorker: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesAdded([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.deepEqual(snapshot.filesById["file-a"].raw.tablesById["file-a"].rowStore, {
      kind: "memory",
      rows: [["Vg", "Id"], ["0", "1e-9"]],
    });
    assert.equal(explorerService.selectedRawFileId, "file-a");
  });

  test("removing selected files delegates next selection to explorer service", () => {
    const session = new SessionService();
    const files: SessionFile[] = [
      {
        fileId: "file-a",
        fileName: "A.csv",
        rowCount: 1,
        columnCount: 1,
      },
      {
        fileId: "file-b",
        fileName: "B.csv",
        rowCount: 1,
        columnCount: 1,
      },
    ];
    const explorerService = new ExplorerService();
    session.commitFileImport({
      createdAt: 1,
      diagnostics: [],
      files: files.map(file => createImportedFileRecord(
        String(file.fileId),
        String(file.fileName),
      )),
    });
    explorerService.setSelectedRawFileId("file-a");

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      clearPreviewState: () => undefined,
      commitFileImport: session.commitFileImport,
      disposePreviewFileCache: () => undefined,
      invalidatePreviewRequests: () => undefined,
      explorerService,
      previewFile: null,
      rawFiles: files,
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetPreviewWorker: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesRemoved(["file-a"]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-b");
  });
});

const createImportedSessionFile = (
  file: SessionFile,
): ExplorerImportedSessionFile => ({
  ...file,
  importRecord: createImportedFileRecord(
    String(file.fileId ?? ""),
    String(file.fileName ?? file.fileId ?? ""),
  ),
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
