/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { IStorageService } from "src/cs/platform/storage/common/storage";
import {
  createCalculationResourceId,
  type CalculationResourceResult,
  type ICalculationService,
} from "src/cs/workbench/services/calculation/common/calculation";
import type { PlotCalculatedDataWorkerClient } from "src/cs/workbench/services/plot/browser/plotCalculatedDataWorkerClient";
import { PlotService } from "src/cs/workbench/services/plot/browser/plotService";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/plot/test/browser/plotService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("reads calculated data only from an identified calculation resource", () => {
    const target = createTarget();
    const service = store.add(createPlotService([createCalculationResult(target)]));

    const calculated = service.getCalculatedData({ ...target, plotType: "iv" });

    assert.ok(calculated);
    assert.equal(calculated.source.inputKind, "calculationResource");
    assert.equal(calculated.seriesList[0]?.name, "Drain Current");
    assert.strictEqual(service.getCachedCalculatedData({ ...target, plotType: "iv" }), calculated);
  });

  test("preserves resource identity in display and legend models", () => {
    const target = createTarget();
    const service = store.add(createPlotService([createCalculationResult(target)]));

    const display = service.getPlotDisplayModel({ ...target, plotType: "iv" });
    const legend = service.getPlotLegendModel({ ...target, plotType: "iv" });

    assert.ok(display);
    assert.ok(legend);
    assert.equal(display.resource?.toString(), target.resource.toString());
    assert.equal(display.sheetId, target.sheetId);
    assert.equal(display.chart.xAxisTitleContext.resource?.toString(), target.resource.toString());
    assert.equal(legend.resource?.toString(), target.resource.toString());
    assert.equal(legend.sheetId, target.sheetId);
  });

  test("owns plot state by calculation resource identity", () => {
    const target = createTarget();
    const service = store.add(createPlotService([createCalculationResult(target)]));
    const display = service.getPlotDisplayModel({ ...target, plotType: "iv" });
    assert.ok(display);
    let subscribedSeriesColors: {
      readonly chart: readonly string[];
      readonly inspector: readonly string[];
    } = {
      chart: [],
      inspector: [],
    };
    store.add(service.onDidChangePlotState(() => {
      const subscribedDisplay = service.getCachedPlotDisplayModel({
        ...target,
        plotType: "iv",
      });
      subscribedSeriesColors = {
        chart: subscribedDisplay?.chart.model.seriesList.map(series => series.color ?? "") ?? [],
        inspector: subscribedDisplay?.inspector?.model.seriesList.map(series => series.color ?? "") ?? [],
      };
    }));

    service.setAxisTitleOverride(
      display.chart.xAxisTitleContext,
      "Gate Bias",
      display.chart.defaultXAxisTitle,
    );
    service.setLegendLabel(target, "series-a", "Renamed");

    const updated = service.getPlotDisplayModel({ ...target, plotType: "iv" });
    assert.equal(updated?.chart.xAxisTitle, "Gate Bias");
    assert.equal(updated?.chart.model.seriesList[0]?.name, "Renamed");

    service.toggleHiddenLegendKey(target, "iv", "series-a", ["series-a", "series-b"]);
    assert.deepEqual({
      hiddenLegendKeys: service.getHiddenLegendKeys(target, "iv", ["series-a", "series-b"]),
      subscribedSeriesColors,
    }, {
      hiddenLegendKeys: ["series-a"],
      subscribedSeriesColors: {
        chart: ["#F14040"],
        inspector: ["#F14040"],
      },
    });

    service.toggleHiddenLegendKey(target, "iv", "series-a", ["series-a", "series-b"]);
    assert.deepEqual({
      hiddenLegendKeys: service.getHiddenLegendKeys(target, "iv", ["series-a", "series-b"]),
      subscribedSeriesColors,
    }, {
      hiddenLegendKeys: [],
      subscribedSeriesColors: {
        chart: ["#515151", "#F14040"],
        inspector: ["#515151", "#F14040"],
      },
    });
  });

  test("invalidates only the changed calculation resource", () => {
    const first = createTarget("first.csv", "Sheet 1");
    const second = createTarget("second.csv", "Sheet 2");
    const changes = store.add(new Emitter<{ readonly resource: URI; readonly sheetId?: string | null }>());
    const service = store.add(createPlotService([
      createCalculationResult(first),
      createCalculationResult(second),
    ], changes));

    assert.ok(service.getPlotDisplayModel({ ...first, plotType: "iv" }));
    const secondModel = service.getPlotDisplayModel({ ...second, plotType: "iv" });
    assert.ok(secondModel);

    changes.fire(first);

    assert.equal(service.getCachedPlotDisplayModel({ ...first, plotType: "iv" }), null);
    assert.strictEqual(
      service.getCachedPlotDisplayModel({ ...second, plotType: "iv" })?.chart,
      secondModel.chart,
    );
  });
});

type PlotTarget = {
  readonly resource: URI;
  readonly sheetId: string;
};

const createPlotService = (
  results: readonly CalculationResourceResult[],
  changes?: Emitter<{ readonly resource: URI; readonly sheetId?: string | null }>,
): PlotService => new PlotService(
  {
    calculateDisplayModel: async () => null,
    dispose: () => undefined,
  } as unknown as PlotCalculatedDataWorkerClient,
  {
    getConductorSettings: () => null,
    onDidChangeConductorSettings: Event.None,
  } as ISettingsService,
  createStorageServiceStub(),
  {
    getResourceResult: (resource: URI, sheetId?: string | null) => results.find(result =>
      createCalculationResourceId(result.resource, result.sheetId) ===
      createCalculationResourceId(resource, sheetId)
    ) ?? null,
    onDidChangeResourceCalculationResult: changes?.event ?? Event.None,
    prioritizeResource: () => undefined,
  } as unknown as ICalculationService,
);

const createTarget = (
  fileName = "transfer.csv",
  sheetId = "Sheet 1",
): PlotTarget => ({
  resource: URI.file(`/workspace/data/${fileName}`),
  sheetId,
});

const createCalculationResult = (
  target: PlotTarget,
): CalculationResourceResult => ({
  axis: {
    xAxisRole: "vg",
    xLabel: "Gate Voltage",
    xUnit: "V",
    yLabel: "Drain Current",
    yUnit: "A",
  },
  completedAt: 1,
  curvesByKey: {
    "base:iv:transfer:series-a": {
      curveFamily: "iv",
      curveGeneration: "base",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: {
          seriesId: "series-a",
        },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [{ x: 0, y: 0.001 }, { x: 1, y: 0.002 }],
      seriesId: "series-a",
      signature: "curve-a",
    },
    "base:iv:transfer:series-b": {
      curveFamily: "iv",
      curveGeneration: "base",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: {
          seriesId: "series-b",
        },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [{ x: 0, y: 0.003 }, { x: 1, y: 0.004 }],
      seriesId: "series-b",
      signature: "curve-b",
    },
  },
  inputSignature: "input-a",
  metricsByKey: {},
  requestSignature: "request-a",
  resource: target.resource,
  seriesById: {
    "series-a": {
      groupIndex: 0,
      id: "series-a",
      name: "Drain Current",
      y: [0.001, 0.002],
    },
    "series-b": {
      groupIndex: 1,
      id: "series-b",
      name: "Detected Output",
      y: [0.003, 0.004],
    },
  },
  seriesOrder: ["series-a", "series-b"],
  sheetId: target.sheetId,
  sourceModelVersion: 1,
  sourceVersion: 1,
});

const createStorageServiceStub = (): IStorageService => {
  const values = new Map<string, unknown>();
  return {
    getObject: <T>(_key: string, _scope: unknown, fallback: T): T => fallback,
    store: (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as unknown as IStorageService;
};
