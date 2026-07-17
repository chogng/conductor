/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import {
  resolveInitialPanelViewContainerId,
  resolveWorkbenchSidebarSurface,
} from "src/cs/workbench/browser/workbench";
import {
  createExplorerPaneInput,
  shouldPrefetchExplorerThumbnails,
  WorkbenchDomainBridge,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import { SettingsViewContainerId } from "src/cs/workbench/contrib/settings/common/settings";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type {
  PlotDisplayModel,
} from "src/cs/workbench/services/plot/common/plot";
import { DEFAULT_ORIGIN_PLOT_OPTIONS } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { createTemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { SliceState } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateApplyPerformanceTraceTargetApi } from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";

type ThumbnailPrefetchForTest = {
  readonly priority: string;
  readonly targets: readonly {
    readonly fileId?: string;
    readonly resource?: string | null;
    readonly sheetId?: string | null;
  }[];
};

type ResourceSheetIdentity = {
  readonly resource: URI;
  readonly sheetId?: string | null;
};

type TemplateApplyPerformanceTraceGlobalForTest = typeof globalThis & {
  __conductorTemplateApplyPerformanceTrace?: {
    readonly targetApi?: TemplateApplyPerformanceTraceTargetApi;
  };
};

const getTemplateApplyPerformanceTraceTargetApiForTest = (): TemplateApplyPerformanceTraceTargetApi | undefined =>
  (globalThis as TemplateApplyPerformanceTraceGlobalForTest).__conductorTemplateApplyPerformanceTrace?.targetApi;

suite("workbench/browser/workbench Explorer pane input", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("creates table mode input from explorer and slice state", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/workspace/file-a.csv");

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "table",
      sliceState: createSliceStateForTest({
        templateSelections: [{
          resource,
          selection: createTemplateSelection("template-file"),
        }],
      }),
    });

    assert.equal(input.selectionKind, "table");
    assert.equal(input.selectedResource, null);
    assert.deepEqual(input.templateSelections?.map(selection => ({
      resource: selection.resource.toString(),
      selection: selection.selection,
    })), [{
      resource: resource.toString(),
      selection: {
        kind: "saved",
        templateId: "template-file",
      },
    }]);
  });

  test("does not select rows without Explorer resource input in chart input", () => {
    const explorerService = store.add(new ExplorerService());

    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotAxisSettings: { x: { show: true } },
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    const nextInput = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotAxisSettings: { x: { show: true } },
      sliceState: createSliceStateForTest(),
    });
    assert.equal(nextInput.selectedResource, null);

    assert.equal(explorerService.selectedResource, null);
  });

  test("does not keep chart selection without Explorer resource rows", () => {
    const explorerService = store.add(new ExplorerService());
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
  });

  test("creates chart thumbnail input from Explorer resource rows", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/ProcessedA.csv");
    const files: ExplorerFileEntry[] = [{
      fileId: "file-a",
      fileName: "Processed A.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    explorerService.setViewLayout("thumbnail");
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      originOpenPlotOptions: DEFAULT_ORIGIN_PLOT_OPTIONS,
      plotAxisSettings: { x: { show: true } },
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectionKind, "chart");
    assert.equal(input.selectedResource, null);
    assert.equal(input.thumbnailPlotModelsByFileId, undefined);
    assert.equal(input.originOpenPlotOptions, DEFAULT_ORIGIN_PLOT_OPTIONS);
    assert.deepEqual(input.plotAxisSettings, { x: { show: true } });

    assert.equal(explorerService.selectedResource, null);
  });

  test("does not invent thumbnail selection outside the shared explorer selection", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/ProcessedA.csv");
    const files: ExplorerFileEntry[] = [{
      fileId: "file-a",
      fileName: "Processed A.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    explorerService.setViewLayout("thumbnail");
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService,
      mode: "chart",
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectedResource, null);
    assert.equal(explorerService.selectedResource, null);
  });

  test("does not project rows without Explorer resource entries", () => {
    const input = createExplorerPaneInput({
      activePlotType: "iv",
      explorerService: store.add(new ExplorerService()),
      mode: "table",
      sliceState: createSliceStateForTest(),
    });

    assert.equal(input.selectedResource, null);
  });

});

suite("workbench/browser/workbench initial panel view container", () => {
  test("starts in the table panel", () => {
    assert.equal(resolveInitialPanelViewContainerId(), TableViewContainerId);
  });
});

suite("workbench/browser/workbench sidebar surface", () => {
  test("derives sidebar surface from active panel view container and Explorer layout", () => {
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: TableViewContainerId,
      explorerViewLayout: "tree",
    }), "explorer");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: TableViewContainerId,
      explorerViewLayout: "thumbnail",
    }), "explorer");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: ChartViewContainerId,
      explorerViewLayout: "tree",
    }), "explorer");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: ChartViewContainerId,
      explorerViewLayout: "thumbnail",
    }), "thumbnail");
    assert.equal(resolveWorkbenchSidebarSurface({
      activePanelViewContainerId: SettingsViewContainerId,
      explorerViewLayout: "thumbnail",
    }), "settingsNavigation");
  });
});

suite("workbench/browser/workbench thumbnail prefetch gating", () => {
  test("allows visible thumbnail prefetch only in chart thumbnail layout", () => {
    assert.equal(shouldPrefetchExplorerThumbnails({
      activePanelViewContainerId: ChartViewContainerId,
      viewLayout: "thumbnail",
    }), true);
    assert.equal(shouldPrefetchExplorerThumbnails({
      activePanelViewContainerId: ChartViewContainerId,
      viewLayout: "tree",
    }), false);
    assert.equal(shouldPrefetchExplorerThumbnails({
      activePanelViewContainerId: TableViewContainerId,
      viewLayout: "thumbnail",
    }), false);
  });
});

suite("workbench/browser/WorkbenchDomainBridge", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("prioritizes selected Explorer resource immediately for plot prefetch", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/B.csv");
    const prioritizedTemplateFileIds: string[] = [];
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly resource?: string | null;
      readonly sheetId?: string | null;
    }> = [];
    const files = [{
      fileId: "file-b",
      fileName: "B.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds,
      resourceSlice: { resource },
    }));
    try {
      explorerService.select(resource);

      assert.deepEqual(prioritizedTemplateFileIds, []);
      assert.deepEqual(prioritizedCalculationFileIds, ["file:///data/B.csv"]);
      assert.deepEqual(plotDisplayPrefetches, [
        {
          fileIds: [],
          priority: "active",
          resource: "file:///data/B.csv",
          sheetId: null,
        },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("prewarms visible chart plot display targets through Plot owner APIs", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      explorerService.setVisibleTargets([
        { resource: URI.file("/data/A.csv") },
        { resource: URI.file("/data/B.csv") },
      ], [
        { resource: URI.file("/data/C.csv") },
      ]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: [], priority: "visible", resource: "file:///data/A.csv", sheetId: null },
        { fileIds: [], priority: "visible", resource: "file:///data/B.csv", sheetId: null },
        { fileIds: [], priority: "nearby", resource: "file:///data/C.csv", sheetId: null },
      ]);
      assert.deepEqual(plotInspectorPrefetches, []);
    } finally {
      bridge.dispose();
    }
  });

  test("delegates visible chart prewarm through resource identities", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly resource?: string | null;
      readonly sheetId?: string | null;
    }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      explorerService.setVisibleTargets([{ resource: URI.file("/data/A.csv") }], []);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: [], priority: "visible", resource: "file:///data/A.csv", sheetId: null },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("routes Explorer resource rows through resource-aware thumbnail prefetch inputs", () => {
    const explorerService = store.add(new ExplorerService());
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly resource?: string | null;
    }> = [];
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
    explorerService.setViewLayout("thumbnail");
    const files = [{
      fileId: "file-a",
      fileName: "Legacy.csv",
      resource: URI.file("/data/Legacy.csv"),
    }, {
      fileId: "uri-a",
      fileName: "Uri A.csv",
      resource: URI.file("/data/UriA.csv"),
    }, {
      fileId: "uri-b",
      fileName: "Uri B.csv",
      resource: URI.file("/data/UriB.csv"),
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
      thumbnailPrefetches,
    }));
    try {
      explorerService.setVisibleTargets([
        { resource: URI.file("/data/UriA.csv") },
      ], [
        { resource: URI.file("/data/UriB.csv") },
      ]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: [], priority: "visible", resource: "file:///data/UriA.csv", sheetId: null },
        { fileIds: [], priority: "nearby", resource: "file:///data/UriB.csv", sheetId: null },
      ]);
      assert.deepEqual(prioritizedCalculationFileIds, []);
      assert.deepEqual(thumbnailPrefetches, [
        {
          priority: "visible",
          targets: [{
            resource: "file:///data/UriA.csv",
            sheetId: null,
          }],
        },
        {
          priority: "nearby",
          targets: [{
            resource: "file:///data/UriB.csv",
            sheetId: null,
          }],
        },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("reads performance trace resource chart targets from Explorer pane input", () => {
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

    const explorerService = store.add(new ExplorerService());
    const resourceSlice: ResourceSheetIdentity = {
      resource: URI.file("/data/UriA.csv"),
    };
    const files = [{
      fileId: "uri-a",
      fileName: "Uri A.csv",
      resource: resourceSlice.resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resourceSlice.resource,
      selectedSheetId: null,
      selectionKind: "chart",
    });

    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      resourceSlice,
    }));
    try {
      const targets = getTemplateApplyPerformanceTraceTargetApiForTest()?.getChartTargets() ?? [];

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
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

  test("reads performance trace chart targets from Explorer files", () => {
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

    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/FileA.csv");
    const files: ExplorerFileEntry[] = [{
      fileId: "file-a",
      fileName: "File A.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: null,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      resourceSlice: { resource },
    }));
    try {
      const targets = getTemplateApplyPerformanceTraceTargetApiForTest()?.getChartTargets() ?? [];

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
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

  test("does not synthesize performance trace chart targets without Explorer resources", () => {
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

    const explorerService = store.add(new ExplorerService());
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      const targets = getTemplateApplyPerformanceTraceTargetApiForTest()?.getChartTargets() ?? [];

      assert.deepEqual(targets, []);
    } finally {
      bridge.dispose();
      delete traceGlobal.__conductorTemplateApplyPerformanceTrace;
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

  test("does not prewarm inspector targets while inspector pane is hidden", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      visibleDetailPanes: [],
    }));
    try {
      explorerService.setVisibleTargets([
        { resource: URI.file("/data/A.csv") },
      ], [
        { resource: URI.file("/data/B.csv") },
      ]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: [], priority: "visible", resource: "file:///data/A.csv", sheetId: null },
        { fileIds: [], priority: "nearby", resource: "file:///data/B.csv", sheetId: null },
      ]);
      assert.deepEqual(plotInspectorPrefetches, []);
    } finally {
      bridge.dispose();
    }
  });

  test("keeps inspector prewarm out of bridge chart selection sync", async () => {
    const explorerService = store.add(new ExplorerService());
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      visibleDetailPanes: ["inspector"],
    }));
    try {
      bridge.sync();
      explorerService.select(null);
      await Promise.resolve();

      assert.deepEqual(uniquePrefetches(plotInspectorPrefetches), []);
    } finally {
      bridge.dispose();
    }
  });

  test("does not startup prewarm chart-main without Explorer resource rows", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotInspectorPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotInspectorPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
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

  test("does not delegate active chart prewarm without Explorer resource rows", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const plotDisplayPrefetchSnapshotFields: boolean[] = [];
    explorerService.select(null);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      plotDisplayPrefetchSnapshotFields,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
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

  test("defers startup secondary state without opening table sources", async () => {
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    const tableSources: Array<TableSource | null> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
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
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    const resource = URI.file("/data/Workbook.xlsx");
    const files = [{
      fileId: "file-a",
      fileName: "Workbook.xlsx",
      itemKey: "table-key-b",
      resource,
      sheetId: "table-key-b",
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "table",
      selectedResource: resource,
      selectedSheetId: "table-key-b",
      selectionKind: "table",
    });
    explorerService.select(resource, undefined, "table-key-b");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
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

  test("opens Explorer resource pane rows directly", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Local.csv");
    const tableSources: Array<TableSource | null> = [];
    const files = [{
      fileId: "local-a",
      fileName: "Local.csv",
      normalizedCsvPath: "/data/Local.csv",
      itemKey: "local-source",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
    });
    explorerService.select(resource);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      tableSources,
    }));
    try {
      bridge.sync();

      assert.equal(Object.prototype.hasOwnProperty.call(tableSources.at(-1) ?? {}, "fileId"), false);
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Local.csv");
      assert.equal(tableSources.at(-1)?.sheetId, undefined);
      assert.equal(explorerService.selectedResource?.toString(), "file:///data/Local.csv");
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), "file:///data/Local.csv");
      assert.equal(explorerService.files.at(-1)?.resource?.toString(), "file:///data/Local.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("syncs selected table resource pane rows", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Local.csv");
    const tableSources: Array<TableSource | null> = [];
    const files = [{
      fileId: "local-a",
      fileName: "Local.csv",
      itemKey: "local-source",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      activePanelViewContainerId: TableViewContainerId,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      tableSources,
    }));
    try {
      bridge.sync();

      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Local.csv");
      assert.equal(tableSources.at(-1)?.sheetId, undefined);
      assert.equal(explorerService.selectedResource?.toString(), "file:///data/Local.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("opens Explorer resource pane rows by URI", () => {
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    const resource = URI.file("/data/Uri.csv");
    const files = [{
      fileId: "file-a",
      fileName: "Uri.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
    });
    explorerService.select(resource);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      tableSources,
    }));
    try {
      bridge.sync();

      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Uri.csv");
      assert.equal(explorerService.files[0]?.fileName, "Uri.csv");
      assert.equal(explorerService.files[0]?.resource?.toString(), "file:///data/Uri.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps Explorer resource pane rows keyed by resource", () => {
    const explorerService = store.add(new ExplorerService());
    const tableSources: Array<TableSource | null> = [];
    const resource = URI.file("/data/Uri.csv");
    const explorerFiles = [{
      fileId: "local-file-a",
      fileName: "Uri.csv",
      resource,
    }];
    explorerService.replaceFiles(explorerFiles);
    explorerService.updatePaneInput({
      mode: "table",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "table",
    });
    explorerService.select(resource);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      tableSources,
    }));
    try {
      bridge.sync();

      const files = explorerService.files;
      assert.equal(files.length, 1);
      assert.equal(files[0]?.fileId, "local-file-a");
      assert.equal(files[0]?.resource?.toString(), "file:///data/Uri.csv");
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), "file:///data/Uri.csv");
      assert.equal(tableSources.at(-1)?.resource?.toString(), "file:///data/Uri.csv");
    } finally {
      bridge.dispose();
    }
  });

  test("keeps resource chart target separate from chart active file id", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Transfer.csv");
    const resourceInput: ResourceSheetIdentity = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeResource?: string | null;
      readonly activeSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    const plotDisplayPrefetches: Array<{
      readonly fileIds: readonly string[];
      readonly priority: string;
      readonly resource?: string | null;
      readonly sheetId?: string | null;
    }> = [];
    const prioritizedCalculationFileIds: string[] = [];
    const files = [{
      fileId: "resource-file-a",
      fileName: "Transfer.csv",
      resource,
      sheetId: "sheet-a",
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
    });
    explorerService.select(resource, undefined, "sheet-a");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
      resourceSlice: resourceInput,
    }));
    try {
      bridge.sync();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeResource: "file:///data/Transfer.csv",
        activeSheetId: "sheet-a",
        hasChartData: true,
      });
      assert.deepEqual(plotDisplayPrefetches.at(-1), {
        fileIds: [],
        priority: "active",
        resource: "file:///data/Transfer.csv",
        sheetId: "sheet-a",
      });
      assert.deepEqual(prioritizedCalculationFileIds, []);
    } finally {
      bridge.dispose();
    }
  });

  test("uses Explorer resource row label for active chart file options", () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Uri.csv");
    const chartFileOptionInputs: Array<NonNullable<ChartViewInput["chartFileOptions"]>> = [];
    const files = [{
      fileId: "file-a",
      fileName: "Uri.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    explorerService.select(resource);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartFileOptionInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      resourceSlice: { resource },
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

  test("uses selected resource rows for chart data", () => {
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    const prioritizedCalculationFileIds: string[] = [];
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const resource = URI.file("/data/Uri.csv");
    const files = [{
      fileId: "file-a",
      fileName: "Uri.csv",
      resource,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    explorerService.select(resource);
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds: [],
    }));
    try {
      bridge.sync();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "file-a",
        hasChartData: false,
      });
      assert.deepEqual(prioritizedCalculationFileIds, []);
      assert.deepEqual(plotDisplayPrefetches, []);
      assert.equal(explorerService.getPaneInput()?.selectedResource?.toString(), resource.toString());
      assert.equal(explorerService.getPaneInput()?.selectedSheetId, null);
    } finally {
      bridge.dispose();
    }
  });

  test("keeps deferred secondary sync on selected resource chart target", async () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Deferred.csv");
    const resourceInput: ResourceSheetIdentity = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeResource?: string | null;
      readonly activeSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    const files = [{
      fileId: "resource-file-a",
      fileName: "Deferred.csv",
      resource,
      sheetId: "sheet-a",
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
    });
    explorerService.select(resource, undefined, "sheet-a");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      resourceSlice: resourceInput,
    }));
    try {
      bridge.sync({ deferSecondaryWork: true });

      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeResource: "file:///data/Deferred.csv",
        activeSheetId: "sheet-a",
        hasChartData: true,
      });
    } finally {
      bridge.dispose();
    }
  });

  test("defers selected resource chart sync", async () => {
    const explorerService = store.add(new ExplorerService());
    const resource = URI.file("/data/Deferred.csv");
    const resourceInput: ResourceSheetIdentity = {
      resource,
      sheetId: "sheet-a",
    };
    const chartViewInputs: Array<{
      readonly activeFileId: string | null;
      readonly activeResource?: string | null;
      readonly activeSheetId?: string | null;
      readonly hasChartData?: boolean;
    }> = [];
    const files = [{
      fileId: "resource-file-a",
      fileName: "Deferred.csv",
      resource,
      sheetId: "sheet-a",
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resource,
      selectedSheetId: "sheet-a",
      selectionKind: "chart",
    });
    explorerService.select(resource, undefined, "sheet-a");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      resourceSlice: resourceInput,
    }));
    try {
      bridge.sync({ deferSecondaryWork: true });

      assert.deepEqual(chartViewInputs, []);

      await new Promise(resolve => globalThis.setTimeout(resolve, 0));

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "resource-file-a",
        activeResource: "file:///data/Deferred.csv",
        activeSheetId: "sheet-a",
        hasChartData: true,
      });
    } finally {
      bridge.dispose();
    }
  });

  test("keeps resource recent chart targets across bridge sync pruning", () => {
    const explorerService = store.add(new ExplorerService());
    const resourceA = URI.file("/data/A.csv");
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
    const files = [{
      fileId: "resource-file-a",
      fileName: "A.csv",
      resource: resourceA,
    }, {
      fileId: "resource-file-b",
      fileName: "B.csv",
      resource: URI.file("/data/B.csv"),
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resourceA,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      thumbnailPrefetches,
      resourceSlice: { resource: resourceA },
    }));
    try {
      explorerService.setHoveredResource({ resource: resourceA });
      bridge.sync();
      explorerService.setHoveredResource({ resource: URI.file("/data/B.csv") });

      assert.deepEqual(plotDisplayPrefetches.at(-1), {
        fileIds: [],
        priority: "recent",
        resource: "file:///data/A.csv",
        sheetId: null,
      });
      assert.deepEqual(thumbnailPrefetches.at(-1), {
        priority: "recent",
        targets: [{
          resource: "file:///data/A.csv",
          sheetId: null,
        }],
      });
    } finally {
      bridge.dispose();
    }
  });

  test("backs recently interactive chart targets with recent plot and thumbnail priority", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const prioritizedTemplateFileIds: string[] = [];
    const prioritizedCalculationFileIds: string[] = [];
    const thumbnailPrefetches: ThumbnailPrefetchForTest[] = [];
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const files = [{
      fileId: "file-a",
      fileName: "A.csv",
      resource: resourceA,
    }, {
      fileId: "file-b",
      fileName: "B.csv",
      resource: resourceB,
    }];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resourceA,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds,
      prioritizedTemplateFileIds,
      thumbnailPrefetches,
      resourceSlice: { resource: resourceA },
    }));
    try {
      explorerService.setHoveredResource({ resource: resourceA });
      explorerService.setHoveredResource({ resource: resourceB });

      assert.deepEqual(prioritizedTemplateFileIds, []);
      assert.deepEqual(prioritizedCalculationFileIds, ["file:///data/A.csv"]);
      assert.deepEqual(plotDisplayPrefetches, [
        {
          fileIds: [],
          priority: "hover",
          resource: "file:///data/A.csv",
          sheetId: null,
        },
        {
          fileIds: [],
          priority: "recent",
          resource: "file:///data/A.csv",
          sheetId: null,
        },
      ]);
      assert.deepEqual(thumbnailPrefetches, [
        {
          priority: "recent",
          targets: [{
            resource: "file:///data/A.csv",
            sheetId: null,
          }],
        },
      ]);
    } finally {
      bridge.dispose();
    }
  });

  test("delegates cached background chart plot display targets to PlotService", () => {
    const explorerService = store.add(new ExplorerService());
    const plotDisplayPrefetches: Array<{ readonly fileIds: readonly string[]; readonly priority: string }> = [];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      cachedPlotDisplayFileIds: ["file-a"],
      explorerService,
      plotDisplayPrefetches,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      explorerService.setVisibleTargets([
        { resource: URI.file("/data/A.csv") },
        { resource: URI.file("/data/B.csv") },
      ], [
        { resource: URI.file("/data/C.csv") },
      ]);

      assert.deepEqual(plotDisplayPrefetches, [
        { fileIds: [], priority: "visible", resource: "file:///data/A.csv", sheetId: null },
        { fileIds: [], priority: "visible", resource: "file:///data/B.csv", sheetId: null },
        { fileIds: [], priority: "nearby", resource: "file:///data/C.csv", sheetId: null },
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

    const explorerService = store.add(new ExplorerService());
    const chartActiveFileIds: (string | null)[] = [];
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const files = [
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
    ];
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartActiveFileIds,
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      explorerService.replaceFiles(files);
      explorerService.updatePaneInput({
        mode: "chart",
        selectedResource: resourceA,
        selectedSheetId: null,
        selectionKind: "chart",
      });
      assert.equal(scheduledFrames.length, 1);

      explorerService.select(resourceB);
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
    const explorerService = store.add(new ExplorerService());
    const chartViewInputs: Array<{ readonly activeFileId: string | null; readonly hasChartData?: boolean }> = [];
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const files = [
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
    ];
    explorerService.replaceFiles(files);
    explorerService.updatePaneInput({
      mode: "chart",
      selectedResource: resourceA,
      selectedSheetId: null,
      selectionKind: "chart",
    });
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      chartViewInputs,
      explorerService,
      processingResource: { resource: resourceB },
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
    }));
    try {
      explorerService.select(resourceB);
      await Promise.resolve();

      assert.deepEqual(chartViewInputs.at(-1), {
        activeFileId: "file-b",
        activeResource: resourceB.toString(),
        activeSheetId: null,
        hasChartData: false,
        processingState: "processing",
      });
    } finally {
      bridge.dispose();
    }
  });

  test("syncs slice template selections into explorer pane input", async () => {
    const explorerService = store.add(new ExplorerService());
    const sliceStateEmitter = new Emitter<unknown>();
    const resource = URI.file("/workspace/file-a.csv");
    const bridge = new WorkbenchDomainBridge(createDomainBridgeOptionsForTest({
      explorerService,
      prioritizedCalculationFileIds: [],
      prioritizedTemplateFileIds: [],
      sliceStateEvent: sliceStateEmitter.event,
      sliceTemplateSelections: [{
        resource,
        selection: createTemplateSelection("template-custom"),
      }],
    }));
    try {
      sliceStateEmitter.fire(undefined);
      await Promise.resolve();

      assert.deepEqual(explorerService.getPaneInput()?.templateSelections?.map(selection => ({
        resource: selection.resource.toString(),
        selection: selection.selection,
      })), [{
        resource: resource.toString(),
        selection: {
          kind: "saved",
          templateId: "template-custom",
        },
      }]);
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

const createPlotService = (): Pick<
  ConstructorParameters<typeof WorkbenchDomainBridge>[0]["plotService"],
  "getCalculatedData"
> => ({
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
  isRunning = false,
  queueLength = 0,
  templateSelections = [],
}: Partial<SliceState> = {}): SliceState => ({
  isRunning,
  queueLength,
  templateSelections,
});

const createDomainBridgeOptionsForTest = ({
  activePanelViewContainerId = ChartViewContainerId,
  chartActiveFileIds,
  chartFileOptionInputs,
  chartViewInputs,
  cachedPlotDisplayFileIds,
  explorerService,
  plotDisplayPrefetches,
  plotDisplayPrefetchSnapshotFields,
  plotInspectorPrefetches,
  prioritizedCalculationFileIds,
  prioritizedTemplateFileIds,
  processingResource,
  sliceStateEvent = Event.None,
  sliceTemplateSelections,
  resourceSlice,
  thumbnailPrefetches,
  tableSources,
  visibleDetailPanes = [],
}: {
  readonly activePanelViewContainerId?: string;
  readonly chartActiveFileIds?: (string | null)[];
  readonly chartFileOptionInputs?: Array<NonNullable<ChartViewInput["chartFileOptions"]>>;
  readonly chartViewInputs?: Array<{
    readonly activeFileId: string | null;
    readonly activeResource?: string | null;
    readonly activeSheetId?: string | null;
    readonly hasChartData?: boolean;
    readonly processingState?: string;
  }>;
  readonly cachedPlotDisplayFileIds?: readonly string[];
  readonly explorerService: ExplorerService;
  readonly plotDisplayPrefetches?: Array<{
    readonly fileIds: readonly string[];
    readonly priority: string;
    readonly resource?: string | null;
    readonly sheetId?: string | null;
  }>;
  readonly plotDisplayPrefetchSnapshotFields?: boolean[];
  readonly plotInspectorPrefetches?: Array<{ readonly fileIds: readonly string[]; readonly priority: string }>;
  readonly prioritizedCalculationFileIds: string[];
  readonly prioritizedTemplateFileIds: string[];
  readonly processingResource?: ResourceSheetIdentity;
  readonly sliceStateEvent?: Event<unknown>;
  readonly sliceTemplateSelections?: SliceState["templateSelections"];
  readonly resourceSlice?: ResourceSheetIdentity;
  readonly thumbnailPrefetches?: ThumbnailPrefetchForTest[];
  readonly tableSources?: Array<TableSource | null>;
  readonly visibleDetailPanes?: readonly ["inspector"] | readonly [];
}): ConstructorParameters<typeof WorkbenchDomainBridge>[0] => ({
  calculationService: {
    _serviceBrand: undefined,
    getResourceResult: () => null,
    onDidChangeResourceCalculationResult: Event.None,
    prioritizeResource: resource => {
      prioritizedCalculationFileIds.push(resource.toString());
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
        ...(input.activeResource ? {
          activeResource: input.activeResource.toString(),
          activeSheetId: input.activeSheetId ?? null,
        } : {}),
        hasChartData: input.hasChartData,
        ...(input.processingStatus?.state ? {
          processingState: input.processingStatus.state,
        } : {}),
      });
    },
  } as unknown as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["chartService"],
  explorerService,
  getActivePanelViewContainerId: () => activePanelViewContainerId,
  onDidChangeActivePanelViewContainer: Event.None as Event<void>,
  plotService: {
	    ...createPlotService(),
	    getCachedPlotDisplayModel: ({ fileId }) => (cachedPlotDisplayFileIds ?? []).includes(String(fileId ?? "").trim())
	      ? createPlotDisplayModelForTest(String(fileId ?? "").trim())
	      : null,
    getState: () => ({ activePlotType: "iv" }),
    onDidChangePlotState: Event.None,
    prefetchPlotDisplayModel: (input, priority) => {
      plotDisplayPrefetchSnapshotFields?.push(Object.prototype.hasOwnProperty.call(input, "snapshot"));
      plotDisplayPrefetches?.push({
        fileIds: input.fileId ? [input.fileId] : [],
        priority,
        ...(input.resource ? {
          resource: input.resource.toString(),
          sheetId: input.sheetId ?? null,
        } : {}),
      });
    },
    prefetchPlotDisplayModels: (inputs, priority) => {
      plotDisplayPrefetchSnapshotFields?.push(
        ...inputs.map(input => Object.prototype.hasOwnProperty.call(input, "snapshot")),
      );
      for (const input of inputs) {
        plotDisplayPrefetches?.push({
          fileIds: input.fileId ? [input.fileId] : [],
          priority,
          ...(input.resource ? {
            resource: input.resource.toString(),
            sheetId: input.sheetId ?? null,
          } : {}),
        });
      }
    },
    prefetchPlotInspectorDisplayModel: (input, priority) => {
      plotInspectorPrefetches?.push({
        fileIds: input.fileId ? [input.fileId] : [],
        priority,
      });
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["plotService"],
  sliceService: {
    _serviceBrand: undefined,
    cancelResource: () => undefined,
    enqueueAuto: () => undefined,
    getState: () => createSliceStateForTest({
      templateSelections: sliceTemplateSelections,
    }),
    getTemplateSelection: () => ({ kind: "auto" }),
    getResourceResult: (resource, sheetId) => resourceSlice && isSameResourceSheetForTest({ resource, sheetId }, resourceSlice)
      ? {
        resource: resourceSlice.resource,
        sheetId: resourceSlice.sheetId ?? null,
      } as ReturnType<ConstructorParameters<typeof WorkbenchDomainBridge>[0]["sliceService"]["getResourceResult"]>
      : null,
    getResourceState: (resource, sheetId) =>
      processingResource && isSameResourceSheetForTest({ resource, sheetId }, processingResource)
        ? { state: "processing" }
        : undefined,
    markResourceSkipped: () => undefined,
    onDidChangeSliceState: sliceStateEvent as Event<void>,
    onDidChangeTemplateSelection: Event.None,
    onDidChangeResourceSliceResult: Event.None,
    prioritize: () => undefined,
    prioritizeResource: () => undefined,
    runWithTemplate: () => undefined,
    setTemplateSelection: () => undefined,
    submit: () => undefined,
    submitResource: () => undefined,
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
    prefetch: (resources, priority) => {
      thumbnailPrefetches?.push({
        priority,
        targets: resources.map(resource => {
          if (typeof resource === "string") {
            return {
              fileId: resource,
            };
          }
          return {
            resource: resource.resource.toString(),
            sheetId: resource.sheetId ?? null,
          };
        }),
      });
    },
  } as ConstructorParameters<typeof WorkbenchDomainBridge>[0]["thumbnailPreviewService"],
});

const isSameResourceSheetForTest = (
  first: ResourceSheetIdentity,
  second: ResourceSheetIdentity,
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
