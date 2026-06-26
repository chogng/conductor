/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { resolveInitialWorkbenchViewMode } from "src/cs/workbench/browser/workbench";
import {
  createExplorerPaneInput,
  shouldPrefetchExplorerThumbnails,
  WorkbenchDomainBridge,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import {
  TABLE_MODEL_RULE_VERSION,
  type TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import type { SliceState } from "src/cs/workbench/services/slice/common/slice";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { mergeProcessedFileIntoRecords } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  getLatestSliceRunRecord,
  type CurveRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { createTemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { SliceCommit } from "src/cs/workbench/services/slice/common/slice";
import {
  createReviewEvidenceSignature,
  type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";

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
      sliceState: createSliceStateForTest({
        templateSelectionsByFileId: {
          "file-a": createTemplateSelection("template-file"),
        },
      }),
    });

    assert.equal(input.selectionKind, "table");
    assert.equal(input.selectedFileId, null);
    assert.deepEqual(input.files, []);
    assert.deepEqual(input.quickAccessFiles, []);
    assert.deepEqual(input.thumbnailFiles, []);
    assert.deepEqual(input.fileTemplateSelectionsByFileId?.["file-a"], {
      kind: "saved",
      templateId: "template-file",
    });
  });

  test("projects TableModel queue state into raw explorer badges", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    commitRawFilesForTest(session, [{
      columnCount: 0,
      fileId: "file-a",
      fileName: "notes.csv",
      rowCount: 0,
      rows: [],
    }]);

    const snapshot = session.getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      tableModelQueueSnapshot: {
        rawTables: [{
          fileId: "file-a",
          priority: "visible",
          rawTableId: "file-a",
          sourceRawTableVersion: 1,
          state: "running",
        }],
      },
      explorerService,
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(snapshot),
      snapshot,
      sliceState: createSliceStateForTest(),
    });

    assert.deepEqual(input.files[0]?.badgeState, {
      kind: "pending",
      queueState: "running",
      source: "tableModel",
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
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, null);
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
      sliceState: createSliceStateForTest(),
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
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "raw-only");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a", "raw-only"]);
    assert.deepEqual(input.files.map(file => file.hasChartData), [true, false]);
    assert.deepEqual(input.files.map(file => file.chartState), ["ready", "none"]);
  });

  test("keeps chart slice states from replacing confirmed badges", () => {
    const snapshot = store.add(new SessionService()).getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "chart",
      plotService: createPlotService(),
      readModel: {
        hasChartData: false,
        hasSessionData: true,
        processedFileIds: [],
        processedFiles: [],
        rawFiles: [
          {
            curveType: "unknown",
            curveTypeNeedsReview: true,
            fileId: "unknown-file",
            fileName: "Unknown.csv",
          },
          {
            curveType: "transfer",
            fileId: "failed-file",
            fileName: "Failed.csv",
          },
          {
            curveType: "output",
            fileId: "queued-file",
            fileName: "Queued.csv",
          },
        ],
      },
      snapshot,
      sliceState: createSliceStateForTest({
        fileStates: new Map([
          ["unknown-file", {
            code: "unknownCurveType",
            message: "Unknown.csv has unknown curve type.",
            state: "skipped",
          }],
          ["failed-file", {
            code: "slice.failed",
            message: "Failed.csv could not be sliced.",
            state: "failed",
          }],
          ["queued-file", {
            state: "queued",
          }],
        ]),
      }),
    });

    assert.deepEqual(
      input.files.map(file => ({
        badgeState: file.badgeState,
        chartMessage: file.chartMessage,
        chartState: file.chartState,
        fileId: file.fileId,
      })),
      [
        {
	          badgeState: {
	            kind: "unknown",
	            source: "review",
	          },
          chartMessage: "Unknown.csv has unknown curve type.",
          chartState: "skipped",
          fileId: "unknown-file",
        },
        {
          badgeState: {
            confidence: "confirmed",
	            kind: "ready",
	            label: "transfer",
	            source: "review",
	          },
          chartMessage: "Failed.csv could not be sliced.",
          chartState: "failed",
          fileId: "failed-file",
        },
        {
          badgeState: {
            confidence: "confirmed",
	            kind: "ready",
	            label: "output",
	            source: "review",
	          },
          chartMessage: null,
          chartState: "queued",
          fileId: "queued-file",
        },
      ],
    );
  });

  test("uses slice file states for chart state", () => {
    const snapshot = store.add(new SessionService()).getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "chart",
      plotService: createPlotService(),
      readModel: {
        hasChartData: false,
        hasSessionData: true,
        processedFileIds: [],
        processedFiles: [],
        rawFiles: [{
          curveType: "transfer",
          fileId: "file-a",
          fileName: "A.csv",
        }],
      },
      snapshot,
      sliceState: createSliceStateForTest({
        fileStates: new Map([
          ["file-a", {
            code: "slice.failed",
            message: "Slice failed.",
            state: "failed",
          }],
        ]),
      }),
    });

    assert.equal(input.files[0]?.chartState, "failed");
    assert.equal(input.files[0]?.chartMessage, "Slice failed.");
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
    explorerService.select({
      candidateFileIds: ["file-a", "raw-only"],
      fileId: "file-a",
      kind: "table",
    });

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotService: createPlotService(),
      plotAxisSettings: { x: { show: true } },
      readModel,
      snapshot,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedFileId, "file-a");
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a"]);
    assert.deepEqual(input.quickAccessFiles?.map(file => file.fileId), ["file-a", "raw-only"]);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    assert.equal(explorerService.selectedProcessedFileId, "file-a");
  });

  test("does not invent thumbnail selection outside the shared explorer selection", () => {
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
    explorerService.select({
      candidateFileIds: ["file-a", "raw-only"],
      fileId: "raw-only",
      kind: "table",
    });

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      plotService: createPlotService(),
      readModel,
      snapshot,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectedFileId, null);
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "raw-only");
    assert.equal(explorerService.selectedProcessedFileId, "raw-only");
  });

  test("keeps raw explorer badges pending before Review or Slice records are ready", () => {
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
    session.commitTableModel({
      tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
      schemaProfileVersion: 0,
      blocks: [{
	        columnCount: 2,
	        columns: { columns: [] },
	        diagnosticCodes: [],
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
      columnProfiles: [],
      createdAt: 1,
      diagnostics: [],
      fileId: "ready-file",
      groups: [],
      rawTableId: "ready-file",
      layoutCandidates: [],
      semanticCandidates: [],
      sourceRawTableVersion: 1,
      structure: createEmptyRawTableStructure(),
    });

    const snapshot = session.getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "table",
      plotService: createPlotService(),
      readModel: createSessionReadModel(snapshot),
      snapshot,
      sliceState: createSliceStateForTest(),
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
            kind: "pending",
          },
          curveTypeBadgeLabel: null,
          fileId: "output-file",
        },
        {
          badgeState: {
            kind: "pending",
          },
          curveTypeBadgeLabel: null,
          fileId: "header-file",
        },
        {
          badgeState: {
            kind: "pending",
          },
          curveTypeBadgeLabel: null,
          fileId: "ready-file",
        },
      ],
    );
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

suite("workbench/browser/WorkbenchDomainBridge", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("prioritizes selected explorer files immediately for calculation and plot prefetch", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const prioritizedTemplateFileIds: string[] = [];
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds,
      session,
    }));
    try {
      explorerService.select({
        fileId: "file-b",
        kind: "chart",
      });

      assert.deepEqual(prioritizedTemplateFileIds, []);
      assert.deepEqual(prioritizedCalculationFileIds, ["file-b"]);
      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-b"], priority: "active" },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("prewarms visible chart plot display targets through Plot owner APIs", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotCalculatedPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a", "file-b", "file-c"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotCalculatedPrefetches,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      explorerService.setVisibleFileIds(["file-a", "file-b"], ["file-c"]);

      assert.deepEqual(plotCalculatedPrefetches, []);
      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a", "file-b"], priority: "visible" },
        { fileIds: ["file-c"], priority: "nearby" },
      ]);
      assert.deepEqual(plotInspectorPrefetches, []);
    } finally {
      bridge.dispose();
    }
  });

  test("does not prewarm inspector targets while inspector pane is hidden", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a", "file-b"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      visibleDetailPanes: [],
    }));
    try {
      explorerService.setVisibleFileIds(["file-a"], ["file-b"]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a"], priority: "visible" },
        { fileIds: ["file-b"], priority: "nearby" },
      ]);
      assert.deepEqual(plotInspectorPrefetches, []);
    } finally {
      bridge.dispose();
    }
  });

  test("keeps inspector prewarm out of bridge chart selection sync", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a", "file-b"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      visibleDetailPanes: ["inspector"],
    }));
    try {
      bridge.sync();
      explorerService.select({
        fileId: "file-b",
        kind: "chart",
      });
      await Promise.resolve();

      assert.deepEqual(uniquePrefetches(plotInspectorPrefetches), []);
    } finally {
      bridge.dispose();
    }
  });

  test("keeps startup chart prewarm chart-main only when inspector pane is visible", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      visibleDetailPanes: ["inspector"],
    }));
    try {
      bridge.sync();

      assert.deepEqual(uniquePrefetches(plotDisplayPrefetches), [
        { fileIds: ["file-a"], priority: "active" },
      ]);
      assert.deepEqual(uniquePrefetches(plotInspectorPrefetches), []);
    } finally {
      bridge.dispose();
    }
  });

  test("defers startup secondary projection while opening table source immediately", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    const tableSources: Array<TableSource | null> = [];
    commitRawFilesForTest(session, [
      {
        columnCount: 2,
        fileId: "file-a",
        fileName: "A.csv",
        rowCount: 2,
        rows: [],
        sourcePath: "/data/A.csv",
      },
    ]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      tableSources,
    }));
    try {
      bridge.sync({ deferSecondaryWork: true });

      assert.deepEqual(tableSources.map(source => source?.resource?.toString() ?? null), ["file:///data/A.csv"]);
      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "file-a",
        hasChartData: false,
      });
      assert.equal(explorerService.getPaneInput()?.selectedFileId, "file-a");
    } finally {
      bridge.dispose();
    }
  });

  test("opens selected table source key from explorer selection", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    session.commitFileImport(createMultiRawTableImportResultForTest());
    explorerService.select({
      fileId: "file-a",
      kind: "table",
      sourceKey: "source-key-b",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      tableSources,
    }));
    try {
      bridge.sync();

      assert.equal(Object.prototype.hasOwnProperty.call(tableSources.at(-1) ?? {}, "fileId"), false);
      assert.equal(tableSources.at(-1)?.sourceKey, "source-key-b");
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Workbook.xlsx");
      assert.equal(explorerService.getPaneInput()?.selectedFileId, "file-a");
      assert.equal(explorerService.getPaneInput()?.selectedSourceKey, "source-key-b");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps Explorer-local table imports out of Session reconciliation", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "local-a",
        fileName: "Local.csv",
        localImport: true,
        normalizedCsvPath: "/data/Local.csv",
        sourceKey: "local-source",
      }],
      mode: "table",
      selectedFileId: "local-a",
      selectedSourceKey: "local-source",
      selectionKind: "table",
      thumbnailFiles: [],
    });
    explorerService.select({
      candidateFileIds: ["local-a"],
      candidateSourceKeys: ["local-source"],
      fileId: "local-a",
      kind: "table",
      sourceKey: "local-source",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      tableSources,
    }));
    try {
      bridge.sync();

      assert.deepEqual(tableSources, []);
      assert.equal(explorerService.selectedRawFileId, "local-a");
      assert.equal(explorerService.selectedRawSourceKey, "local-source");
      assert.equal(explorerService.getPaneInput()?.selectedFileId, "local-a");
      assert.equal(explorerService.getPaneInput()?.files.some(file => file.localImport), true);
    } finally {
      bridge.dispose();
    }
  });

  test("backs recently interactive chart targets with recent plot and thumbnail priority", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const prioritizedTemplateFileIds: string[] = [];
    const prioritizedCalculationFileIds: string[] = [];
    const thumbnailPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a", "file-b"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds,
      session,
      thumbnailPrefetches,
    }));
    try {
      explorerService.setHoveredFileId("file-a");
      explorerService.setHoveredFileId("file-b");

      assert.deepEqual(prioritizedTemplateFileIds, []);
      assert.deepEqual(prioritizedCalculationFileIds, ["file-a", "file-b"]);
      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a"], priority: "hover" },
        { fileIds: ["file-b"], priority: "hover" },
        { fileIds: ["file-a"], priority: "recent" },
      ]);
      assert.deepEqual(thumbnailPrefetches, [
        { fileIds: ["file-a"], priority: "recent" },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("delegates cached background chart plot display targets to PlotService", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotCalculatedPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitChartFilesForTest(session, ["file-a", "file-b", "file-c"]);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      cachedPlotDisplayFileIds: ["file-a"],
      explorerService,
      plotCalculatedPrefetches,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      explorerService.setVisibleFileIds(["file-a", "file-b"], ["file-c"]);

      assert.deepEqual(plotCalculatedPrefetches, []);
      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a", "file-b"], priority: "visible" },
        { fileIds: ["file-c"], priority: "nearby" },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("syncs selected chart file before a pending frame sync", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const scheduledFrames: FrameRequestCallback[] = [];
    const canceledFrames = new Set<number>();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number): void => {
      canceledFrames.add(handle);
    }) as typeof cancelAnimationFrame;

    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const chartActiveFileIds: (string | null)[] = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartActiveFileIds,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      commitRawFilesForTest(session, [
        {
          columnCount: 2,
          fileId: "file-a",
          fileName: "A.csv",
          rowCount: 2,
          rows: [],
        },
        {
          columnCount: 2,
          fileId: "file-b",
          fileName: "B.csv",
          rowCount: 2,
          rows: [],
        },
      ]);
      commitTemplateOutputForTest(session, {
        curveType: "transfer",
        fileId: "file-a",
        fileName: "A.csv",
        series: [{
          groupIndex: 0,
          id: "series-a",
          y: [1, 2],
        }],
        xGroups: [[0, 1]],
      });
      commitTemplateOutputForTest(session, {
        curveType: "transfer",
        fileId: "file-b",
        fileName: "B.csv",
        series: [{
          groupIndex: 0,
          id: "series-b",
          y: [1, 2],
        }],
        xGroups: [[0, 1]],
      });
      explorerService.setPendingSourceFiles(true);
      assert.equal(scheduledFrames.length, 1);

      explorerService.select({
        fileId: "file-b",
        kind: "chart",
      });
      await Promise.resolve();

      assert.equal(canceledFrames.has(1), true);
      assert.equal(chartActiveFileIds.at(-1), "file-b");
    } finally {
      bridge.dispose();
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("keeps selected chart target pending before chart data is ready", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    commitRawFilesForTest(session, [
      {
        columnCount: 2,
        fileId: "file-a",
        fileName: "A.csv",
        rowCount: 2,
        rows: [],
      },
      {
        columnCount: 2,
        fileId: "file-b",
        fileName: "B.csv",
        rowCount: 2,
        rows: [],
      },
    ]);
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId: "file-a",
      fileName: "A.csv",
      series: [{
        groupIndex: 0,
        id: "series-a",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      explorerService.select({
        fileId: "file-b",
        kind: "chart",
      });
      await Promise.resolve();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "file-b",
        hasChartData: false,
      });
    } finally {
      bridge.dispose();
    }
  });

  test("syncs slice template selections into explorer pane input", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const sliceStateEmitter = new Emitter<unknown>();
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      sliceStateEvent: sliceStateEmitter.event,
      sliceTemplateSelectionsByFileId: {
        "file-a": createTemplateSelection("template-custom"),
      },
    }));
    try {
      sliceStateEmitter.fire(undefined);
      await Promise.resolve();

      assert.deepEqual(explorerService.getPaneInput()?.fileTemplateSelectionsByFileId?.["file-a"], {
        kind: "saved",
        templateId: "template-custom",
      });
    } finally {
      bridge.dispose();
      sliceStateEmitter.dispose();
    }
  });

  test("refreshes explorer raw table status from reviewChanged session events", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    commitRawFilesForTest(session, [{
      columnCount: 2,
      fileId: "file-a",
      fileName: "A.csv",
      rowCount: 2,
      rows: [],
    }]);
    const tableModel = createTableModelForTest();
    session.commitTableModel(tableModel);
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const handle = globalThis.setTimeout(() => callback(0), 0);
      return Number(handle);
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number): void => {
      globalThis.clearTimeout(handle);
    }) as typeof cancelAnimationFrame;

    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      bridge.sync();

      assert.equal(explorerService.getPaneInput()?.files[0]?.rawTableStatus?.kind, "reviewPending");

      session.commitRawTableReviews([createReviewRecordForTest(tableModel)]);
      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      const status = explorerService.getPaneInput()?.files[0]?.rawTableStatus;
      assert.equal(status?.kind, "systemRecommended");
      assert.equal(status?.kind === "systemRecommended" && status.templateFingerprint, "template:test");
    } finally {
      bridge.dispose();
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});

const createPlotDisplayModelForTest = (fileId: string): PlotDisplayModel => ({
  chart: {
    defaultXAxisTitle: "X",
    defaultYAxisTitle: "Y",
    model: {
      axisLabels: null,
      pointsCount: 0,
      seriesList: [],
      xDomain: [0, 1],
      xUnitLabel: "V",
      yDomain: [0, 1],
      yUnitLabel: "A",
    },
    plotXFactor: 1,
    plotYFactor: 1,
    xAxisTitle: "X",
    xAxisTitleContext: {
      axis: "x",
      fileId,
      pane: "chart",
      plotType: "iv",
    },
    yAxisTitle: "Y",
    yAxisTitleContext: {
      axis: "y",
      fileId,
      pane: "chart",
      plotType: "iv",
    },
    yScaleMode: "linear",
  },
  fileId,
  inspector: null,
  plotType: "iv",
  unitControl: null,
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

const createSliceStateForTest = ({
  activeFileId = null,
  fileStates = new Map(),
  queueLength = 0,
  templateSelectionsByFileId = {},
}: Partial<SliceState> = {}): SliceState => ({
  activeFileId,
  fileStates,
  queueLength,
  templateSelectionsByFileId,
});

const createDomainBridgeOptionsForTest = ({
  chartActiveFileIds,
  chartViewInputs,
  cachedPlotDisplayFileIds,
  explorerService,
  plotCalculatedPrefetches,
  plotDisplayPrefetches,
  plotInspectorPrefetches,
  prioritizedCalculationFileIds,
  prioritizedTemplateFileIds,
  session,
  sliceStateEvent = Event.None,
  sliceTemplateSelectionsByFileId,
  thumbnailPrefetches,
  tableSources,
  visibleDetailPanes = [],
}: {
  readonly chartActiveFileIds?: (string | null)[];
  readonly chartViewInputs?: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }>;
  readonly cachedPlotDisplayFileIds?: readonly string[];
  readonly explorerService: ExplorerService;
  readonly plotCalculatedPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly plotDisplayPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly plotInspectorPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly prioritizedCalculationFileIds: string[];
  readonly prioritizedTemplateFileIds: string[];
  readonly session: SessionService;
  readonly sliceStateEvent?: Event<unknown>;
  readonly sliceTemplateSelectionsByFileId?: SliceState["templateSelectionsByFileId"];
  readonly thumbnailPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly tableSources?: Array<TableSource | null>;
  readonly visibleDetailPanes?: readonly ["inspector"] | readonly [];
}): ConstructorParameters<typeof WorkbenchDomainBridge>[0] => ({
  tableModelQueueService: {
    _serviceBrand: undefined,
    enqueueRawTables: () => undefined,
    getQueueSnapshot: () => ({ rawTables: [] }),
    onDidChangeTableModelQueueState: Event.None as Event<void>,
    prioritizeRawTables: () => undefined,
  },
  calculationService: {
    prioritizeCalculationFile: fileId => {
      if (fileId) {
        prioritizedCalculationFileIds.push(fileId);
      }
    },
    prioritizeCalculationFiles: fileIds => {
      prioritizedCalculationFileIds.push(
        ...fileIds
          .map(fileId => String(fileId ?? "").trim())
          .filter(Boolean),
      );
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["calculationService"],
  chartService: {
    getState: () => ({
      hiddenLegendKeysByContext: {},
      legendPopoverContextKey: null,
      visibleDetailPanes,
    }),
    updateViewInput: (input: ChartViewInput) => {
      chartActiveFileIds?.push(input.activeFileId ?? null);
      chartViewInputs?.push({
        activeFileId: input.activeFileId ?? null,
        hasChartData: input.hasChartData,
      });
    },
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["chartService"],
  explorerService,
  layoutService: {
    activeWorkbenchMainPart: "chart",
    onDidChangeWorkbenchNavigation: Event.None,
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["layoutService"],
  plotService: {
	    ...createPlotService(),
	    getCachedPlotDisplayModel: ({ fileId }) => (cachedPlotDisplayFileIds ?? []).includes(String(fileId ?? "").trim())
	      ? createPlotDisplayModelForTest(String(fileId ?? "").trim())
	      : null,
    getState: () => ({ activePlotType: "iv" }),
    onDidChangePlotState: Event.None,
    prefetchCalculatedData: (fileIds, priority) => {
      plotCalculatedPrefetches?.push({
        fileIds: [...fileIds],
        priority,
      });
    },
    prefetchPlotDisplayModel: (input, priority) => {
      plotDisplayPrefetches?.push({
        fileIds: input.fileId ? [input.fileId] : [],
        priority,
      });
    },
    prefetchPlotDisplayModels: (inputs, priority) => {
      plotDisplayPrefetches?.push({
        fileIds: inputs
          .map(input => String(input.fileId ?? "").trim())
          .filter(Boolean),
        priority,
      });
    },
    prefetchPlotInspectorDisplayModel: (input, priority) => {
      plotInspectorPrefetches?.push({
        fileIds: input.fileId ? [input.fileId] : [],
        priority,
      });
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["plotService"],
  sessionService: session,
  sliceService: {
    _serviceBrand: undefined,
    cancel: () => undefined,
    enqueueAuto: () => undefined,
    getState: () => createSliceStateForTest({
      templateSelectionsByFileId: sliceTemplateSelectionsByFileId,
    }),
    onDidChangeSliceState: sliceStateEvent as Event<void>,
    prioritize: () => undefined,
    runWithTemplate: () => undefined,
    setTemplateSelection: () => undefined,
    submit: () => undefined,
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["sliceService"],
  settingsService: {
    getConductorSettings: () => undefined,
    onDidChangeConductorSettings: Event.None,
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["settingsService"],
  tableService: {
    getViewInput: () => null,
    open: (source: TableSource | null) => {
        tableSources?.push(source);
      },
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["tableService"],
  thumbnailPreviewService: {
    prefetch: (fileIds, priority) => {
      thumbnailPrefetches?.push({
        fileIds: [...fileIds],
        priority,
      });
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["thumbnailPreviewService"],
});

const uniquePrefetches = (
  prefetches: readonly { readonly fileIds: readonly string[]; readonly priority: string }[],
): Array<{ readonly fileIds: readonly string[]; readonly priority: string }> => {
  const seen = new Set<string>();
  const result: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
  for (const prefetch of prefetches) {
    const fileIds = [...prefetch.fileIds];
    const key = `${prefetch.priority}:${fileIds.join(",")}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      fileIds,
      priority: prefetch.priority,
    });
  }
  return result;
};

const commitChartFilesForTest = (
  session: SessionService,
  fileIds: readonly string[],
): void => {
  commitRawFilesForTest(session, fileIds.map(fileId => ({
    columnCount: 2,
    fileId,
    fileName: `${fileId}.csv`,
    rowCount: 2,
    rows: [],
  })));
  for (const fileId of fileIds) {
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId,
      fileName: `${fileId}.csv`,
      series: [{
        groupIndex: 0,
        id: `series-${fileId}`,
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
  }
};

const commitTemplateOutputForTest = (
  session: SessionService,
  file: ProcessedEntry,
): void => {
  const snapshot = session.getSnapshot();
  const records = mergeProcessedFileIntoRecords(
    snapshot.filesById,
    snapshot.fileOrder,
    file,
    snapshot,
  );
  const fileId = String(file.fileId ?? "").trim();
  const record = fileId ? records.filesById[fileId] : undefined;
  const run = record ? getLatestSliceRunRecord(record) : undefined;
  const commit: SliceCommit | null = record && run
    ? {
      run,
      series: run.outputSeriesIds
        .map(seriesId => record.seriesById[seriesId])
        .filter((series): series is SliceCommit["series"][number] => Boolean(series)),
      curves: run.outputCurveKeys
        .map(curveKey => record.curvesByKey[curveKey])
        .filter((curve): curve is CurveRecord => Boolean(curve)),
    }
    : null;
  if (!commit) {
    return;
  }

  session.commitSliceRuns([commit]);
};

const commitRawFilesForTest = (
  session: SessionService,
  files: readonly SessionFile[],
): void => {
  session.commitFileImport(createFileImportResultForTest(files));
};

const createTableModelForTest = (): TableModelRecord => ({
  tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
  schemaProfileVersion: 0,
  blocks: [{
    columnCount: 2,
    columns: { columns: [] },
    diagnosticCodes: [],
    family: "iv",
    fileId: "file-a",
    id: "block-a",
    ivMode: "transfer",
    label: "Transfer",
    rawTableId: "file-a",
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
  columnProfiles: [],
  createdAt: 1,
  diagnostics: [],
  fileId: "file-a",
  groups: [],
  rawTableId: "file-a",
  layoutCandidates: [],
  semanticCandidates: [],
  sourceRawTableVersion: 1,
  structure: createEmptyRawTableStructure(),
});

const createReviewRecordForTest = (
  tableModel: TableModelRecord,
): RawTableReviewRecord => ({
  fileId: tableModel.fileId,
  rawTableId: tableModel.rawTableId,
  sourceRawTableVersion: tableModel.sourceRawTableVersion,
  evidenceSignature: createReviewEvidenceSignature(tableModel, {
    columnCount: 2,
    fileName: "A.csv",
    rowCount: 2,
  }),
  recipeFingerprint: "recipe:test",
  userTemplateCatalogVersion: 1,
  userTemplateEffectiveFingerprint: "templates:test",
  reviewEngineVersion: 1,
  reviewPolicyVersion: 1,
  candidates: [],
  reviews: [],
  decision: {
    kind: "ready",
    reviewedTemplate: {
      candidateId: "candidate-a",
      source: {
        kind: "recipe",
        recipeId: "recipe:test",
        recipeVersion: 1,
      },
      template: {
        schemaVersion: 1,
        name: "Transfer",
        version: 1,
        blocks: [],
        stopOnError: false,
      },
      templateFingerprint: "template:test",
      review: {
        candidateId: "candidate-a",
        templateFingerprint: "template:test",
        status: "ready",
        confidence: 0.9,
        reasons: [],
        diagnostics: [],
      },
    },
    application: {
      kind: "systemRecommended",
      reason: "review.ready.systemRecommended",
    },
    summary: "Ready",
    suggestedActions: [],
  },
  createdAt: 1,
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

const createMultiRawTableImportResultForTest = (): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: [{
    id: "file-a",
    kind: "csv",
    name: "Workbook.xlsx",
    raw: {
      fileId: "file-a",
      fileName: "Workbook.xlsx",
      filePath: "/data/Workbook.xlsx",
      rawTableOrder: ["source-key-a", "source-key-b"],
      rawTablesById: {
        "source-key-a": createRawTableRecordForTest("file-a", "source-key-a"),
        "source-key-b": createRawTableRecordForTest("file-a", "source-key-b"),
      },
    },
  }],
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
      filePath: typeof file.sourcePath === "string" ? file.sourcePath : null,
      relativePath: file.relativePath,
      rawTableOrder: [fileId],
      rawTablesById: {
        [fileId]: {
          columnCount: Math.max(0, Math.floor(Number(file.columnCount) || 0)),
          fileId,
          health: file.rawTableHealth
            ? {
                state: file.rawTableHealth,
                message: file.rawTableHealthMessage ?? "",
              }
            : undefined,
          maxCellLengths: Array.isArray(file.maxCellLengths) ? file.maxCellLengths : [],
          rawTableId: fileId,
          rowCount: Math.max(0, Math.floor(Number(file.rowCount) || 0)),
          rows: file.rawTableHealth === "decodeFailed" ||
            file.rawTableHealth === "parseFailed" ||
            file.rawTableHealth === "unsupported"
            ? {
                kind: "unavailable",
                reason: file.rawTableHealthMessage ?? "",
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

const createRawTableRecordForTest = (
  fileId: string,
  rawTableId: string,
): ImportedFileRecord["raw"]["rawTablesById"][string] => ({
  columnCount: 2,
  fileId,
  maxCellLengths: [1, 1],
  rawTableId,
  rowCount: 1,
  rows: {
    kind: "inline",
    values: [["x", "y"]],
  },
  source: {
    kind: "csv",
  },
});
