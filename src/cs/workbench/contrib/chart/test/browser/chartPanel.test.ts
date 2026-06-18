/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import ChartPanel from "src/cs/workbench/contrib/chart/browser/chartPanel";
import type { ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";
import type {
  PlotDisplayModel,
  PlotPaneDisplayModel,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/chart/test/browser/chartPanel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("updates chart content in place across active file switches", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const panel = new ChartPanel(createChartProps("file-a"));

    try {
      host.append(panel.element);
      await animationFrames(1);

      const canvas = panel.element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
      assert.ok(canvas);
      assert.ok(canvas.dataset.plotRenderSignature?.startsWith("file-a|"));

      panel.update(createChartProps("file-b", 4));
      assert.equal(panel.element.querySelector(".plot_main_chart_canvas"), canvas);
      assert.ok(canvas.dataset.plotRenderSignature?.startsWith("file-b|"));

      await animationFrames(1);

      assert.equal(panel.element.querySelector(".plot_main_chart_canvas"), canvas);
      assert.ok(canvas.dataset.plotRenderSignature?.startsWith("file-b|"));
    } finally {
      panel.dispose();
      host.remove();
    }
  });

  test("shows fast pending display without keeping a stale canvas", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "360px";
    host.style.width = "640px";
    document.body.append(host);

    const panel = new ChartPanel(createChartProps("file-a"));

    try {
      host.append(panel.element);
      await animationFrames(1);

      const canvas = panel.element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
      assert.ok(canvas);
      assert.ok(canvas.dataset.plotRenderSignature?.startsWith("file-a|"));

      panel.update({
        ...createChartProps("file-b"),
        plotDisplayModel: null,
        processingStatus: { state: "processing" },
      });

      assert.equal(panel.element.querySelector(".plot_main_chart_canvas"), null);
      const pending = panel.element.querySelector(".chart_view") as HTMLElement | null;
      assert.equal(pending?.dataset.chartDisplayState, "pending");
      assert.equal(pending?.dataset.pendingFileId, "file-b");

      panel.update(createChartProps("file-b", 4));
      const nextCanvas = panel.element.querySelector(".plot_main_chart_canvas") as HTMLCanvasElement | null;
      assert.ok(nextCanvas);
      assert.ok(nextCanvas.dataset.plotRenderSignature?.startsWith("file-b|"));
    } finally {
      panel.dispose();
      host.remove();
    }
  });
});

const createChartProps = (
  fileId: string,
  pointsCount = 2,
): ChartViewProps => ({
  activeFileId: fileId,
  activePlotType: "iv",
  hasChartData: true,
  plotDisplayModel: createPlotDisplayModel(fileId, pointsCount),
  visiblePanes: ["chart"],
});

const createPlotDisplayModel = (
  fileId: string,
  pointsCount: number,
): PlotDisplayModel => ({
  chart: createPlotPaneDisplayModel(fileId, "chart", pointsCount),
  fileId,
  inspector: null,
  plotType: "iv",
  unitControl: null,
});

const createPlotPaneDisplayModel = (
  fileId: string,
  pane: "chart" | "inspector",
  pointsCount: number,
): PlotPaneDisplayModel => ({
  defaultXAxisTitle: "Vd",
  defaultYAxisTitle: "Id",
  model: createPlotModel(pointsCount),
  plotXFactor: 1,
  plotXUnitLabel: "V",
  plotYFactor: 1,
  plotYUnitLabel: "A",
  xAxisTitle: "Vd",
  xAxisTitleContext: {
    axis: "x",
    fileId,
    pane,
    plotType: "iv",
  },
  yAxisTitle: "Id",
  yAxisTitleContext: {
    axis: "y",
    fileId,
    pane,
    plotType: "iv",
  },
  yScaleMode: "linear",
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
