import { readThumbnailHoverDomState } from "./apply.mjs";

export const readVisibleThumbnailHoverTargets = async (page, count) => page.evaluate((targetCount) =>
  [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .map((item, itemIndex) => ({
      chartState: item.dataset.chartState || null,
      fileId: item.dataset.fileId || "",
      hasChartData: item.dataset.hasChartData === "true",
      itemIndex,
      label: (item.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
      selected: item.dataset.selected === "true",
    }))
    .filter(target =>
      target.fileId &&
      (target.hasChartData ||
        target.chartState === "ready" ||
        target.chartState === "queued" ||
        target.chartState === "processing")
    )
    .slice(0, targetCount),
  count,
);

export const waitForVisibleThumbnailHoverTargets = async (page, count, timeoutMs) => {
  const startedAt = Date.now();
  let targets = [];
  while (Date.now() - startedAt < timeoutMs) {
    targets = await readVisibleThumbnailHoverTargets(page, count);
    if (targets.length) {
      return targets;
    }
    await page.waitForTimeout(20);
  }
  return targets;
};

export const dispatchSyntheticFileHover = async (page, fileId, previousFileId = null) => page.evaluate(({
  fileId: targetFileId,
  previousFileId: previousTargetFileId,
}) => {
  const findItem = (id) =>
    [...document.querySelectorAll(".file-list-item[data-file-id]")]
      .find(item => item instanceof HTMLElement && item.dataset.fileId === id) ?? null;
  const target = findItem(targetFileId);
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  window.__thumbnailHoverLiveTrace?.recordDispatch?.(targetFileId);

  const previous = previousTargetFileId ? findItem(previousTargetFileId) : null;
  if (previous instanceof HTMLElement && previous !== target) {
    previous.dispatchEvent(new MouseEvent("mouseout", {
      bubbles: true,
      cancelable: true,
      relatedTarget: target,
    }));
  }

  const rect = target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent("mouseover", {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
    clientY: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
    relatedTarget: previous instanceof HTMLElement ? previous : null,
  }));
  return true;
}, {
  fileId,
  previousFileId,
});

export const dispatchSyntheticFileMouseOut = async (page, fileId) => page.evaluate((targetFileId) => {
  const target = [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .find(item => item instanceof HTMLElement && item.dataset.fileId === targetFileId) ?? null;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  target.dispatchEvent(new MouseEvent("mouseout", {
    bubbles: true,
    cancelable: true,
    relatedTarget: document.body,
  }));
  return true;
}, fileId);


export const installThumbnailHoverLiveObserver = async (page, watchedFileId) => page.evaluate((targetFileId) => {
  const globalTarget = window;
  globalTarget.__thumbnailHoverLiveTrace?.stop?.();
  let nextCanvasId = 1;
  const dispatches = [];
  const events = [];
  const startedAt = performance.now();

  const readTraceTime = () => ({
    timestamp: performance.now() - startedAt,
    wallTime: Date.now(),
  });

  const readCanvasNonBlank = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 512 / 4) * 4);
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        return true;
      }
    }
    return false;
  };

  const readState = (reason) => {
    const hover = document.querySelector(".file-list-hover--thumbnail");
    const node = hover?.querySelector(".thumbnail_view[data-hover-file-id]") ?? null;
    const canvas = node?.querySelector("canvas.thumbnail_view_chart_canvas") ?? null;
    if (canvas instanceof HTMLCanvasElement && !canvas.dataset.traceCanvasId) {
      canvas.dataset.traceCanvasId = String(nextCanvasId);
      nextCanvasId += 1;
    }
    const traceTime = readTraceTime();
    return {
      canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
      canvasId: canvas instanceof HTMLCanvasElement ? canvas.dataset.traceCanvasId ?? null : null,
      canvasNonBlank: readCanvasNonBlank(canvas),
      canvasVisible: canvas instanceof HTMLCanvasElement,
      canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      fileId: node?.dataset.hoverFileId ?? null,
      isWatchedFile: node?.dataset.hoverFileId === targetFileId,
      loadingVisible: Boolean(node?.querySelector(".thumbnail_view_chart_loading")),
      plotSignature: node?.dataset.hoverPlotSignature ?? null,
      reason,
      timestamp: traceTime.timestamp,
      tooltipVisible: Boolean(hover),
      wallTime: traceTime.wallTime,
    };
  };

  let lastSignature = "";
  const pushState = (reason) => {
    const state = readState(reason);
    const signature = [
      state.fileId ?? "",
      state.canvasId ?? "",
      state.canvasHeight ?? "",
      state.canvasWidth ?? "",
      state.canvasNonBlank ? "1" : "0",
      state.loadingVisible ? "1" : "0",
      state.plotSignature ?? "",
      state.tooltipVisible ? "1" : "0",
    ].join("|");
    if (signature === lastSignature && reason !== "tick") {
      return;
    }
    lastSignature = signature;
    events.push(state);
  };

  const observer = new MutationObserver(() => pushState("mutation"));
  observer.observe(document.body || document.documentElement, {
    attributes: true,
    attributeFilter: ["data-hover-file-id", "data-hover-plot-signature", "class", "style"],
    childList: true,
    subtree: true,
  });
  const interval = window.setInterval(() => pushState("tick"), 50);
  pushState("start");

  globalTarget.__thumbnailHoverLiveTrace = {
    dispatches,
    events,
    recordDispatch: (fileId) => {
      const traceTime = readTraceTime();
      dispatches.push({
        fileId: String(fileId ?? ""),
        timestamp: traceTime.timestamp,
        wallTime: traceTime.wallTime,
      });
      pushState("dispatch");
    },
    stop: () => {
      observer.disconnect();
      window.clearInterval(interval);
      pushState("stop");
      return {
        dispatches: [...dispatches],
        events: [...events],
        watchedFileId: targetFileId,
      };
    },
    watchedFileId: targetFileId,
  };
}, watchedFileId);

export const stopThumbnailHoverLiveObserver = async (page) => page.evaluate(() =>
  window.__thumbnailHoverLiveTrace?.stop?.() ?? null
).catch(() => null);

export const waitForHoverThumbnailNode = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    return Boolean(document.querySelector(selector));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 5000) },
);

export const waitForHoverThumbnailCanvas = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    return Boolean(document.querySelector(`${selector} canvas.thumbnail_view_chart_canvas`));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);

export const waitForHoverThumbnailDrawn = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const escape = window.CSS?.escape ?? ((value) => String(value).replace(/[\\"]/g, "\\$&"));
    const selector = `.file-list-hover--thumbnail .thumbnail_view[data-hover-file-id="${escape(targetFileId)}"]`;
    const canvas = document.querySelector(`${selector} canvas.thumbnail_view_chart_canvas`);
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        return true;
      }
    }
    return false;
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);


export const inspectVisibleThumbnailHover = async (page) => page.evaluate(() => {
  const hover = document.querySelector(".file-list-hover--thumbnail");
  const node = hover?.querySelector(".thumbnail_view[data-hover-file-id]") ?? null;
  const canvas = node?.querySelector("canvas.thumbnail_view_chart_canvas") ?? null;
  let canvasNonBlank = false;
  let canvasNonBlankPixels = 0;
  let canvasPixels = 0;
  let canvasHeight = null;
  let canvasWidth = null;
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
    canvasHeight = canvas.height;
    canvasWidth = canvas.width;
    const context = canvas.getContext("2d");
    if (context) {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      canvasPixels = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        const color = data[index] + data[index + 1] + data[index + 2];
        if (alpha > 0 && color > 0) {
          canvasNonBlankPixels += 1;
        }
      }
      canvasNonBlank = canvasNonBlankPixels > 0;
    }
  }

  return {
    canvasHeight,
    canvasNonBlank,
    canvasNonBlankPixels,
    canvasPixels,
    canvasVisible: Boolean(canvas),
    canvasWidth,
    fileId: node?.dataset.hoverFileId ?? null,
    loadingVisible: Boolean(node?.querySelector(".thumbnail_view_chart_loading")),
    plotSignature: node?.dataset.hoverPlotSignature ?? null,
    tooltipVisible: Boolean(hover),
  };
});

export const runThumbnailHoverStress = async ({
  count,
  page,
  timeoutMs,
}) => {
  const before = await readThumbnailHoverDomState(page);
  const targets = await readVisibleThumbnailHoverTargets(page, count);
  const samples = [];
  const startedAt = Date.now();
  let previousFileId = null;

  for (const target of targets) {
    const hoverStartedAt = Date.now();
    const dispatched = await dispatchSyntheticFileHover(page, target.fileId, previousFileId)
      .catch(() => false);
    if (!dispatched) {
      samples.push({
        ...target,
        canvasDrawnMs: null,
        canvasReadyMs: null,
        canvasStableMs: null,
        hoverState: await inspectVisibleThumbnailHover(page),
        tooltipVisibleMs: null,
      });
      continue;
    }
    previousFileId = target.fileId;
    let tooltipVisibleMs = null;
    let canvasReadyMs = null;
    let canvasDrawnMs = null;
    let canvasStableMs = null;
    try {
      await waitForHoverThumbnailNode(page, target.fileId, timeoutMs);
      tooltipVisibleMs = Date.now() - hoverStartedAt;
    } catch {
      tooltipVisibleMs = null;
    }
    try {
      await waitForHoverThumbnailCanvas(page, target.fileId, timeoutMs);
      canvasReadyMs = Date.now() - hoverStartedAt;
    } catch {
      canvasReadyMs = null;
    }
    try {
      await waitForHoverThumbnailDrawn(page, target.fileId, timeoutMs);
      canvasDrawnMs = Date.now() - hoverStartedAt;
      await page.waitForTimeout(50);
      const stableState = await inspectVisibleThumbnailHover(page);
      if (stableState.canvasNonBlank) {
        canvasStableMs = Date.now() - hoverStartedAt;
      } else {
        await waitForHoverThumbnailDrawn(page, target.fileId, timeoutMs);
        canvasStableMs = Date.now() - hoverStartedAt;
      }
    } catch {
      canvasDrawnMs = null;
      canvasStableMs = null;
    }
    const hoverState = await inspectVisibleThumbnailHover(page);
    samples.push({
      ...target,
      canvasDrawnMs,
      canvasReadyMs,
      canvasStableMs,
      hoverState,
      tooltipVisibleMs,
    });
    await page.waitForTimeout(160);
  }
  if (previousFileId) {
    await dispatchSyntheticFileMouseOut(page, previousFileId).catch(() => {});
  }

  return {
    before,
    durationMs: Date.now() - startedAt,
    requestedCount: count,
    samples,
    targetCount: targets.length,
  };
};

export const runLiveThumbnailHoverStress = async ({
  count,
  intervalMs,
  liveMs,
  page,
  timeoutMs,
  watchOnly = false,
}) => {
  const targets = await waitForVisibleThumbnailHoverTargets(page, count, Math.min(timeoutMs, 5000));
  const watchedTarget = targets[0] ?? null;
  if (!watchedTarget) {
    return {
      durationMs: 0,
      eventCount: 0,
      intervalMs,
      liveMs,
      requestedCount: count,
      targetCount: 0,
      targets,
      trace: null,
      watchedTarget: null,
    };
  }

  await installThumbnailHoverLiveObserver(page, watchedTarget.fileId);
  const startedAt = Date.now();
  let eventCount = 0;
  let previousFileId = null;
  while (Date.now() - startedAt < liveMs) {
    const target = watchOnly
      ? watchedTarget
      : targets[eventCount % targets.length];
    if (!target) {
      break;
    }

    const dispatched = await dispatchSyntheticFileHover(page, target.fileId, previousFileId)
      .catch(() => false);
    if (dispatched) {
      previousFileId = target.fileId;
    }
    eventCount += 1;
    await page.waitForTimeout(intervalMs);
  }

  if (watchedTarget.fileId !== previousFileId) {
    await dispatchSyntheticFileHover(page, watchedTarget.fileId, previousFileId).catch(() => false);
    await page.waitForTimeout(Math.max(50, intervalMs * 2));
  }

  return {
    durationMs: Date.now() - startedAt,
    eventCount,
    intervalMs,
    liveMs,
    requestedCount: count,
    targetCount: targets.length,
    targets,
    trace: await stopThumbnailHoverLiveObserver(page),
    watchOnly,
    watchedTarget,
  };
};
