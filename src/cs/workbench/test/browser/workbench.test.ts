/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { resolveInitialWorkbenchViewMode } from "src/cs/workbench/browser/workbench";
import {
  createSessionExplorerFacts,
  createExplorerPaneInput,
  shouldPrefetchExplorerThumbnails,
  WorkbenchDomainBridge,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/session/common/session";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import {
  commitRawFilesForTest,
  commitTemplateOutputForTest,
} from "src/cs/workbench/services/session/test/common/sessionTestRecords";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { createTemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { SliceState, SliceUriTarget } from "src/cs/workbench/services/slice/common/slice";

type ThumbnailPrefetchForTest = {
  readonly priority: string;
  readonly targets: readonly {
    readonly fileId: string;
    readonly targetResource?: string | null;
    readonly targetSheetId?: string | null;
  }[];
};

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
      sessionFacts: createSessionExplorerFacts(session.getSnapshot()),
      sliceState: createSliceStateForTest({
        templateSelectionsByFileId: {
          "file-a": createTemplateSelection("template-file"),
        },
      }),
    });

    assert.equal(input.selectionKind, "table");
    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.files, []);
    assert.deepEqual(input.quickAccessFiles, []);
    assert.deepEqual(input.thumbnailFiles, []);
    assert.deepEqual(input.fileTemplateSelectionsByFileId?.["file-a"], {
      kind: "saved",
      templateId: "template-file",
    });
  });

  test("does not project Session raw rows into chart tree input", () => {
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
    const sessionFacts = createSessionExplorerFacts(snapshot);
    const explorerService = store.add(new ExplorerService());

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotService: createPlotService(),
      plotAxisSettings: { x: { show: true } },
      sessionFacts,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.files.map(file => file.fileId), []);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    const beforeNextTemplateOutput = input.files
      .map(file => `${file.itemKey ?? file.fileId}:${file.fileId}`)
      .join("|");
    commitTemplateOutputForTest(session, {
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
      sessionFacts: createSessionExplorerFacts(nextSnapshot),
      sliceState: createSliceStateForTest(),
    });
    const afterNextTemplateOutput = nextInput.files
      .map(file => `${file.itemKey ?? file.fileId}:${file.fileId}`)
      .join("|");
    assert.equal(afterNextTemplateOutput, beforeNextTemplateOutput);

    assert.equal(explorerService.selectedResource, null);
  });

  test("does not keep chart selection from Session raw ids without Explorer URI rows", () => {
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
    const sessionFacts = createSessionExplorerFacts(snapshot);
    const explorerService = store.add(new ExplorerService());
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      plotService: createPlotService(),
      sessionFacts,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.files.map(file => file.fileId), []);
    assert.deepEqual(input.files.map(file => file.hasChartData), []);
    assert.deepEqual(input.files.map(file => file.chartState), []);
  });

  test("does not project slice states without Explorer URI rows", () => {
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "chart",
      plotService: createPlotService(),
      sessionFacts: {
        chartDataFileIds: [],
        sessionFileIds: ["unknown-file", "failed-file", "queued-file"],
        thumbnailFiles: [],
      },
      sliceState: createSliceStateForTest({
        fileStates: new Map([
          ["unknown-file", {
            code: "slice.skipped",
            message: "Unknown.csv was skipped.",
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

    assert.deepEqual(input.files, []);
  });

  test("does not project file-state-only Session rows into chart state", () => {
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "chart",
      plotService: createPlotService(),
      sessionFacts: {
        chartDataFileIds: [],
        sessionFileIds: ["file-a"],
        thumbnailFiles: [],
      },
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

    assert.deepEqual(input.files, []);
  });

  test("creates chart thumbnail input from processed files", () => {
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
    const sessionFacts = createSessionExplorerFacts(snapshot);
    const explorerService = store.add(new ExplorerService());
    explorerService.setViewLayout("thumbnail");
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotService: createPlotService(),
      plotAxisSettings: { x: { show: true } },
      sessionFacts,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.files.map(file => file.fileId), []);
    assert.deepEqual(input.quickAccessFiles?.map(file => file.fileId), []);
    assert.deepEqual(input.thumbnailFiles.map(file => file.fileId), ["file-a"]);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    assert.equal(explorerService.selectedResource, null);
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
    const sessionFacts = createSessionExplorerFacts(snapshot);
    const explorerService = store.add(new ExplorerService());
    explorerService.setViewLayout("thumbnail");
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      plotService: createPlotService(),
      sessionFacts,
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.files.map(file => file.fileId), []);
    assert.equal(explorerService.selectedResource, null);
  });

  test("does not project Session raw rows into Explorer rows", () => {
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
    const snapshot = session.getSnapshot();
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "table",
      plotService: createPlotService(),
      sessionFacts: createSessionExplorerFacts(snapshot),
      sliceState: createSliceStateForTest(),
    });

    assert.deepEqual(input.files, []);
  });

});

suite("workbench/browser/workbench initial mode", () => {
  test("starts in table mode without reading Session state", () => {
    assert.equal(resolveInitialWorkbenchViewMode(), "table");
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

  test("prioritizes selected explorer URI files immediately for plot prefetch", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/B.csv");
    const prioritizedTemplateFileIds: string[] = [];
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly targetResource?: string | null;
      readonly targetSheetId?: string | null;
    }> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-b",
        fileName: "B.csv",
        resource,
      }],
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds,
      session,
      uriSliceTarget: { resource },
    }));
    try {
      explorerService.select({
        candidateResources: [{ resource }],
        kind: "chart",
        resource,
      });

      assert.deepEqual(prioritizedTemplateFileIds, []);
      assert.deepEqual(prioritizedCalculationFileIds, []);
      assert.deepEqual(plotDisplayPrefetches, [
        {
          fileIds: ["file-b"],
          priority: "active",
          targetResource: "file:///data/B.csv",
          targetSheetId: null,
        },
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

  test("delegates visible chart prewarm without reading Session in bridge", () => {
    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Visible chart prewarm should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      explorerService.setVisibleFileIds(["file-a"], []);

      assert.equal(snapshotReads, 0);
      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a"], priority: "visible" },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("routes URI rows through target-aware thumbnail prefetch inputs", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly targetResource?: string | null;
    }> = [];
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
    commitChartFilesForTest(session, ["file-a"]);
    explorerService.setViewLayout("thumbnail");
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-a",
        fileName: "Session.csv",
      }, {
        fileId: "uri-a",
        fileName: "Uri A.csv",
        resource: URI.file("/data/UriA.csv"),
      }, {
        fileId: "uri-b",
        fileName: "Uri B.csv",
        resource: URI.file("/data/UriB.csv"),
      }],
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
      session,
      thumbnailPrefetches,
    }));
    try {
      explorerService.setVisibleFileIds(["file-a", "uri-a"], ["uri-b"]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: ["file-a"], priority: "visible" },
      ]);
      assert.deepEqual(prioritizedCalculationFileIds, ["file-a"]);
      assert.deepEqual(thumbnailPrefetches, [
        {
          priority: "visible",
          targets: [{
            fileId: "file-a",
          }, {
            fileId: "uri-a",
            targetResource: "file:///data/UriA.csv",
            targetSheetId: null,
          }],
        },
        {
          priority: "nearby",
          targets: [{
            fileId: "uri-b",
            targetResource: "file:///data/UriB.csv",
            targetSheetId: null,
          }],
        },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("reads performance trace URI chart targets from Explorer pane input without Session", () => {
    const traceGlobal = globalThis as typeof globalThis & {
      __conductorTemplateApplyPerformanceTrace?: {
        targetApi?: {
          getChartTargets?: () => readonly {
            readonly chartState?: string;
            readonly fileId?: string;
            readonly hasChartData?: boolean;
            readonly selected?: boolean;
          }[];
        };
      };
    };
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => undefined,
        getItem: (key: string) => key === "conductor.templateApplyPerformanceTrace" ? "1" : null,
        key: () => null,
        length: 0,
        removeItem: () => undefined,
        setItem: () => undefined,
      } satisfies Storage,
    });
    delete traceGlobal.__conductorTemplateApplyPerformanceTrace;

    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Trace URI target enumeration should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    const uriSliceTarget: SliceUriTarget = {
      resource: URI.file("/data/UriA.csv"),
    };
    explorerService.updatePaneInput({
      files: [{
        fileId: "uri-a",
        fileName: "Uri A.csv",
        resource: uriSliceTarget.resource,
      }],
      mode: "chart",
      selectedResource: uriSliceTarget.resource,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });

    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      uriSliceTarget,
    }));
    try {
      const targets = traceGlobal.__conductorTemplateApplyPerformanceTrace?.targetApi?.getChartTargets?.() ?? [];

      assert.equal(snapshotReads, 0);
      assert.deepEqual(targets.map(target => ({
        chartState: target.chartState,
        fileId: target.fileId,
        hasChartData: target.hasChartData,
        selected: target.selected,
      })), [{
        chartState: "ready",
        fileId: "uri-a",
        hasChartData: true,
        selected: true,
      }]);
    } finally {
      bridge.dispose();
      delete traceGlobal.__conductorTemplateApplyPerformanceTrace;
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
      }
    }
  });

  test("reads performance trace chart targets from Explorer pane input projection", () => {
    const traceGlobal = globalThis as typeof globalThis & {
      __conductorTemplateApplyPerformanceTrace?: {
        targetApi?: {
          getChartTargets?: () => readonly {
            readonly chartState?: string;
            readonly fileId?: string;
            readonly hasChartData?: boolean;
            readonly label?: string;
          }[];
        };
      };
    };
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => undefined,
        getItem: (key: string) => key === "conductor.templateApplyPerformanceTrace" ? "1" : null,
        key: () => null,
        length: 0,
        removeItem: () => undefined,
        setItem: () => undefined,
      } satisfies Storage,
    });
    delete traceGlobal.__conductorTemplateApplyPerformanceTrace;

    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Trace target enumeration should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    explorerService.updatePaneInput({
      files: [{
        chartState: "ready",
        fileId: "file-a",
        fileName: "File A.csv",
        hasChartData: true,
      }],
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      const targets = traceGlobal.__conductorTemplateApplyPerformanceTrace?.targetApi?.getChartTargets?.() ?? [];

      assert.equal(snapshotReads, 0);
      assert.deepEqual(targets.map(target => ({
        chartState: target.chartState,
        fileId: target.fileId,
        hasChartData: target.hasChartData,
        label: target.label,
      })), [{
        chartState: "ready",
        fileId: "file-a",
        hasChartData: true,
        label: "File A.csv",
      }]);
    } finally {
      bridge.dispose();
      delete traceGlobal.__conductorTemplateApplyPerformanceTrace;
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
      }
    }
  });

  test("does not synthesize performance trace chart targets from Session", () => {
    const traceGlobal = globalThis as typeof globalThis & {
      __conductorTemplateApplyPerformanceTrace?: {
        targetApi?: {
          getChartTargets?: () => readonly unknown[];
        };
      };
    };
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => undefined,
        getItem: (key: string) => key === "conductor.templateApplyPerformanceTrace" ? "1" : null,
        key: () => null,
        length: 0,
        removeItem: () => undefined,
        setItem: () => undefined,
      } satisfies Storage,
    });
    delete traceGlobal.__conductorTemplateApplyPerformanceTrace;

    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Trace target enumeration without pane input should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      const targets = traceGlobal.__conductorTemplateApplyPerformanceTrace?.targetApi?.getChartTargets?.() ?? [];

      assert.equal(snapshotReads, 0);
      assert.deepEqual(targets, []);
    } finally {
      bridge.dispose();
      delete traceGlobal.__conductorTemplateApplyPerformanceTrace;
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
      }
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

  test("does not startup prewarm chart-main from Session chart data", () => {
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

      assert.deepEqual(uniquePrefetches(plotDisplayPrefetches), []);
      assert.deepEqual(uniquePrefetches(plotInspectorPrefetches), []);
    } finally {
      bridge.dispose();
    }
  });

  test("does not delegate active chart prewarm without Explorer URI rows", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotDisplayPrefetchSnapshotFields: boolean[] = [];
    commitChartFilesForTest(session, ["file-a"]);
    explorerService.select({
      fileId: "file-a",
      kind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotDisplayPrefetchSnapshotFields,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      bridge.sync();

      assert.deepEqual(uniquePrefetches(plotDisplayPrefetches), []);
      assert.equal(plotDisplayPrefetchSnapshotFields.length > 0, false);
      assert.equal(plotDisplayPrefetchSnapshotFields.every(hasSnapshot => !hasSnapshot), true);
    } finally {
      bridge.dispose();
    }
  });

  test("defers startup secondary state without opening Session table sources", async () => {
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

      assert.deepEqual(tableSources.map(source => source?.resource?.toString() ?? null), [null]);
      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: null,
        hasChartData: false,
      });
      assert.equal(explorerService.getPaneInput()?.selectedResource, null);
    } finally {
      bridge.dispose();
    }
  });

  test("opens selected table sheet from explicit Explorer resource row", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    const resource = URI.file("/data/Workbook.xlsx");
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-a",
        fileName: "Workbook.xlsx",
        itemKey: "table-key-b",
        resource,
        sheetId: "table-key-b",
      }],
      mode: "table",
      selectedResource: resource,
      selectedSheetId: "table-key-b",
      selectionKind: "table",
      thumbnailFiles: [],
    });
    explorerService.select({
      candidateResources: [{ resource, sheetId: "table-key-b" }],
      kind: "table",
      resource,
      sheetId: "table-key-b",
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
      assert.equal(tableSources.at(-1)?.sheetId, "table-key-b");
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Workbook.xlsx");
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), "file:///data/Workbook.xlsx");
      assert.equal(explorerService.getPaneInput()?.selectedSheetId, "table-key-b");
    } finally {
      bridge.dispose();
    }
  });

  test("opens Explorer URI pane rows without Session reconciliation", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Local.csv");
    const tableSources: Array<TableSource | null> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "local-a",
        fileName: "Local.csv",
        normalizedCsvPath: "/data/Local.csv",
        itemKey: "local-source",
        resource,
      }],
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "table",
      resource,
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
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Local.csv");
      assert.equal(tableSources.at(-1)?.sheetId, undefined);
      assert.deepEqual(session.getSnapshot().fileOrder, []);
      assert.equal(explorerService.selectedResource?.toString(), "file:///data/Local.csv");
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), "file:///data/Local.csv");
      assert.equal(explorerService.getPaneInput()?.files.at(-1)?.resource?.toString(), "file:///data/Local.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("syncs selected table URI pane rows without reading Session", () => {
    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Table URI pane sync should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Local.csv");
    const tableSources: Array<TableSource | null> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "local-a",
        fileName: "Local.csv",
        itemKey: "local-source",
        resource,
      }],
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      activeWorkbenchMainPart: "table",
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      tableSources,
    }));
    try {
      bridge.sync();

      assert.equal(snapshotReads, 0);
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Local.csv");
      assert.equal(tableSources.at(-1)?.sheetId, undefined);
      assert.equal(explorerService.selectedResource?.toString(), "file:///data/Local.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("opens Explorer URI pane rows regardless of Session raw table paths", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    commitRawFilesForTest(session, [{
      columnCount: 2,
      fileId: "file-a",
      fileName: "Session.csv",
      rowCount: 2,
      rows: [],
      sourcePath: "/data/Session.csv",
    }]);
    const resource = URI.file("/data/Uri.csv");
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-a",
        fileName: "Uri.csv",
        resource,
      }],
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "table",
      resource,
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

      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Uri.csv");
      assert.equal(explorerService.getPaneInput()?.files[0]?.fileName, "Uri.csv");
      assert.equal(explorerService.getPaneInput()?.files[0]?.resource?.toString(), "file:///data/Uri.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps Explorer URI pane rows keyed by resource", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    const resource = URI.file("/data/Uri.csv");
    explorerService.updatePaneInput({
      files: [{
        fileId: "local-file-a",
        fileName: "Uri.csv",
        resource,
      }],
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "table",
      resource,
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

      const files = explorerService.getPaneInput()?.files ?? [];
      assert.equal(files.length, 1);
      assert.equal(files[0]?.fileId, "local-file-a");
      assert.equal(files[0]?.resource?.toString(), "file:///data/Uri.csv");
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), "file:///data/Uri.csv");
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Uri.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps URI chart target separate from chart active file id", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Transfer.csv");
    const uriTarget: SliceUriTarget = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeTargetResource?: string | null;
      readonly activeTargetSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly targetResource?: string | null;
      readonly targetSheetId?: string | null;
    }> = [];
    const prioritizedCalculationFileIds: string[] = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "resource-file-a",
        fileName: "Transfer.csv",
        resource,
        sheetId: "sheet-a",
      }],
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "chart",
      resource,
      sheetId: "sheet-a",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
      session,
      uriSliceTarget: uriTarget,
    }));
    try {
      bridge.sync();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeTargetResource: "file:///data/Transfer.csv",
        activeTargetSheetId: "sheet-a",
        hasChartData: true,
      });
      assert.deepEqual(plotDisplayPrefetches.at(-1), {
        fileIds: ["resource-file-a"],
        priority: "active",
        targetResource: "file:///data/Transfer.csv",
        targetSheetId: "sheet-a",
      });
      assert.deepEqual(prioritizedCalculationFileIds, []);
    } finally {
      bridge.dispose();
    }
  });

  test("uses Explorer URI row label for active chart file options", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Uri.csv");
    const chartFileOptionInputs: Array<NonNullable<ChartViewInput["chartFileOptions"]>> = [];
    commitRawFilesForTest(session, [{
      columnCount: 2,
      fileId: "file-a",
      fileName: "Session.csv",
      rowCount: 2,
      rows: [],
      sourcePath: "/data/Session.csv",
    }]);
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-a",
        fileName: "Uri.csv",
        resource,
      }],
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "chart",
      resource,
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartFileOptionInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      uriSliceTarget: { resource },
    }));
    try {
      bridge.sync();

      assert.deepEqual(chartFileOptionInputs.at(-1), [{
        fileId: "file-a",
        fileName: "Uri.csv",
      }]);
    } finally {
      bridge.dispose();
    }
  });

  test("does not use Session chart data for a selected URI row with the same file id", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    commitRawFilesForTest(session, [{
      columnCount: 2,
      fileId: "file-a",
      fileName: "Session.csv",
      rowCount: 2,
      rows: [],
    }]);
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Session.csv",
      series: [{
        groupIndex: 0,
        id: "series-a",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
    const resource = URI.file("/data/Uri.csv");
    explorerService.updatePaneInput({
      files: [{
        fileId: "file-a",
        fileName: "Uri.csv",
        resource,
      }],
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "chart",
      resource,
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      bridge.sync();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "file-a",
        hasChartData: false,
      });
      assert.deepEqual(prioritizedCalculationFileIds, []);
      assert.deepEqual(plotDisplayPrefetches, []);
      assert.equal(explorerService.getPaneInput()?.files[0]?.hasChartData, false);
      assert.equal(explorerService.getPaneInput()?.files[0]?.chartState, "none");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps deferred secondary sync on selected URI chart target", async () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Deferred.csv");
    const uriTarget: SliceUriTarget = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeTargetResource?: string | null;
      readonly activeTargetSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "resource-file-a",
        fileName: "Deferred.csv",
        resource,
        sheetId: "sheet-a",
      }],
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "chart",
      resource,
      sheetId: "sheet-a",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      uriSliceTarget: uriTarget,
    }));
    try {
      bridge.sync({ deferSecondaryWork: true });

      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeTargetResource: "file:///data/Deferred.csv",
        activeTargetSheetId: "sheet-a",
        hasChartData: true,
      });
    } finally {
      bridge.dispose();
    }
  });

  test("deferred selected URI chart sync does not read Session", async () => {
    const session = store.add(new SessionService());
    let snapshotReads = 0;
    (session as unknown as { getSnapshot: () => never }).getSnapshot = () => {
      snapshotReads += 1;
      throw new Error("Deferred URI chart sync should not read Session.");
    };
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Deferred.csv");
    const uriTarget: SliceUriTarget = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeTargetResource?: string | null;
      readonly activeTargetSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "resource-file-a",
        fileName: "Deferred.csv",
        resource,
        sheetId: "sheet-a",
      }],
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    explorerService.select({
      kind: "chart",
      resource,
      sheetId: "sheet-a",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      uriSliceTarget: uriTarget,
    }));
    try {
      bridge.sync({ deferSecondaryWork: true });

      assert.equal(snapshotReads, 0);
      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.equal(snapshotReads, 0);
      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeTargetResource: "file:///data/Deferred.csv",
        activeTargetSheetId: "sheet-a",
        hasChartData: true,
      });
    } finally {
      bridge.dispose();
    }
  });

  test("keeps URI recent chart targets across bridge sync pruning", () => {
    const session = store.add(new SessionService());
    const explorerService = store.add(new ExplorerService());
    const resourceA = URI.file("/data/A.csv");
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
    explorerService.updatePaneInput({
      files: [{
        fileId: "resource-file-a",
        fileName: "A.csv",
        resource: resourceA,
      }, {
        fileId: "resource-file-b",
        fileName: "B.csv",
        resource: URI.file("/data/B.csv"),
      }],
      mode: "chart",
      selectedResource: resourceA,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
      thumbnailPrefetches,
      uriSliceTarget: { resource: resourceA },
    }));
    try {
      explorerService.setHoveredFileId("resource-file-a");
      bridge.sync();
      explorerService.setHoveredFileId("resource-file-b");

      assert.deepEqual(plotDisplayPrefetches.at(-1), {
        fileIds: ["resource-file-a"],
        priority: "recent",
        targetResource: "file:///data/A.csv",
        targetSheetId: null,
      });
      assert.deepEqual(thumbnailPrefetches.at(-1), {
        priority: "recent",
        targets: [{
          fileId: "resource-file-a",
          targetResource: "file:///data/A.csv",
          targetSheetId: null,
        }],
      });
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
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
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
        {
          priority: "recent",
          targets: [{
            fileId: "file-a",
          }],
        },
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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartActiveFileIds,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      session,
    }));
    try {
      explorerService.updatePaneInput({
        files: [
          {
            fileId: "file-a",
            fileName: "A.csv",
            resource: resourceA,
          },
          {
            fileId: "file-b",
            fileName: "B.csv",
            resource: resourceB,
          },
        ],
        mode: "chart",
        selectedResource: resourceA,
        selectedSheetId: null,
        selectionKind: "chart",
        thumbnailFiles: [],
      });
      explorerService.setPendingSourceFiles(true);
      assert.equal(scheduledFrames.length, 1);

      explorerService.select({
        candidateResources: [{ resource: resourceA }, { resource: resourceB }],
        kind: "chart",
        resource: resourceB,
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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    explorerService.updatePaneInput({
      files: [
        {
          fileId: "file-a",
          fileName: "A.csv",
          resource: resourceA,
        },
        {
          fileId: "file-b",
          fileName: "B.csv",
          resource: resourceB,
        },
      ],
      mode: "chart",
      selectedResource: resourceA,
      selectedSheetId: null,
      selectionKind: "chart",
      thumbnailFiles: [],
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
        candidateResources: [{ resource: resourceA }, { resource: resourceB }],
        kind: "chart",
        resource: resourceB,
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
  activeWorkbenchMainPart = "chart",
  chartActiveFileIds,
  chartFileOptionInputs,
  chartViewInputs,
  cachedPlotDisplayFileIds,
  explorerService,
  plotCalculatedPrefetches,
  plotDisplayPrefetches,
  plotDisplayPrefetchSnapshotFields,
  plotInspectorPrefetches,
  prioritizedCalculationFileIds,
  prioritizedTemplateFileIds,
  session,
  sliceStateEvent = Event.None,
  sliceTemplateSelectionsByFileId,
  uriSliceTarget,
  thumbnailPrefetches,
  tableSources,
  visibleDetailPanes = [],
}: {
  readonly activeWorkbenchMainPart?: "chart" | "table";
  readonly chartActiveFileIds?: (string | null)[];
  readonly chartFileOptionInputs?: Array<NonNullable<ChartViewInput["chartFileOptions"]>>;
  readonly chartViewInputs?: Array<{
    readonly activeFileId: string | null;
    readonly activeTargetResource?: string | null;
    readonly activeTargetSheetId?: string | null;
    readonly hasChartData?: boolean;
  }>;
  readonly cachedPlotDisplayFileIds?: readonly string[];
  readonly explorerService: ExplorerService;
  readonly plotCalculatedPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly plotDisplayPrefetches?: Array<{
    readonly fileIds: readonly string[];
    readonly priority: string;
    readonly targetResource?: string | null;
    readonly targetSheetId?: string | null;
  }>;
  readonly plotDisplayPrefetchSnapshotFields?: boolean[];
  readonly plotInspectorPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly prioritizedCalculationFileIds: string[];
  readonly prioritizedTemplateFileIds: string[];
  readonly session: SessionService;
  readonly sliceStateEvent?: Event<unknown>;
  readonly sliceTemplateSelectionsByFileId?: SliceState["templateSelectionsByFileId"];
  readonly uriSliceTarget?: SliceUriTarget;
  readonly thumbnailPrefetches?: ThumbnailPrefetchForTest[];
  readonly tableSources?: Array<TableSource | null>;
  readonly visibleDetailPanes?: readonly ["inspector"] | readonly [];
}): ConstructorParameters<typeof WorkbenchDomainBridge>[0] => ({
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
      chartFileOptionInputs?.push([...(input.chartFileOptions ?? [])]);
      chartViewInputs?.push({
        activeFileId: input.activeFileId ?? null,
        ...(input.activeTarget ? {
          activeTargetResource: input.activeTarget.resource.toString(),
          activeTargetSheetId: input.activeTarget.sheetId ?? null,
        } : {}),
        hasChartData: input.hasChartData,
      });
    },
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["chartService"],
  explorerService,
  layoutService: {
    activeWorkbenchMainPart,
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
      plotDisplayPrefetchSnapshotFields?.push(Object.prototype.hasOwnProperty.call(input, "snapshot"));
      plotDisplayPrefetches?.push({
        fileIds: input.fileId ? [input.fileId] : [],
        priority,
        ...(input.target ? {
          targetResource: input.target.resource.toString(),
          targetSheetId: input.target.sheetId ?? null,
        } : {}),
      });
    },
    prefetchPlotDisplayModels: (inputs, priority) => {
      plotDisplayPrefetchSnapshotFields?.push(
        ...inputs.map(input => Object.prototype.hasOwnProperty.call(input, "snapshot")),
      );
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
    cancelUri: () => undefined,
    enqueueAuto: () => undefined,
    getState: () => createSliceStateForTest({
      templateSelectionsByFileId: sliceTemplateSelectionsByFileId,
    }),
    getUriResult: target => uriSliceTarget && isSameSliceUriTargetForTest(target, uriSliceTarget)
      ? { target } as ReturnType<ConstructorParameters<typeof WorkbenchDomainBridge>[0]["sliceService"]["getUriResult"]>
      : null,
    getUriState: () => undefined,
    onDidChangeSliceState: sliceStateEvent as Event<void>,
    onDidChangeUriSliceResult: Event.None,
    prioritize: () => undefined,
    prioritizeUri: () => undefined,
    runWithTemplate: () => undefined,
    setTemplateSelection: () => undefined,
    submit: () => undefined,
    submitUri: () => undefined,
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
    prefetch: (targets, priority) => {
      thumbnailPrefetches?.push({
        priority,
        targets: targets.map(target => {
          if (typeof target === "string") {
            return {
              fileId: target,
            };
          }
          return {
            fileId: String(target.fileId ?? ""),
            ...(target.target ? {
              targetResource: target.target.resource.toString(),
              targetSheetId: target.target.sheetId ?? null,
            } : {}),
          };
        }),
      });
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["thumbnailPreviewService"],
});

const isSameSliceUriTargetForTest = (
  first: SliceUriTarget,
  second: SliceUriTarget,
): boolean =>
  first.resource.toString() === second.resource.toString() &&
  String(first.sheetId ?? "") === String(second.sheetId ?? "");

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
      rawTableOrder: ["table-key-a", "table-key-b"],
      rawTablesById: {
        "table-key-a": createRawTableRecordForTest("file-a", "table-key-a"),
        "table-key-b": createRawTableRecordForTest("file-a", "table-key-b"),
      },
    },
  }],
});

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
