import {
  collectThumbnailHoverTargets,
  mergeThumbnailHoverTargets,
  scrollThumbnailHoverTargetIntoView,
  waitForCollectedThumbnailHoverTargets,
  waitForVisibleThumbnailHoverTargets,
} from "./thumbnailHover.mjs";

export const inspectMainChartState = async (page) => page.evaluate(() => {
  const readCanvasSnapshot = (canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return {
        canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
        canvasNonBlank: false,
        canvasRenderSignature: null,
        canvasSignature: null,
        canvasVisible: canvas instanceof HTMLCanvasElement,
        canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      };
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        canvasHeight: canvas.height,
        canvasNonBlank: false,
        canvasRenderSignature: canvas.dataset.plotRenderSignature ?? null,
        canvasSignature: null,
        canvasVisible: true,
        canvasWidth: canvas.width,
      };
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }

    return {
      canvasHeight: canvas.height,
      canvasNonBlank: nonBlank,
      canvasRenderSignature: canvas.dataset.plotRenderSignature ?? null,
      canvasSignature: `${canvas.width}x${canvas.height}:${hash >>> 0}`,
      canvasVisible: true,
      canvasWidth: canvas.width,
    };
  };

  const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
  const canvas = document.querySelector(".plot_main_chart_canvas");
  const emptyTitle = document.querySelector(".chart_view_empty_title");
  const chartView = document.querySelector(".chart_view[data-chart-display-state]");
  const snapshot = readCanvasSnapshot(canvas);
  return {
    ...snapshot,
    chartDisplayState: chartView instanceof HTMLElement ? chartView.dataset.chartDisplayState ?? null : null,
    chartEmptyTitle: emptyTitle?.textContent?.trim() ?? null,
    chartPendingFileId: chartView instanceof HTMLElement ? chartView.dataset.pendingFileId ?? null : null,
    chartPendingPlotType: chartView instanceof HTMLElement ? chartView.dataset.pendingPlotType ?? null : null,
    selectedChartState: selected instanceof HTMLElement ? selected.dataset.chartState ?? null : null,
    selectedFileId: selected instanceof HTMLElement ? selected.dataset.fileId ?? null : null,
    selectedHasChartData: selected instanceof HTMLElement ? selected.dataset.hasChartData === "true" : null,
  };
});

export const dispatchSyntheticFileSelect = async (page, fileId) => page.evaluate((targetFileId) => {
  const target = [...document.querySelectorAll(".file-list-item[data-file-id]")]
    .find(item => item instanceof HTMLElement && item.dataset.fileId === targetFileId) ?? null;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  window.__fileSwitchLiveTrace?.recordDispatch?.(targetFileId);

  const rect = target.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
    clientY: rect.top + Math.min(8, Math.max(1, rect.height / 2)),
  };
  target.dispatchEvent(new MouseEvent("mousedown", eventInit));
  target.dispatchEvent(new MouseEvent("mouseup", eventInit));
  target.dispatchEvent(new MouseEvent("click", eventInit));
  return true;
}, fileId);

export const dispatchSyntheticFileSelectTarget = async (page, target) => {
  const fileId = typeof target === "string" ? target : target?.fileId;
  if (!fileId) {
    return false;
  }
  const visibleDispatch = await dispatchSyntheticFileSelect(page, fileId).catch(() => false);
  if (visibleDispatch) {
    return true;
  }
  await scrollThumbnailHoverTargetIntoView(page, target);
  return dispatchSyntheticFileSelect(page, fileId).catch(() => false);
};

export const waitForSelectedFile = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    return selected instanceof HTMLElement && selected.dataset.fileId === targetFileId;
  },
  fileId,
  { timeout: Math.min(timeoutMs, 5000) },
);

export const waitForMainChartCanvas = async (page, fileId, timeoutMs) => page.waitForFunction(
  (targetFileId) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    return selected instanceof HTMLElement &&
      selected.dataset.fileId === targetFileId &&
      Boolean(document.querySelector(".plot_main_chart_canvas"));
  },
  fileId,
  { timeout: Math.min(timeoutMs, 10000) },
);

export const waitForMainChartDrawn = async (page, fileId, previousCanvasSignature, timeoutMs) => page.waitForFunction(
  ({ targetFileId, previousSignature }) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    if (!(selected instanceof HTMLElement) || selected.dataset.fileId !== targetFileId) {
      return false;
    }

    const canvas = document.querySelector(".plot_main_chart_canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }
    if (!nonBlank) {
      return false;
    }

    const renderSignature = canvas.dataset.plotRenderSignature ?? "";
    if (renderSignature.split("|")[0] === targetFileId) {
      return true;
    }

    const signature = `${canvas.width}x${canvas.height}:${hash >>> 0}`;
    return !previousSignature || signature !== previousSignature;
  },
  { targetFileId: fileId, previousSignature: previousCanvasSignature },
  { timeout: Math.min(timeoutMs, 10000) },
);

export const installFileSwitchLiveObserver = async (page) => page.evaluate(() => {
  const globalTarget = window;
  globalTarget.__fileSwitchLiveTrace?.stop?.();
  const dispatches = [];
  const events = [];
  const startedAt = performance.now();

  const readTraceTime = () => ({
    timestamp: performance.now() - startedAt,
    wallTime: Date.now(),
  });

  const readCanvasSnapshot = (canvas, { samplePixels = true } = {}) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
      return {
        canvasHeight: canvas instanceof HTMLCanvasElement ? canvas.height : null,
        canvasNonBlank: false,
        canvasRenderSignature: null,
        canvasSignature: null,
        canvasVisible: canvas instanceof HTMLCanvasElement,
        canvasWidth: canvas instanceof HTMLCanvasElement ? canvas.width : null,
      };
    }

    const canvasRenderSignature = canvas.dataset.plotRenderSignature ?? null;
    if (!samplePixels) {
      return {
        canvasHeight: canvas.height,
        canvasNonBlank: Boolean(canvasRenderSignature),
        canvasRenderSignature,
        canvasSignature: null,
        canvasVisible: true,
        canvasWidth: canvas.width,
      };
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        canvasHeight: canvas.height,
        canvasNonBlank: false,
        canvasRenderSignature,
        canvasSignature: null,
        canvasVisible: true,
        canvasWidth: canvas.width,
      };
    }

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(4, Math.floor(data.length / 1024 / 4) * 4);
    let nonBlank = false;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += step) {
      const alpha = data[index + 3];
      const color = data[index] + data[index + 1] + data[index + 2];
      if (alpha > 0 && color > 0) {
        nonBlank = true;
      }
      hash ^= data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (alpha << 24);
      hash = Math.imul(hash, 16777619);
    }

    return {
      canvasHeight: canvas.height,
      canvasNonBlank: nonBlank,
      canvasRenderSignature,
      canvasSignature: `${canvas.width}x${canvas.height}:${hash >>> 0}`,
      canvasVisible: true,
      canvasWidth: canvas.width,
    };
  };

  const readState = (reason, { samplePixels = true } = {}) => {
    const selected = document.querySelector(".file-list-item[data-selected=\"true\"][data-file-id]");
    const canvas = document.querySelector(".plot_main_chart_canvas");
    const emptyTitle = document.querySelector(".chart_view_empty_title");
    const chartView = document.querySelector(".chart_view[data-chart-display-state]");
    const snapshot = readCanvasSnapshot(canvas, { samplePixels });
    const traceTime = readTraceTime();
    return {
      ...snapshot,
      chartDisplayState: chartView instanceof HTMLElement ? chartView.dataset.chartDisplayState ?? null : null,
      chartEmptyTitle: emptyTitle?.textContent?.trim() ?? null,
      chartPendingFileId: chartView instanceof HTMLElement ? chartView.dataset.pendingFileId ?? null : null,
      chartPendingPlotType: chartView instanceof HTMLElement ? chartView.dataset.pendingPlotType ?? null : null,
      reason,
      selectedChartState: selected instanceof HTMLElement ? selected.dataset.chartState ?? null : null,
      selectedFileId: selected instanceof HTMLElement ? selected.dataset.fileId ?? null : null,
      selectedHasChartData: selected instanceof HTMLElement ? selected.dataset.hasChartData === "true" : null,
      timestamp: traceTime.timestamp,
      wallTime: traceTime.wallTime,
    };
  };

  let lastSignature = "";
  const pushState = (reason, { samplePixels = true } = {}) => {
    const state = readState(reason, { samplePixels });
    const signature = [
      state.selectedFileId ?? "",
      state.selectedChartState ?? "",
      state.selectedHasChartData ? "1" : "0",
      state.chartDisplayState ?? "",
      state.chartPendingFileId ?? "",
      state.canvasRenderSignature ?? "",
      state.canvasSignature ?? "",
      state.canvasNonBlank ? "1" : "0",
      state.chartEmptyTitle ?? "",
    ].join("|");
    if (signature === lastSignature && reason !== "tick") {
      return;
    }
    lastSignature = signature;
    events.push(state);
  };

  const observer = new MutationObserver(() => pushState("mutation", { samplePixels: false }));
  observer.observe(document.body || document.documentElement, {
    attributes: true,
    attributeFilter: [
      "data-chart-state",
      "data-chart-display-state",
      "data-has-chart-data",
      "data-pending-file-id",
      "data-pending-plot-type",
      "data-plot-render-signature",
      "data-selected",
      "class",
      "style",
    ],
    childList: true,
    subtree: true,
  });
  const interval = window.setInterval(() => pushState("tick", { samplePixels: false }), 50);
  pushState("start", { samplePixels: false });

  globalTarget.__fileSwitchLiveTrace = {
    dispatches,
    events,
    recordDispatch: (fileId) => {
      const state = readState("dispatch", { samplePixels: false });
      dispatches.push({
        fileId: String(fileId ?? ""),
        state,
        timestamp: state.timestamp,
        wallTime: state.wallTime,
      });
      pushState("dispatch", { samplePixels: false });
    },
    stop: () => {
      observer.disconnect();
      window.clearInterval(interval);
      pushState("stop", { samplePixels: false });
      return {
        dispatches: [...dispatches],
        events: [...events],
      };
    },
  };
});

export const stopFileSwitchLiveObserver = async (page) => page.evaluate(() =>
  window.__fileSwitchLiveTrace?.stop?.() ?? null
).catch(() => null);

export const orderSwitchTargets = (targets, count) => [
  ...targets.filter(target => !target.selected && isPendingFileSwitchTarget(target)),
  ...targets.filter(target => !target.selected && !isPendingFileSwitchTarget(target)),
  ...targets.filter(target => target.selected),
].slice(0, count);

export const isPendingFileSwitchTarget = (target) =>
  target &&
  target.hasChartData !== true &&
  (
    target.chartState === "queued" ||
    target.chartState === "processing"
  );

export const runFileSwitchStress = async ({
  count,
  page,
  timeoutMs,
}) => {
  const before = await inspectMainChartState(page);
  const targets = orderSwitchTargets(
    await waitForCollectedThumbnailHoverTargets(page, count + 1, Math.min(timeoutMs, 15000)),
    count,
  );
  const samples = [];
  const startedAt = Date.now();

  for (const target of targets) {
    const beforeState = await inspectMainChartState(page);
    const switchStartedAt = Date.now();
    const dispatched = await dispatchSyntheticFileSelectTarget(page, target);
    if (!dispatched) {
      samples.push({
        ...target,
        afterState: await inspectMainChartState(page),
        beforeState,
        canvasVisibleMs: null,
        chartDrawnMs: null,
        dispatched: false,
        selectedMs: null,
      });
      continue;
    }

    let selectedMs = null;
    let canvasVisibleMs = null;
    let chartDrawnMs = null;
    try {
      await waitForSelectedFile(page, target.fileId, timeoutMs);
      selectedMs = Date.now() - switchStartedAt;
    } catch {
      selectedMs = null;
    }
    try {
      await waitForMainChartCanvas(page, target.fileId, timeoutMs);
      canvasVisibleMs = Date.now() - switchStartedAt;
    } catch {
      canvasVisibleMs = null;
    }
    try {
      await waitForMainChartDrawn(page, target.fileId, beforeState.canvasSignature, timeoutMs);
      chartDrawnMs = Date.now() - switchStartedAt;
    } catch {
      chartDrawnMs = null;
    }

    samples.push({
      ...target,
      afterState: await inspectMainChartState(page),
      beforeState,
      canvasVisibleMs,
      chartDrawnMs,
      dispatched: true,
      selectedMs,
    });
    await page.waitForTimeout(80);
  }

  return {
    before,
    durationMs: Date.now() - startedAt,
    requestedCount: count,
    samples,
    targetCount: targets.length,
  };
};

export const runLiveFileSwitchStress = async ({
  count,
  intervalMs,
  liveMs,
  page,
  timeoutMs,
}) => {
  let targets = orderSwitchTargets(
    await waitForVisibleThumbnailHoverTargets(page, count + 1, Math.min(timeoutMs, 5000)),
    count,
  );
  if (!targets.length) {
    return {
      durationMs: 0,
      eventCount: 0,
      intervalMs,
      liveMs,
      requestedCount: count,
      settleSample: null,
      targetCount: 0,
      targets,
      trace: null,
    };
  }

  await installFileSwitchLiveObserver(page);
  const startedAt = Date.now();
  let eventCount = 0;
  let lastBeforeState = null;
  let lastSwitchStartedAt = null;
  let lastTarget = null;
  while (Date.now() - startedAt < liveMs) {
    if (
      targets.length < count &&
      eventCount > 0 &&
      eventCount % Math.max(1, targets.length) === 0
    ) {
      targets = orderSwitchTargets(
        mergeThumbnailHoverTargets(
          targets,
          await collectThumbnailHoverTargets(page, count + 1, Math.min(500, timeoutMs)),
        ),
        count,
      );
    }

    const target = targets[eventCount % targets.length];
    if (!target) {
      break;
    }

    lastBeforeState = await inspectMainChartState(page);
    lastSwitchStartedAt = Date.now();
    lastTarget = target;
    await dispatchSyntheticFileSelectTarget(page, target);
    eventCount += 1;
    await page.waitForTimeout(intervalMs);
  }

  let settleSample = null;
  if (lastTarget && lastSwitchStartedAt != null) {
    let selectedMs = null;
    let canvasVisibleMs = null;
    let chartDrawnMs = null;
    try {
      await waitForSelectedFile(page, lastTarget.fileId, timeoutMs);
      selectedMs = Date.now() - lastSwitchStartedAt;
    } catch {
      selectedMs = null;
    }
    try {
      await waitForMainChartCanvas(page, lastTarget.fileId, timeoutMs);
      canvasVisibleMs = Date.now() - lastSwitchStartedAt;
    } catch {
      canvasVisibleMs = null;
    }
    try {
      await waitForMainChartDrawn(
        page,
        lastTarget.fileId,
        lastBeforeState?.canvasSignature ?? null,
        timeoutMs,
      );
      chartDrawnMs = Date.now() - lastSwitchStartedAt;
    } catch {
      chartDrawnMs = null;
    }
    settleSample = {
      ...lastTarget,
      afterState: await inspectMainChartState(page),
      beforeState: lastBeforeState,
      canvasVisibleMs,
      chartDrawnMs,
      selectedMs,
    };
  } else {
    await page.waitForTimeout(Math.max(80, intervalMs * 2));
  }

  return {
    durationMs: Date.now() - startedAt,
    eventCount,
    intervalMs,
    liveMs,
    requestedCount: count,
    settleSample,
    targetCount: targets.length,
    targets,
    trace: await stopFileSwitchLiveObserver(page),
  };
};
