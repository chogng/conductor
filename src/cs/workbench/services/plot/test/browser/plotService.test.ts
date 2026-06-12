/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { Event } from "src/cs/base/common/event";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import {
  PlotService,
  shouldInvalidatePlotModelsForSessionChange,
} from "src/cs/workbench/services/plot/browser/plotService";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/plot/test/browser/plotService", () => {
  test("owns active plot type outside session", () => {
    const service = new PlotService(createSessionServiceStub(), createSettingsServiceStub());
    let changeCount = 0;
    const disposable = service.onDidChangePlotState(() => {
      changeCount += 1;
    });

    service.setActivePlotType("gm");
    service.setActivePlotType("gm");

    assert.equal(service.getState().activePlotType, "gm");
    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("creates display models with legend visibility, labels, units, and scale", () => {
    const service = new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "mV" },
        yScaleByFileId: { "file-a": "log" },
        yUnitByFileId: { "file-a": "mA" },
      }),
    );
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
      yScale: "log",
      yUnit: "mA",
    });
  });

  test("owns axis title overrides by plot context", () => {
    const service = new PlotService(createSessionServiceStub(), createSettingsServiceStub());
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

  test("updates unit and scale settings through plot owner API", async () => {
    const updates: unknown[] = [];
    const service = new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-b": "V" },
        yScaleByFileId: {},
        yUnitByFileId: {},
      }, updates),
    );
    let changeCount = 0;
    const disposable = service.onDidChangePlotState(() => {
      changeCount += 1;
    });

    await service.setAxisUnit("file-a", "x", "mV");
    await service.setAxisUnit("file-a", "y", "uA");
    await service.setYScale("file-a", "log");
    await service.setYScale("file-a", "log");

    assert.deepEqual(updates, [
      { xUnitByFileId: { "file-b": "V", "file-a": "mV" } },
      { yUnitByFileId: { "file-a": "uA" } },
      { yScaleByFileId: { "file-a": "log" } },
    ]);
    assert.equal(changeCount, 3);
    disposable.dispose();
  });
});

const createSessionServiceStub = (): ISessionService => ({
  _serviceBrand: undefined,
  onDidChangeSession: Event.None as Event<SessionChangeEvent>,
  clearMetricInput: () => undefined,
  clearSession: () => undefined,
  commitCurves: () => undefined,
  commitFileImport: () => undefined,
  commitMetrics: () => undefined,
  commitRawTableAssessment: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot: createSnapshot,
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

const createSnapshot = (): SessionSnapshot => ({
  fileOrder: ["file-a"],
  filesById: {
    "file-a": createFileRecord(),
  },
  schemaVersion: 1,
  sessionVersion: 1,
});

const createFileRecord = (): FileRecord => ({
  assessmentsByRawTableId: {},
  curvesByKey: {
    "base:iv:transfer:series-a": {
      curveFamily: "iv",
      curveGeneration: "base",
      fileId: "file-a",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { fileId: "file-a", seriesId: "series-a" },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [
        { x: 0, y: 0.001 },
        { x: 1, y: 0.002 },
      ],
      seriesId: "series-a",
      signature: "base-a",
    },
    "base:iv:transfer:series-b": {
      curveFamily: "iv",
      curveGeneration: "base",
      fileId: "file-a",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { fileId: "file-a", seriesId: "series-b" },
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
  id: "file-a",
  kind: "unknown",
  latestTemplateRunId: "run-a",
  measurementBlockOrder: [],
  measurementBlocksById: {},
  metricsByKey: {},
  name: "file-a.csv",
  raw: {
    fileId: "file-a",
    fileName: "file-a.csv",
    tableOrder: [],
    tablesById: {},
  },
  rawTableVersionsById: {},
  seriesById: {
    "series-a": {
      fileId: "file-a",
      groupIndex: 0,
      id: "series-a",
      name: "A",
      y: [0.001, 0.002],
    },
    "series-b": {
      fileId: "file-a",
      groupIndex: 1,
      id: "series-b",
      name: "B",
      y: [0.003, 0.004],
    },
  },
  seriesOrder: ["series-a", "series-b"],
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
        xUnit: "V",
        yColumns: [1, 2],
        yLegendTarget: "auto",
        yUnit: "A",
      },
      configFingerprint: "config-a",
      errors: [],
      fileId: "file-a",
      id: "run-a",
      mode: "auto",
      outputCurveKeys: [
        "base:iv:transfer:series-a",
        "base:iv:transfer:series-b",
      ],
      outputSeriesIds: ["series-a", "series-b"],
      selection: { kind: "auto" },
      sourceBlockIds: [],
      warnings: [],
    },
  },
});
