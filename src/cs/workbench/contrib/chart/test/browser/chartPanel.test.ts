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

  test("updates inspector canvas in place across plot tab switches", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.style.height = "720px";
    host.style.width = "640px";
    document.body.append(host);

    const panel = new ChartPanel(createChartProps("file-a", 2, {
      hasInspector: true,
      inspectorPointsCount: 3,
      plotType: "iv",
      visiblePanes: ["chart", "inspector"],
    }));

    try {
      host.append(panel.element);
      await animationFrames(1);

      const initialCanvases = getChartCanvases(panel);
      assert.equal(initialCanvases.length, 2);
      const [chartCanvas, inspectorCanvas] = initialCanvases;
      assert.ok(chartCanvas?.dataset.plotRenderSignature?.startsWith("file-a|iv|chart|"));
      assert.ok(inspectorCanvas?.dataset.plotRenderSignature?.startsWith("file-a|iv|inspector|"));

      panel.update(createChartProps("file-a", 4, {
        hasInspector: true,
        inspectorPointsCount: 5,
        plotType: "vth",
        visiblePanes: ["chart", "inspector"],
      }));
      await animationFrames(1);

      const nextCanvases = getChartCanvases(panel);
      assert.equal(nextCanvases.length, 2);
      assert.strictEqual(nextCanvases[0], chartCanvas);
      assert.strictEqual(nextCanvases[1], inspectorCanvas);
      assert.ok(chartCanvas?.dataset.plotRenderSignature?.startsWith("file-a|vth|chart|"));
      assert.ok(inspectorCanvas?.dataset.plotRenderSignature?.startsWith("file-a|vth|inspector|"));
    } finally {
      panel.dispose();
      host.remove();
    }
  });
});

const createChartProps = (
  fileId: string,
  pointsCount = 2,
  options: {
    readonly hasInspector?: boolean;
    readonly inspectorPointsCount?: number;
    readonly plotType?: "iv" | "ss" | "gm" | "vth";
    readonly visiblePanes?: readonly ["chart", "inspector"] | readonly ["chart"];
  } = {},
): ChartViewProps => ({
  activeFileId: fileId,
  activePlotType: options.plotType ?? "iv",
  hasChartData: true,
  plotDisplayModel: createPlotDisplayModel(fileId, pointsCount, options),
  visiblePanes: options.visiblePanes ?? ["chart"],
});

const createPlotDisplayModel = (
  fileId: string,
  pointsCount: number,
  options: {
    readonly hasInspector?: boolean;
    readonly inspectorPointsCount?: number;
    readonly plotType?: "iv" | "ss" | "gm" | "vth";
  } = {},
): PlotDisplayModel => ({
  chart: createPlotPaneDisplayModel(fileId, "chart", pointsCount, options.plotType),
  fileId,
  inspector: options.hasInspector
    ? createPlotPaneDisplayModel(
      fileId,
      "inspector",
      options.inspectorPointsCount ?? pointsCount,
      options.plotType,
    )
    : null,
  plotType: options.plotType ?? "iv",
  unitControl: null,
});

const createPlotPaneDisplayModel = (
  fileId: string,
  pane: "chart" | "inspector",
  pointsCount: number,
  plotType: "iv" | "ss" | "gm" | "vth" = "iv",
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
    plotType,
  },
  yAxisTitle: "Id",
  yAxisTitleContext: {
    axis: "y",
    fileId,
    pane,
    plotType,
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

const getChartCanvases = (panel: ChartPanel): HTMLCanvasElement[] =>
  Array.from(panel.element.querySelectorAll(".plot_main_chart_canvas"));
