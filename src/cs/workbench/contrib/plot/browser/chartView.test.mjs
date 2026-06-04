import test from "node:test";
import assert from "node:assert/strict";

import {
  createChartAxisTitleChangeEvent,
  getDisplayPlotSeries,
  getPlotLegendSeries,
  getRenderMaxPointsPerSeries,
  getRenderPointBudget,
} from "./chartView.ts";
import { SIGNED_LOG_Y_DATA_KEY } from "./chartViewModel.ts";

test("getPlotLegendSeries selects the active plot family", () => {
  const byType = {
    gm: [{ id: "gm" }],
    iv: [{ id: "iv" }],
    ss: [{ id: "ss" }],
    vth: [{ id: "vth" }],
  };

  assert.deepEqual(getPlotLegendSeries({ effectivePlotType: "gm", plotSeriesByType: byType }), byType.gm);
  assert.deepEqual(getPlotLegendSeries({ effectivePlotType: "vth", plotSeriesByType: byType }), byType.vth);
  assert.deepEqual(getPlotLegendSeries({ effectivePlotType: "ss", plotSeriesByType: byType }), byType.ss);
  assert.deepEqual(getPlotLegendSeries({ effectivePlotType: "iv", plotSeriesByType: byType }), byType.iv);
});

test("getDisplayPlotSeries filters hidden series and preserves anonymous series", () => {
  const series = [
    { id: "a", data: [{ x: 1, y: 1 }] },
    { id: "b", data: [{ x: 1, y: 2 }] },
    { data: [{ x: 1, y: 3 }] },
  ];

  assert.deepEqual(
    getDisplayPlotSeries({
      plotLegendSeries: series,
      visibleSeriesKeySet: new Set(["b"]),
      yLogCurrentMode: "positive",
      yScaleMode: "linear",
    }).map((item) => item.id ?? "anonymous"),
    ["b", "anonymous"],
  );
});

test("getDisplayPlotSeries adds signed log positive points for all-current log mode", () => {
  const result = getDisplayPlotSeries({
    plotLegendSeries: [
      {
        data: [
          { x: 1, y: -2 },
          { x: 2, y: 3 },
        ],
        id: "a",
      },
    ],
    visibleSeriesKeySet: new Set(["a"]),
    yLogCurrentMode: "all",
    yScaleMode: "log",
  });

  assert.equal(result[0].data[0][SIGNED_LOG_Y_DATA_KEY], 2);
  assert.equal(result[0].data[1][SIGNED_LOG_Y_DATA_KEY], 3);
});

test("render point budget clamps adaptive per-series count", () => {
  assert.equal(
    getRenderPointBudget({
      defaultBudget: 12000,
      effectivePlotType: "gm",
      gmBudget: 9000,
    }),
    9000,
  );
  assert.equal(
    getRenderMaxPointsPerSeries({
      maxPoints: 600,
      minPoints: 120,
      renderPointBudget: 9000,
      seriesCount: 100,
    }),
    120,
  );
  assert.equal(
    getRenderMaxPointsPerSeries({
      maxPoints: 600,
      minPoints: 120,
      renderPointBudget: 12000,
      seriesCount: 2,
    }),
    600,
  );
});

test("createChartAxisTitleChangeEvent trims title text", () => {
  assert.deepEqual(createChartAxisTitleChangeEvent("x", " Gate "), {
    axis: "x",
    title: "Gate",
  });
});
