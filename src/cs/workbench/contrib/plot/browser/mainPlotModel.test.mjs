import test from "node:test";
import assert from "node:assert/strict";

import {
  createMainPlotModel,
  createMainPlotSeries,
  getMainPlotYUnitLabel,
} from "./mainPlotModel.ts";

const createFile = (overrides = {}) => ({
  fileId: "file-a",
  fileName: "file-a.csv",
  xGroups: [[0, 1, 2]],
  xUnit: "V",
  yUnit: "A",
  series: [
    {
      id: "series-a",
      groupIndex: 0,
      legendValue: "Vd=0.1",
      y: [1, 2, 4],
    },
  ],
  ...overrides,
});

test("createMainPlotModel builds drawable IV series for the active file", () => {
  const model = createMainPlotModel({
    activeFileId: "file-b",
    plotType: "iv",
    cleanedData: [
      createFile(),
      createFile({
        fileId: "file-b",
        xGroups: [[-1, 0, 1]],
        series: [{ id: "series-b", groupIndex: 0, y: [-2, 0, 2] }],
      }),
    ],
  });

  assert.equal(model.activeFile?.fileId, "file-b");
  assert.equal(model.seriesList.length, 1);
  assert.equal(model.pointsCount, 3);
  assert.deepEqual(model.xDomain, [-1, 1]);
  assert.deepEqual(model.yDomain, [-2, 2]);
  assert.deepEqual(
    model.seriesList[0].data.map((point) => point.yAbsPositive),
    [2, null, 2],
  );
});

test("createMainPlotSeries derives GM points from IV source points", () => {
  const series = createMainPlotSeries(createFile(), "gm");

  assert.equal(series.length, 1);
  assert.deepEqual(
    series[0].data.map((point) => point.y),
    [1, 1.5, 2],
  );
});

test("createMainPlotSeries keeps curves without explicit ids", () => {
  const series = createMainPlotSeries(
    createFile({
      fileId: "file-c",
      series: [
        {
          groupIndex: 0,
          legendValue: "Vg=-60",
          y: [1, 2, 3],
          yCol: 3,
        },
      ],
    }),
    "iv",
  );

  assert.equal(series.length, 1);
  assert.equal(series[0].id, "file-c:x0:y3");
  assert.equal(series[0].name, "Vg=-60");
  assert.deepEqual(
    series[0].data.map((point) => point.y),
    [1, 2, 3],
  );
});

test("createMainPlotSeries reads array-like y values like thumbnails", () => {
  const series = createMainPlotSeries(
    createFile({
      xGroups: [Float64Array.from([0, 1, 2])],
      series: [
        {
          groupIndex: 0,
          legendValue: "Vg=-40",
          y: Float64Array.from([1e-5, 2e-5, 3e-5]),
          yCol: 4,
        },
      ],
    }),
    "iv",
  );

  assert.equal(series.length, 1);
  assert.deepEqual(
    series[0].data.map((point) => point.y),
    [1e-5, 2e-5, 3e-5],
  );
});

test("createMainPlotSeries derives VTH sqrt current points", () => {
  const series = createMainPlotSeries(
    createFile({
      series: [{ id: "series-a", groupIndex: 0, y: [-4, 0, 9] }],
    }),
    "vth",
  );

  assert.deepEqual(
    series[0].data.map((point) => point.y),
    [2, 0, 3],
  );
  assert.equal(getMainPlotYUnitLabel("vth", createFile()), "sqrt(|I|)");
});

test("createMainPlotModel falls back to an empty drawable domain", () => {
  const model = createMainPlotModel({
    activeFileId: "missing",
    plotType: "iv",
    cleanedData: [
      createFile({
        xGroups: [[]],
        series: [{ id: "series-a", groupIndex: 0, y: [] }],
      }),
    ],
  });

  assert.equal(model.seriesList.length, 0);
  assert.deepEqual(model.xDomain, [0, 1]);
  assert.deepEqual(model.yDomain, [0, 1]);
});
