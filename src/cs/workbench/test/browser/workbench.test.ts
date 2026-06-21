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
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createProcessedFileSessionCommit } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { TemplateApplyWorkflowInput } from "src/cs/workbench/services/template/common/template";
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

  test("keeps chart apply states from replacing assessment badges", () => {
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
            curveTypeNeedsTemplate: true,
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
      applyStatesByFileId: new Map([
        ["unknown-file", {
          code: "unknownCurveType",
          message: "Unknown.csv has unknown curve type.",
          state: "skipped",
        }],
        ["failed-file", {
          code: "workerError",
          message: "Failed.csv could not be extracted.",
          state: "failed",
        }],
        ["queued-file", {
          state: "queued",
        }],
      ]),
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
        badgeState: file.badgeState,
        chartMessage: file.chartMessage,
        chartState: file.chartState,
        fileId: file.fileId,
      })),
      [
        {
          badgeState: {
            kind: "unknown",
            source: "assessment",
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
            source: "assessment",
          },
          chartMessage: "Failed.csv could not be extracted.",
          chartState: "failed",
          fileId: "failed-file",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "output",
            source: "assessment",
          },
          chartMessage: null,
          chartState: "queued",
          fileId: "queued-file",
        },
      ],
    );
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
      templateState: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      },
    });

    assert.equal(input.selectedFileId, null);
    assert.deepEqual(input.files.map(file => file.fileId), ["file-a"]);
    assert.equal(explorerService.selectedRawFileId, "raw-only");
    assert.equal(explorerService.selectedProcessedFileId, "raw-only");
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

  test("prioritizes selected explorer files immediately during template and calculation processing", () => {
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

      assert.deepEqual(prioritizedTemplateFileIds, ["file-b"]);
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

      assert.deepEqual(prioritizedTemplateFileIds, ["file-a", "file-b"]);
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

  test("syncs file template selections before the next frame", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const templateStateEmitter = new Emitter<unknown>();
    const templateApplyInputs: Array<{
      readonly fileTemplateSelectionsByFileId?: Record<string, unknown>;
    }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      templateApplyInputs,
      templateStateEvent: templateStateEmitter.event,
      templateStateValue: {
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {
          "file-a": createTemplateSelection("template-custom"),
        },
        templateListVersion: 1,
      },
    }));
    try {
      templateStateEmitter.fire(undefined);
      await Promise.resolve();

      assert.deepEqual(templateApplyInputs.at(-1)?.fileTemplateSelectionsByFileId, {
        "file-a": {
          kind: "template",
          templateId: "template-custom",
        },
      });
    } finally {
      bridge.dispose();
      templateStateEmitter.dispose();
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
  thumbnailPrefetches,
  templateApplyInputs,
  templateStateEvent = Event.None,
  templateStateValue,
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
  readonly thumbnailPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly templateApplyInputs?: Array<{ readonly fileTemplateSelectionsByFileId?: Record<string, unknown> }>;
  readonly templateStateEvent?: Event<unknown>;
  readonly templateStateValue?: {
    readonly formState: ReturnType<typeof createEmptyTemplateConfig>;
    readonly mode: "management";
    readonly selectedTemplateId: string | null;
    readonly selectionsByFileId: Record<string, ReturnType<typeof createTemplateSelection>>;
    readonly templateListVersion: number;
  };
  readonly visibleDetailPanes?: readonly ["inspector"] | readonly [];
}): ConstructorParameters<typeof WorkbenchDomainBridge>[0] => ({
	  assessmentQueueService: {
	    prioritizeRawTables: () => undefined,
	  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["assessmentQueueService"],
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
	  settingsService: {
	    getConductorSettings: () => undefined,
	    onDidChangeConductorSettings: Event.None,
	  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["settingsService"],
	  tableService: {
	    getViewInput: () => null,
	    open: () => undefined,
	  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["tableService"],
  templateApplyWorkflowService: {
    getFileApplyStates: () => new Map(),
    onDidChangeFileStates: Event.None,
    onDidChangeProcessingStatus: Event.None,
    prioritizeProcessingFile: (fileId: string) => prioritizedTemplateFileIds.push(fileId),
    processingStatus: {
      processed: 0,
      state: "processing",
      total: 0,
    },
    update: (input: TemplateApplyWorkflowInput) => {
      templateApplyInputs?.push(input as { readonly fileTemplateSelectionsByFileId?: Record<string, unknown> });
    },
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["templateApplyWorkflowService"],
  templateService: {
    getCachedTemplates: () => [],
    getTemplateList: () => [],
    getState: () => templateStateValue ?? ({
      formState: createEmptyTemplateConfig(),
      mode: "management",
      selectedTemplateId: null,
      selectionsByFileId: {},
      templateListVersion: 0,
	    }),
	    onDidChangeTemplateList: Event.None,
	    onDidChangeTemplateState: templateStateEvent,
	    updateViewInput: () => undefined,
	  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["templateService"],
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
