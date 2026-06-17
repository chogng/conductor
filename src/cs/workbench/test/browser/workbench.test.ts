/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createSearchPlotModelFromCachedPlotDisplay,
  resolveInitialWorkbenchViewMode,
} from "src/cs/workbench/browser/workbench";
import {
  createExplorerPaneInput,
  shouldPrefetchExplorerThumbnails,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
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
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/browser/workbench Explorer pane input", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("creates table mode input from session and explorer state", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(session.getSnapshot()),
      snapshot: session.getSnapshot(),
      templateState: {
        formState: createEmptyTemplateConfig({ name: "Template A" }),
        mode: "management",
        selectedTemplateId: "template-a",
        selectionsByFileId: {
          "file-a": createTemplateSelection("template-file"),
        },
        templateListVersion: 0,
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

  test("keeps chart tree input on the stable raw file projection", () => {
    const session = store.add(new SessionService());
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
    const explorerService = store.add(new ExplorerService());

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
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "file-a");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a", "raw-only"]);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    const beforeNextTemplateOutput = input.files
      .map(file => `${file.itemKey ?? file.fileId}:${file.fileId}`)
      .join("|");
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId: "raw-only",
      fileName: "Raw Only.csv",
      series: [{
        groupIndex: 0,
        id: "series-raw-only",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
    const nextSnapshot = session.getSnapshot();
    const nextInput = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotService: createPlotService(),
      plotAxisSettings: { x: { show: true } },
      readModel: createSessionReadModel(nextSnapshot),
      snapshot: nextSnapshot,
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });
    const afterNextTemplateOutput = nextInput.files
      .map(file => `${file.itemKey ?? file.fileId}:${file.fileId}`)
      .join("|");
    assert.equal(afterNextTemplateOutput, beforeNextTemplateOutput);

    assert.equal(explorerService.selectedProcessedFileId, null);
  });

  test("keeps chart selection on raw file ids before chart data is ready", () => {
    const session = store.add(new SessionService());
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
    const explorerService = store.add(new ExplorerService());
    explorerService.select({
      candidateFileIds: ["file-a", "raw-only"],
      fileId: "raw-only",
      kind: "chart",
    });

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      plotService: createPlotService(),
      readModel,
      snapshot,
      applyStatesByFileId: new Map([
        ["raw-only", { state: "ready" }],
      ]),
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "raw-only");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a", "raw-only"]);
    assert.deepEqual(input.files.map(file => file.hasChartData), [true, false]);
    assert.deepEqual(input.files.map(file => file.chartState), ["ready", "none"]);
  });

  test("creates chart thumbnail input from processed file projection", () => {
    const session = store.add(new SessionService());
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
    const explorerService = store.add(new ExplorerService());
    explorerService.setViewLayout("thumbnail");

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
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "file-a");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a"]);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    assert.equal(explorerService.selectedProcessedFileId, null);
  });

  test("projects fast badge estimates before full assessment is ready", () => {
    const session = store.add(new SessionService());
    commitRawFilesForTest(session, [
      {
        fileId: "output-file",
        fileName: "Output_001.csv",
        relativePath: "293K/output/Output_001.csv",
        rowCount: 2,
        columnCount: 2,
      },
      {
        fileId: "header-file",
        fileName: "sample.csv",
        rowCount: 2,
        columnCount: 2,
        rows: [["Vg", "Id"], ["0", "1e-9"]],
      },
      {
        fileId: "ready-file",
        fileName: "ready.csv",
        rowCount: 2,
        columnCount: 2,
      },
    ]);
    session.commitRawTableAssessment({
      blocks: [{
        columnCount: 2,
        columns: { columns: [] },
        family: "iv",
        fileId: "ready-file",
        id: "ready-block",
        ivMode: "transfer",
        label: "Transfer",
        rawTableId: "ready-file",
        rowCount: 2,
        source: {
          fullRange: {
            endCol: 1,
            endRow: 1,
            startCol: 0,
            startRow: 0,
          },
        },
      }],
      createdAt: 1,
      diagnostics: [],
      fileId: "ready-file",
      groups: [],
      rawTableId: "ready-file",
      sourceRawTableVersion: 1,
    });

    const snapshot = session.getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(snapshot),
      snapshot,
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    assert.deepEqual(
      input.files.map(file => ({
        fileId: file.fileId,
        badgeState: file.badgeState,
        curveTypeBadgeLabel: file.curveTypeBadgeLabel,
      })),
      [
        {
          badgeState: {
            confidence: "tentative",
            kind: "ready",
            label: "output",
            message: "Fast badge from file name or path.",
            source: "fast",
          },
          curveTypeBadgeLabel: null,
          fileId: "output-file",
        },
        {
          badgeState: {
            confidence: "tentative",
            kind: "ready",
            label: "transfer",
            message: "Fast badge from visible table headers.",
            source: "fast",
          },
          curveTypeBadgeLabel: null,
          fileId: "header-file",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          curveTypeBadgeLabel: "transfer",
          fileId: "ready-file",
        },
      ],
    );
  });

  test("projects unhealthy filename-only hints as unknown fast badges", () => {
    const session = store.add(new SessionService());
    commitRawFilesForTest(session, [
      {
        assessmentHealth: "decodeFailed",
        assessmentHealthMessage: "Content is unreadable: suspected binary file or encoding mismatch.",
        columnCount: 0,
        fileId: "decode-failed",
        fileName: "Output_Vd.csv",
        rowCount: 0,
        templateEligibility: "notEligible",
      },
    ]);
    const snapshot = session.getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(snapshot),
      snapshot,
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    const badgeState = input.files[0]?.badgeState;
    if (badgeState?.kind !== "unknown") {
      assert.fail(`Expected unknown fast badge, got ${badgeState?.kind ?? "none"}.`);
    }
    assert.equal(badgeState.source, "fast");
    assert.equal(badgeState.suspectedType, "output (vd)");
  });
});

suite("workbench/browser/workbench initial mode", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("starts in table mode even when the session already has chart data", () => {
    const session = store.add(new SessionService());
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

suite("workbench/browser/workbench search plot model", () => {
  test("reads cached plot display model and prefetches on miss", () => {
    const prefetches: Array<{ readonly fileId: string | null; readonly priority: string }> = [];
    let cachedReady = false;
    const snapshot = new SessionService().getSnapshot();
    const plotService = {
      getCachedPlotDisplayModel: ({ fileId }: { readonly fileId?: string | null }) => cachedReady
        ? {
            chart: {
              model: {
                seriesList: [],
              },
            },
            fileId: fileId ?? "file-a",
            inspector: null,
            plotType: "iv",
            unitControl: null,
          }
        : null,
      prefetchPlotDisplayModel: (
        input: { readonly fileId?: string | null },
        priority: string,
      ) => {
        prefetches.push({ fileId: input.fileId ?? null, priority });
      },
    };

    assert.equal(createSearchPlotModelFromCachedPlotDisplay({
      fileId: "file-a",
      plotService,
      snapshot,
    }), null);
    assert.deepEqual(prefetches, [
      { fileId: "file-a", priority: "active" },
    ]);

    cachedReady = true;
    const model = createSearchPlotModelFromCachedPlotDisplay({
      fileId: "file-a",
      plotService,
      snapshot,
    });

    assert.deepEqual(model?.panes.map(pane => pane.id), ["chart"]);
    assert.equal(prefetches.length, 1);
  });
});

suite("workbench/browser/workbench thumbnail prefetch gating", () => {
  test("allows visible thumbnail prefetch only in chart thumbnail layout", () => {
    assert.equal(shouldPrefetchExplorerThumbnails({
      activeWorkbenchMainPart: "chart",
      viewLayout: "thumbnail",
    }), true);
    assert.equal(shouldPrefetchExplorerThumbnails({
      activeWorkbenchMainPart: "chart",
      viewLayout: "tree",
    }), false);
    assert.equal(shouldPrefetchExplorerThumbnails({
      activeWorkbenchMainPart: "table",
      viewLayout: "thumbnail",
    }), false);
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

  session.commitTemplateOutput(commit);
};

const commitRawFilesForTest = (
  session: SessionService,
  files: readonly SessionFile[],
): void => {
  session.commitFileImport(createFileImportResultForTest(files));
};

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
  const rows = Array.isArray(file.rows)
    ? file.rows as readonly (readonly string[])[]
    : [];
  return {
    id: fileId,
    kind: "csv",
    name: fileName,
    raw: {
      fileId,
      fileName,
      relativePath: file.relativePath,
      rawTableOrder: [fileId],
      rawTablesById: {
        [fileId]: {
          columnCount: Math.max(0, Math.floor(Number(file.columnCount) || 0)),
          fileId,
          health: file.assessmentHealth
            ? {
                state: file.assessmentHealth,
                message: file.assessmentHealthMessage ?? "",
              }
            : undefined,
          maxCellLengths: Array.isArray(file.maxCellLengths) ? file.maxCellLengths : [],
          rawTableId: fileId,
          rowCount: Math.max(0, Math.floor(Number(file.rowCount) || 0)),
          rows: file.assessmentHealth === "decodeFailed" ||
            file.assessmentHealth === "parseFailed" ||
            file.assessmentHealth === "unsupported"
            ? {
                kind: "unavailable",
                reason: file.assessmentHealthMessage ?? "",
              }
            : {
                kind: "inline",
                values: rows,
              },
          source: {
            kind: "csv",
          },
          templateEligibility: file.templateEligibility,
        },
      },
    },
  };
};
