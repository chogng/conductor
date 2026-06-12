/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createExplorerPaneInput,
  createExplorerSessionWorkflow,
  resolveInitialWorkbenchViewMode,
} from "src/cs/workbench/browser/workbench";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type {
  ExplorerImportedSessionFile,
} from "src/cs/workbench/contrib/files/browser/files";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "src/cs/workbench/services/origin/common/originPlotOptions";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createProcessedFileSessionCommit } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import { createTemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";

suite("workbench/browser/workbench Explorer pane input", () => {
  test("creates table mode input from session and explorer state", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(session.getSnapshot()),
      snapshot: session.getSnapshot(),
      templateState: {
        formState: createEmptyTemplateConfig({ name: "Template A" }),
        mode: "select",
        selectedTemplateId: "template-a",
        selectionsByFileId: {
          "file-a": createTemplateSelection("template-file"),
        },
      },
    });

    assert.equal(input.selectionKind, "table");
    assert.equal(input.selectedFileId, null);
    assert.deepEqual(input.files, []);
    assert.deepEqual(input.thumbnailFiles, []);
    assert.equal(input.currentTemplateLabel, "Template A");
    assert.deepEqual(input.currentTemplateSelection, {
      kind: "template",
      templateId: "template-a",
    });
    assert.deepEqual(input.fileTemplateSelectionsByFileId?.["file-a"], {
      kind: "template",
      templateId: "template-file",
    });
  });

  test("creates chart mode input from file projection", () => {
    const session = new SessionService();
    commitRawFilesForTest(session, [
      {
        fileId: "file-a",
        fileName: "Processed A.csv",
        rowCount: 2,
        columnCount: 2,
      },
      {
        fileId: "raw-only",
        fileName: "Raw Only.csv",
        rowCount: 2,
        columnCount: 2,
      },
    ]);
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId: "file-a",
      fileName: "Processed A.csv",
      series: [{
        groupIndex: 0,
        id: "series-a",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
    const snapshot = session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    const explorerService = new ExplorerService();

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotService: createPlotService(),
      plotAxisSettings: { x: { show: true } },
      readModel,
      snapshot,
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "select",
        selectedTemplateId: null,
        selectionsByFileId: {},
      },
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "file-a");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a"]);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId?.["file-a"]?.signature, "plot:file-a");
    assert.equal(input.thumbnailPlotModelsByFileId?.["raw-only"], undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    assert.equal(explorerService.selectedProcessedFileId, null);
  });
});

suite("workbench/browser/workbench initial mode", () => {
  test("starts in table mode even when the session already has chart data", () => {
    const session = new SessionService();
    commitRawFilesForTest(session, [{
      fileId: "file-a",
      fileName: "Processed A.csv",
      rowCount: 2,
      columnCount: 2,
    }]);
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId: "file-a",
      fileName: "Processed A.csv",
      series: [{
        groupIndex: 0,
        id: "series-a",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });

    assert.equal(createSessionReadModel(session.getSnapshot()).hasChartData, true);
    assert.equal(resolveInitialWorkbenchViewMode(session.getSnapshot()), "table");
  });
});

suite("workbench/browser/workbench Explorer session workflow", () => {
  test("replacing imported files selects the first file and resets processing state", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      normalizedCsvPath: "C:/tmp/transfer.csv",
      sourceKey: "transfer.csv::24::123",
      rowCount: 2,
      columnCount: 2,
    });
    let resetProcessingWorkerCount = 0;
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => {
        resetProcessingWorkerCount += 1;
      },
    });

    workflow.handleFilesReplaced([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
    assert.equal(resetProcessingWorkerCount, 1);
  });

  test("adding imported files selects the first file when no target is active", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesAdded([importedFile]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
  });

  test("adding imported files can request table view after a successful import", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const explorerService = new ExplorerService();
    let showTableCount = 0;

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
      showTable: () => {
        showTableCount += 1;
      },
    });

    workflow.handleFilesAdded([importedFile]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
    assert.equal(showTableCount, 1);
  });

  test("replacing imported files can request table view after a successful import", () => {
    const session = new SessionService();
    const importedFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-a",
      fileName: "Transfer.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const explorerService = new ExplorerService();
    let showTableCount = 0;

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
      showTable: () => {
        showTableCount += 1;
      },
    });

    workflow.handleFilesReplaced([importedFile]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "file-a");
    assert.equal(showTableCount, 1);
  });

  test("hands off a chart mode folder import once before appending remaining files", () => {
    const session = new SessionService();
    const explorerService = new ExplorerService();
    const importedFiles = Array.from({ length: 128 }, (_value, index) =>
      createImportedSessionFileForTest({
        file: {},
        fileId: `file-${index}`,
        fileName: `Raw ${index}.csv`,
        rowCount: 2,
        columnCount: 2,
      })
    );
    let showTableCount = 0;

    createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
      showTable: () => {
        showTableCount += 1;
      },
    }).handleFilesReplaced([importedFiles[0]]);

    createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: createSessionReadModel(session.getSnapshot()).rawFiles,
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
    }).handleFilesAdded(importedFiles.slice(1));

    assert.equal(session.getSnapshot().fileOrder.length, importedFiles.length);
    assert.equal(explorerService.selectedRawFileId, "file-0");
    assert.equal(showTableCount, 1);
  });

  test("adding more files preserves selection from an earlier replace in the same workflow", () => {
    const session = new SessionService();
    const firstFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-a",
      fileName: "A.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const secondFile = createImportedSessionFileForTest({
      file: {},
      fileId: "file-b",
      fileName: "B.csv",
      rowCount: 2,
      columnCount: 2,
    });
    const explorerService = new ExplorerService();

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
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
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: [],
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
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
    explorerService.select({ kind: "table", fileId: "file-a" });

    const workflow = createExplorerSessionWorkflow({
      clearSession: session.clearSession,
      commitFileImport: session.commitFileImport,
      explorerService,
      rawFiles: files,
      removeFiles: session.removeFiles,
      removeQueuedProcessingFile: () => undefined,
      resetProcessingWorker: () => undefined,
    });

    workflow.handleFilesRemoved(["file-a"]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-b"]);
    assert.equal(explorerService.selectedRawFileId, "file-b");
  });
});

const createPlotService = (): Parameters<typeof createExplorerPaneInput>[0]["plotService"] => ({
  getCalculatedData: ({ fileId }) => {
    const normalizedFileId = String(fileId ?? "").trim();
    return normalizedFileId === "file-a"
      ? {
          activeFile: {
            fileId: "file-a",
            fileName: "Processed A.csv",
          },
          kind: "iv",
          pointsCount: 2,
          seriesList: [{
            data: [
              { x: 0, y: 1, yAbsPositive: 1, yPositive: 1 },
              { x: 1, y: 2, yAbsPositive: 2, yPositive: 2 },
            ],
            id: "series-a",
            kind: "iv",
            name: "Series A",
          }],
          signature: "plot:file-a",
          source: {
            fileId: "file-a",
            inputKind: "iv",
          },
          xDomain: [0, 1],
          xUnitLabel: "V",
          yDomain: [1, 2],
          yUnitLabel: "A",
        }
      : null;
  },
});

const commitTemplateOutputForTest = (
  session: SessionService,
  file: ProcessedEntry,
): void => {
  const commit = createProcessedFileSessionCommit(session.getSnapshot(), file);
  if (!commit) {
    return;
  }

  session.commitTemplateRun(commit.templateRun);
  session.commitCurves(commit.curves);
  session.commitMetrics(commit.metrics);
};

const commitRawFilesForTest = (
  session: SessionService,
  files: readonly SessionFile[],
): void => {
  session.commitFileImport(createFileImportResultForTest(files));
};

const createImportedSessionFileForTest = (
  file: SessionFile,
): ExplorerImportedSessionFile => ({
  ...file,
  importRecord: createImportedFileRecordForTest(file) ?? createImportedFileRecordForTest({
    fileId: "file",
    fileName: "file.csv",
  })!,
});

const createFileImportResultForTest = (
  files: readonly SessionFile[],
): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: files
    .map(createImportedFileRecordForTest)
    .filter((file): file is ImportedFileRecord => Boolean(file)),
});

const createImportedFileRecordForTest = (
  file: SessionFile,
): ImportedFileRecord | null => {
  const fileId = String(file.fileId ?? "").trim();
  if (!fileId) {
    return null;
  }

  const fileName = String(file.fileName ?? fileId).trim() || fileId;
  return {
    id: fileId,
    kind: "csv",
    name: fileName,
    raw: {
      fileId,
      fileName,
      rawTableOrder: [fileId],
      rawTablesById: {
        [fileId]: {
          columnCount: Math.max(0, Math.floor(Number(file.columnCount) || 0)),
          fileId,
          maxCellLengths: Array.isArray(file.maxCellLengths) ? file.maxCellLengths : [],
          rawTableId: fileId,
          rowCount: Math.max(0, Math.floor(Number(file.rowCount) || 0)),
          rows: {
            kind: "inline",
            values: [],
          },
          source: {
            kind: "csv",
          },
        },
      },
    },
  };
};

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
