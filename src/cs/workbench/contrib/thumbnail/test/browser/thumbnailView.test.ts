/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  createThumbnailView,
  updateThumbnailView,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailView";

suite("workbench/contrib/thumbnail/test/browser/thumbnailView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("waits for stable canvas layout before drawing thumbnail content", async () => {
    if (typeof document === "undefined") {
      return;
    }

    let drawCalls = 0;
    const node = createThumbnailView({
      file: {
        fileId: "file-a",
        fileName: "File A",
      },
      plotModel: {
        seriesList: [],
        signature: "plot:file-a",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      plotType: "iv",
      thumbnailService: {
        drawPlotThumbnail: () => {
          drawCalls += 1;
        },
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      assert.equal(drawCalls, 0);
      host.append(node);
      await animationFrames(3);

      assert.equal(drawCalls, 1);
    } finally {
      node.remove();
      host.remove();
    }
  });

  test("keeps waiting when thumbnail canvas is mounted after the first frame", async () => {
    if (typeof document === "undefined") {
      return;
    }

    let drawCalls = 0;
    const node = createThumbnailView({
      file: {
        fileId: "file-a",
      },
      plotModel: {
        seriesList: [],
        signature: "plot:file-a",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      thumbnailService: {
        drawPlotThumbnail: () => {
          drawCalls += 1;
        },
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      await animationFrames(1);
      assert.equal(drawCalls, 0);

      host.append(node);
      await animationFrames(3);

      assert.equal(drawCalls, 1);
    } finally {
      node.remove();
      host.remove();
    }
  });

  test("draws eager thumbnail content on the first connected microtask", async () => {
    if (typeof document === "undefined") {
      return;
    }

    let drawCalls = 0;
    const node = createThumbnailView({
      drawStrategy: "eager",
      file: {
        fileId: "file-a",
      },
      plotModel: {
        seriesList: [],
        signature: "plot:file-a",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      thumbnailService: {
        drawPlotThumbnail: () => {
          drawCalls += 1;
        },
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      assert.equal(drawCalls, 0);
      host.append(node);
      await Promise.resolve();

      assert.equal(drawCalls, 1);
      await animationFrames(1);

      assert.equal(drawCalls, 1);
    } finally {
      node.remove();
      host.remove();
    }
  });

  test("renders a nonblank loading placeholder without drawing a canvas", () => {
    if (typeof document === "undefined") {
      return;
    }

    const node = createThumbnailView({
      file: {
        fileId: "file-a",
        fileName: "File A",
      },
      isLoading: true,
      plotModel: null,
      thumbnailService: {
        drawPlotThumbnail: () => {
          assert.fail("loading placeholder should not draw a thumbnail");
        },
      },
    });

    try {
      assert.ok(node.querySelector(".thumbnail_view_chart_loading"));
      assert.equal(node.querySelector(".thumbnail_view_chart_canvas"), null);
      assert.equal(
        node.querySelectorAll(".thumbnail_view_chart_loading_line").length,
        3,
      );
    } finally {
      node.remove();
    }
  });

  test("updates an existing thumbnail canvas in place", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const drawnSignatures: string[] = [];
    const node = createThumbnailView({
      drawStrategy: "eager",
      file: {
        fileId: "file-a",
        fileName: "File A",
      },
      plotModel: {
        seriesList: [],
        signature: "plot:file-a:1",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      thumbnailService: {
        drawPlotThumbnail: (_target, options) => {
          drawnSignatures.push(options.model.signature);
        },
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      host.append(node);
      await animationFrames(1);
      const canvas = node.querySelector("canvas.thumbnail_view_chart_canvas");
      assert.ok(canvas);

      assert.equal(updateThumbnailView(node, {
        drawStrategy: "eager",
        file: {
          fileId: "file-a",
          fileName: "File A",
        },
        plotModel: {
          seriesList: [],
          signature: "plot:file-a:2",
          xDomain: [0, 1],
          xUnitLabel: "V",
          yDomain: [0, 2],
          yUnitLabel: "A",
        },
        thumbnailService: {
          drawPlotThumbnail: (_target, options) => {
            drawnSignatures.push(options.model.signature);
          },
        },
      }), true);

      assert.equal(node.querySelector("canvas.thumbnail_view_chart_canvas"), canvas);
      assert.deepEqual(drawnSignatures, ["plot:file-a:1", "plot:file-a:2"]);
    } finally {
      node.remove();
      host.remove();
    }
  });

  test("keeps an existing thumbnail canvas visible while a refresh is loading", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const node = createThumbnailView({
      drawStrategy: "eager",
      file: {
        fileId: "file-a",
      },
      plotModel: {
        seriesList: [],
        signature: "plot:file-a",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      thumbnailService: {
        drawPlotThumbnail: () => undefined,
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      host.append(node);
      await animationFrames(1);
      const canvas = node.querySelector("canvas.thumbnail_view_chart_canvas");
      assert.ok(canvas);

      updateThumbnailView(node, {
        file: {
          fileId: "file-a",
        },
        isLoading: true,
        plotModel: null,
        thumbnailService: {
          drawPlotThumbnail: () => undefined,
        },
      });

      assert.equal(node.querySelector("canvas.thumbnail_view_chart_canvas"), canvas);
      assert.equal(node.querySelector(".thumbnail_view_chart_loading"), null);
    } finally {
      node.remove();
      host.remove();
    }
  });

  test("toggles active state without replacing thumbnail canvas", async () => {
    if (typeof document === "undefined") {
      return;
    }

    const node = createThumbnailView({
      drawStrategy: "eager",
      file: {
        fileId: "file-a",
      },
      isActive: false,
      plotModel: {
        seriesList: [],
        signature: "plot:file-a",
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
      thumbnailService: {
        drawPlotThumbnail: () => undefined,
      },
    });
    const chart = node.querySelector(".thumbnail_view_chart") as HTMLElement | null;
    assert.ok(chart);
    chart.style.height = "180px";
    chart.style.width = "320px";

    const host = document.createElement("div");
    host.style.height = "180px";
    host.style.width = "320px";
    document.body.append(host);

    try {
      host.append(node);
      await animationFrames(1);
      const canvas = node.querySelector("canvas.thumbnail_view_chart_canvas");
      assert.ok(canvas);
      assert.equal(node.classList.contains("thumbnail_view--active"), false);

      updateThumbnailView(node, {
        drawStrategy: "eager",
        file: {
          fileId: "file-a",
        },
        isActive: true,
        plotModel: {
          seriesList: [],
          signature: "plot:file-a",
          xDomain: [0, 1],
          xUnitLabel: "V",
          yDomain: [0, 1],
          yUnitLabel: "A",
        },
        thumbnailService: {
          drawPlotThumbnail: () => undefined,
        },
      });

      assert.equal(node.classList.contains("thumbnail_view--active"), true);
      assert.equal(node.querySelector("canvas.thumbnail_view_chart_canvas"), canvas);
    } finally {
      node.remove();
      host.remove();
    }
  });
});

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};
