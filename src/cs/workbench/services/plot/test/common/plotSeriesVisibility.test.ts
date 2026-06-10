/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  filterCalculatedDataSeries,
  type PlotSeriesVisibilityModel,
} from "src/cs/workbench/services/plot/common/plotSeriesVisibility";

suite("workbench/services/plot/common/plotSeriesVisibility", () => {
  test("filters hidden legend items and recomputes domains", () => {
    const model = createModel();

    const filtered = filterCalculatedDataSeries(model, ["series-b"]);

    assert.deepEqual(filtered.seriesList.map((series) => series.id), ["series-a"]);
    assert.equal(filtered.pointsCount, 2);
    assert.notEqual(filtered.signature, model.signature);
    assert.deepEqual(filtered.xDomain, [0, 1]);
    assert.deepEqual(filtered.yDomain, [10, 20]);
  });

  test("keeps source domains when all legend items are hidden", () => {
    const model = createModel();

    const filtered = filterCalculatedDataSeries(model, ["series-a", "series-b"]);

    assert.deepEqual(filtered.seriesList, []);
    assert.equal(filtered.pointsCount, 0);
    assert.deepEqual(filtered.xDomain, [-2, 1]);
    assert.deepEqual(filtered.yDomain, [-20, 20]);
  });
});

const createModel = (): PlotSeriesVisibilityModel => ({
  activeFile: null,
  kind: "iv",
  pointsCount: 4,
  seriesList: [
    {
      data: [
        { x: 0, y: 10, yAbsPositive: 10, yPositive: 10 },
        { x: 1, y: 20, yAbsPositive: 20, yPositive: 20 },
      ],
      id: "series-a",
      kind: "iv",
      name: "A",
    },
    {
      data: [
        { x: -2, y: -20, yAbsPositive: 20, yPositive: null },
        { x: -1, y: -10, yAbsPositive: 10, yPositive: null },
      ],
      id: "series-b",
      kind: "iv",
      name: "B",
    },
  ],
  signature: "model-signature",
  source: {
    fileId: "file-a",
    inputKind: "processed",
  },
  xDomain: [-2, 1],
  xUnitLabel: "V",
  yDomain: [-20, 20],
  yUnitLabel: "A",
});
