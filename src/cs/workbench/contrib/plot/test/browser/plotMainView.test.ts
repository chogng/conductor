/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createPlotMainChart } from "src/cs/workbench/contrib/plot/browser/plotMainChart";
import { createPlotMainChartProps } from "src/cs/workbench/contrib/plot/browser/plotMainView";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/plot/test/browser/plotMainView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps persisted axis drawing settings into chart props", () => {
    const props = createPlotMainChartProps({
      model: createPlotModel(),
	      originOpenPlotOptions: {
	        command: "",
	        legendFontSize: 18,
	        lineWidth: 3,
        postCommands: [],
        symbolShape: 5,
        type: 202,
        xyPairs: "((1,2))",
      },
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
    assert.equal(props.curveLineWidth, 3);
    assert.equal(props.curvePlotType, 202);
    assert.equal(props.curveSymbolShape, 5);
  });

  test("waits for a stable connected layout before drawing the first main chart frame", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart(createPlotMainChartProps({
      model: createPlotModel(),
      plotType: "iv",
    }));
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);
    assert.equal(canvas.style.width, "");

    try {
      host.append(element);
      await animationFrames(3);

      assert.equal(canvas.style.width, "640px");
      assert.equal(canvas.style.height, "360px");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("keeps waiting when the main chart is mounted after the first frame", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart(createPlotMainChartProps({
      model: createPlotModel(),
      plotType: "iv",
    }));
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);

    try {
      await animationFrames(1);
      assert.equal(canvas.style.width, "");

      host.append(element);
      await animationFrames(3);

      assert.equal(canvas.style.width, "640px");
      assert.equal(canvas.style.height, "360px");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("draws eager main chart on the first connected frame", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart({
      ...createPlotMainChartProps({
        model: createPlotModel(),
        plotType: "iv",
      }),
      drawStrategy: "eager",
    });
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);
    assert.equal(canvas.style.width, "");

    try {
      host.append(element);
      await animationFrames(1);

      assert.equal(canvas.style.width, "640px");
      assert.equal(canvas.style.height, "360px");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("uses the connected chart host height without forcing the fallback minimum", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "156px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart(createPlotMainChartProps({
      model: createPlotModel(),
      plotType: "iv",
    }));
    element.style.minHeight = "0";
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    const hoverCanvas = element.querySelector(".plot_main_chart_hover_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);
    assert.ok(hoverCanvas);

    try {
      host.append(element);
      await animationFrames(3);

      assert.equal(canvas.style.width, "640px");
      assert.equal(canvas.style.height, "156px");
      assert.equal(hoverCanvas.style.width, "640px");
      assert.equal(hoverCanvas.style.height, "156px");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("marks the canvas with the rendered plot signature", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart({
      ...createPlotMainChartProps({
        model: createPlotModel(),
        plotType: "iv",
        renderSignature: "file-a|iv|chart",
      }),
      drawStrategy: "eager",
    });
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);

    try {
      host.append(element);
      await animationFrames(1);

      assert.equal(canvas.dataset.plotRenderSignature, "file-a|iv|chart");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("updates the rendered plot signature without replacing the canvas", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const element = createPlotMainChart({
      ...createPlotMainChartProps({
        model: createPlotModel(),
        plotType: "iv",
        renderSignature: "file-a|iv|chart",
      }),
      drawStrategy: "eager",
    });
    const canvas = element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
    assert.ok(canvas);

    try {
      host.append(element);
      await animationFrames(1);
      assert.equal(canvas.dataset.plotRenderSignature, "file-a|iv|chart");

      element.update({
        ...createPlotMainChartProps({
          model: createPlotModel(4),
          plotType: "iv",
          renderSignature: "file-b|iv|chart",
        }),
        drawStrategy: "eager",
      });
      await animationFrames(1);

      assert.equal(element.querySelector(".plot_main_chart_canvas"), canvas);
      assert.equal(canvas.dataset.plotRenderSignature, "file-b|iv|chart");
    } finally {
      element.dispose();
      host.remove();
    }
  });

  test("draws large series through a display downsample budget", async () => {
    if (typeof document === "undefined" || typeof CanvasRenderingContext2D === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const originalLineTo = CanvasRenderingContext2D.prototype.lineTo;
    let lineToCount = 0;
    CanvasRenderingContext2D.prototype.lineTo = function patchedLineTo(
      this: CanvasRenderingContext2D,
      x: number,
      y: number,
    ): void {
      lineToCount += 1;
      return originalLineTo.call(this, x, y);
    };

    const element = createPlotMainChart({
      ...createPlotMainChartProps({
        model: createPlotModel(5000),
        plotType: "iv",
      }),
      showAxes: false,
      showGrid: false,
    });

    try {
      host.append(element);
      await animationFrames(3);

      assert.ok(lineToCount > 0);
      assert.ok(lineToCount < 2000, `expected downsampled draw calls, got ${lineToCount}`);
    } finally {
      CanvasRenderingContext2D.prototype.lineTo = originalLineTo;
      element.dispose();
      host.remove();
    }
  });
});

const createPlotModel = (pointsCount = 2): PlotMainRenderModel => ({
  axisLabels: {
    xLabel: "Vd",
    yLabel: "Id",
  },
  pointsCount,
  seriesList: [{
    data: Array.from({ length: pointsCount }, (_, index) => ({
      x: pointsCount <= 1 ? 0 : index / (pointsCount - 1),
      y: Math.sin(index / 20),
    })),
    id: "series-a",
    name: "Series A",
  }],
  xDomain: [0, 1],
  xUnitLabel: "V",
  yDomain: [0, 1],
  yUnitLabel: "A",
});

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};
