/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  BaseCurveKey,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  PlotService,
  shouldInvalidatePlotModelsForSessionChange,
} from "src/cs/workbench/services/plot/browser/plotService";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/plot/test/browser/plotService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("owns active plot type outside session", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    let changeCount = 0;
    store.add(service.onDidChangePlotState(() => {
      changeCount += 1;
    }));

    service.setActivePlotType("gm");
    service.setActivePlotType("gm");

    assert.equal(service.getState().activePlotType, "gm");
    assert.equal(changeCount, 1);
  });

  test("creates display models with legend visibility, labels, units, and scale", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "mV" },
        yScaleByFileId: { "file-a": "log" },
        yUnitByFileId: { "file-a": "mA" },
      }),
      store.add(new TestStorageService()),
    ));
    const displayModel = service.getPlotDisplayModel({
      hiddenLegendKeys: ["series-b"],
      legendLabels: { "series-a": "Edited A" },
      snapshot: createSnapshot(),
    });

    assert.equal(displayModel?.fileId, "file-a");
    assert.equal(displayModel?.chart.model.seriesList.length, 1);
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "Edited A");
    assert.equal(displayModel?.chart.plotXFactor, 1000);
    assert.equal(displayModel?.chart.plotYFactor, 1000);
    assert.equal(displayModel?.chart.plotXUnitLabel, "mV");
    assert.equal(displayModel?.chart.plotYUnitLabel, "mA");
    assert.equal(displayModel?.chart.yScaleMode, "log");
    assert.deepEqual(displayModel?.unitControl, {
      fileId: "file-a",
      xUnit: "mV",
      xUnitOptions: ["V", "mV", "uV", "kV"],
      yScale: "log",
      yUnit: "mA",
      yUnitOptions: ["A", "mA", "uA", "nA", "pA"],
    });
  });

  test("limits y unit controls to the current plot output family", () => {
    const currentService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "F" },
      }),
      store.add(new TestStorageService()),
    ));
    const currentDisplayModel = currentService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "A"),
      }),
    });

    assert.equal(currentDisplayModel?.chart.plotYUnitLabel, "A");
    assert.deepEqual(currentDisplayModel?.unitControl?.yUnitOptions, [
      "A",
      "mA",
      "uA",
      "nA",
      "pA",
    ]);

    const capacitanceService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const capacitanceDisplayModel = capacitanceService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F"),
      }),
    });

    assert.equal(capacitanceDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(capacitanceDisplayModel?.unitControl?.yUnitOptions, [
      "F",
      "mF",
      "uF",
      "nF",
      "pF",
    ]);

    const frequencyService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "kHz" },
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const frequencyDisplayModel = frequencyService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F", "Hz"),
      }),
    });

    assert.equal(frequencyDisplayModel?.chart.plotXFactor, 1e-3);
    assert.equal(frequencyDisplayModel?.chart.plotXUnitLabel, "kHz");
    assert.equal(frequencyDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(frequencyDisplayModel?.unitControl?.xUnitOptions, [
      "Hz",
      "kHz",
      "MHz",
      "GHz",
    ]);

    const invalidFrequencyDisplayModel = frequencyService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F", "V"),
      }),
    });
    assert.equal(invalidFrequencyDisplayModel?.chart.plotXUnitLabel, "V");
    assert.deepEqual(invalidFrequencyDisplayModel?.unitControl?.xUnitOptions, [
      "V",
      "mV",
      "uV",
      "kV",
    ]);

    const gmDisplayModel = currentService.getPlotDisplayModel({
      plotType: "gm",
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "A"),
      }),
    });

    assert.equal(gmDisplayModel?.chart.plotYUnitLabel, undefined);
    assert.equal(gmDisplayModel?.unitControl?.yUnit, null);
    assert.deepEqual(gmDisplayModel?.unitControl?.yUnitOptions, []);
  });

  test("creates display models for the requested file", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const displayModel = service.getPlotDisplayModel({
      fileId: "file-b",
      snapshot: createSnapshot({
        "file-a": createFileRecord(),
        "file-b": createFileRecord("file-b", "series-c", "C"),
      }, ["file-a", "file-b"]),
    });

    assert.equal(displayModel?.fileId, "file-b");
    assert.equal(displayModel?.chart.model.seriesList[0]?.id, "series-c");
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "C");
  });

  test("caches calculated data per file record and plot type", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();

    const first = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });
    const second = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });
    const differentPlot = service.getCalculatedData({
      fileId: "file-a",
      plotType: "gm",
      snapshot,
    });

    assert.equal(first, second);
    assert.notEqual(first, differentPlot);
  });

  test("owns axis title overrides by plot context", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();
    const initial = service.getPlotDisplayModel({ snapshot });
    assert.equal(initial?.chart.xAxisTitle, "Gate (V)");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      "Custom X",
      initial!.chart.defaultXAxisTitle,
    );
    const edited = service.getPlotDisplayModel({ snapshot });
    assert.equal(edited?.chart.xAxisTitle, "Custom X");
    assert.equal(edited?.inspector.xAxisTitle, "Gate (V)");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      initial!.chart.defaultXAxisTitle,
      initial!.chart.defaultXAxisTitle,
    );
    const restored = service.getPlotDisplayModel({ snapshot });
    assert.equal(restored?.chart.xAxisTitle, "Gate (V)");
  });

  test("removes legend label override when label is reset", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    service.setLegendLabel("file-a", "series-a", "Edited");
    service.setLegendLabel("file-a", "series-a", null);

    assert.deepEqual(service.getLegendLabels("file-a"), {});
  });

  test("invalidates plot models only for plot-relevant session changes", () => {
    for (const reason of [
      "templateRunChanged",
      "curvesChanged",
      "metricsChanged",
      "filesRemoved",
      "sessionCleared",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent(reason, 1)),
        true,
        reason,
      );
    }

    for (const reason of [
      "rawTablesChanged",
      "assessmentChanged",
      "metricInputsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
  });

  test("updates unit and scale storage through plot owner API", async () => {
    const storageService = store.add(new TestStorageService());
    storageService.store(
      "plot.xUnitByFileId",
      { "file-b": "V" },
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      storageService,
    ));
    let changeCount = 0;
    store.add(service.onDidChangePlotState(() => {
      changeCount += 1;
    }));

    await service.setAxisUnit("file-a", "x", "mV");
    await service.setAxisUnit("file-a", "y", "uA");
    await service.setYScale("file-a", "log");
    await service.setYScale("file-a", "log");

    assert.deepEqual({
      xUnitByFileId: storageService.getObject("plot.xUnitByFileId", StorageScope.PROFILE),
      yUnitByFileId: storageService.getObject("plot.yUnitByFileId", StorageScope.PROFILE),
      yScaleByFileId: storageService.getObject("plot.yScaleByFileId", StorageScope.PROFILE),
    }, {
      xUnitByFileId: { "file-b": "V", "file-a": "mV" },
      yUnitByFileId: { "file-a": "uA" },
      yScaleByFileId: { "file-a": "log" },
    });
    assert.equal(changeCount, 3);
  });
});

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    return [...this.values.keys()]
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

const createSessionServiceStub = (): ISessionService => ({
  _serviceBrand: undefined,
  onDidChangeSession: Event.None as Event<SessionChangeEvent>,
  clearMetricInput: () => undefined,
  clearSession: () => undefined,
  commitCurves: () => undefined,
  commitCurvesBatch: () => undefined,
  commitFileImport: () => ({
    importedFileIds: [],
    skippedDuplicateFileIds: [],
  }),
  commitMetrics: () => undefined,
  commitMetricsBatch: () => undefined,
  commitRawTableAssessment: () => undefined,
  commitRawTableAssessments: () => undefined,
  commitTemplateOutput: () => undefined,
  commitTemplateOutputs: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot: createSnapshot,
  renameFile: () => false,
  removeFiles: () => undefined,
  setMetricInput: () => undefined,
});

const createSettingsServiceStub = (
  initialSettings: ConductorSettings | null = {
    xUnitByFileId: {},
    yScaleByFileId: {},
    yUnitByFileId: {},
  },
  updatesLog: unknown[] = [],
): ISettingsService => {
  let settings = initialSettings;
  return {
    _serviceBrand: undefined,
    getConductorSettings: () => settings,
    onDidChangeConductorSettings: Event.None,
    onDidChangeSettingsViewInput: Event.None,
    updateSettings: async (updates: unknown) => {
      updatesLog.push(updates);
      settings = {
        ...(settings ?? {}),
        ...(updates && typeof updates === "object" ? updates : {}),
      };
      return settings;
    },
  } as ISettingsService;
};

const createSnapshot = (
  filesById: Record<string, FileRecord> = {
    "file-a": createFileRecord(),
  },
  fileOrder: string[] = ["file-a"],
): SessionSnapshot => ({
  fileOrder,
  filesById,
  schemaVersion: 1,
  sessionVersion: 1,
});

const createFileRecord = (
  fileId = "file-a",
  seriesA = "series-a",
  seriesAName = "A",
  yUnit = "A",
  xUnit = "V",
): FileRecord => {
  const curveAKey = `base:iv:transfer:${seriesA}` as BaseCurveKey;
  const curveBKey = "base:iv:transfer:series-b" as BaseCurveKey;

  return {
    assessmentsByRawTableId: {},
    curvesByKey: {
      [curveAKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId: seriesA },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 0.001 },
          { x: 1, y: 0.002 },
        ],
        seriesId: seriesA,
        signature: "base-a",
      },
      [curveBKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId: "series-b" },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 0.003 },
          { x: 1, y: 0.004 },
        ],
        seriesId: "series-b",
        signature: "base-b",
      },
    },
    id: fileId,
    kind: "unknown",
    latestTemplateRunId: "run-a",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: `${fileId}.csv`,
    raw: {
      fileId,
      fileName: `${fileId}.csv`,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {
      [seriesA]: {
        fileId,
        groupIndex: 0,
        id: seriesA,
        name: seriesAName,
        y: [0.001, 0.002],
      },
      "series-b": {
        fileId,
        groupIndex: 1,
        id: "series-b",
        name: "B",
        y: [0.003, 0.004],
      },
    },
    seriesOrder: [seriesA, "series-b"],
    templateRunsById: {
      "run-a": {
        appliedAt: 1,
        config: {
          bottomTitle: "Gate",
          leftTitle: "Drain current",
          stopOnError: false,
        xDataEnd: 1,
        xDataStart: 0,
        xSegmentationMode: "auto",
        xUnit,
        yColumns: [1, 2],
        yLegendTarget: "auto",
        yUnit,
      },
        configFingerprint: "config-a",
        errors: [],
        fileId,
        id: "run-a",
        mode: "auto",
        outputCurveKeys: [
          curveAKey,
          curveBKey,
        ],
        outputSeriesIds: [seriesA, "series-b"],
        selection: { kind: "auto" },
        sourceBlockIds: [],
        warnings: [],
      },
    },
  };
};
