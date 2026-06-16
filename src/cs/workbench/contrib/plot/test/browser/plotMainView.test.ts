/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createPlotMainChartProps } from "src/cs/workbench/contrib/plot/browser/plotMainView";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";

suite("workbench/contrib/plot/test/browser/plotMainView", () => {
  test("maps persisted axis drawing settings into chart props", () => {
    const props = createPlotMainChartProps({
      model: createPlotModel(),
      plotAxisSettings: {
        showGrid: false,
        showMajorTicks: false,
        showMinorTicks: false,
      },
      plotType: "iv",
    });

    assert.equal(props.showGrid, false);
    assert.equal(props.showMajorTicks, false);
    assert.equal(props.showMinorTicks, false);
  });
});

const createPlotModel = (): PlotMainRenderModel => ({
  axisLabels: {
    xLabel: "Vd",
    yLabel: "Id",
  },
  pointsCount: 2,
  seriesList: [{
    data: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    id: "series-a",
    name: "Series A",
  }],
  xDomain: [0, 1],
  xUnitLabel: "V",
  yDomain: [0, 1],
  yUnitLabel: "A",
});
