import { readThumbnailHoverDomState } from "./apply.mjs";

const THUMBNAIL_HOVER_LIST_WHEEL_DELTA_Y = 420;

export const readVisibleThumbnailHoverTargets = async (page, count) => page.evaluate((targetCount) =>
  {
    const viewport = document.querySelector(".file-list-tree-viewport");
    const scrollTop = viewport instanceof HTMLElement ? viewport.scrollTop : null;
    return [...document.querySelectorAll(".file-list-item[data-file-id]")]
      .map((item, itemIndex) => ({
        chartState: item.dataset.chartState || null,
        fileId: item.dataset.fileId || "",
        hasChartData: item.dataset.hasChartData === "true",
        itemIndex,
        label: (item.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        rowIndex: Number(item.closest(".ui-list__row")?.getAttribute("data-index") ?? itemIndex),
        scrollTop,
        selected: item.dataset.selected === "true",
      }))
      .filter(target =>
        target.fileId &&
        (target.hasChartData ||
          target.chartState === "ready" ||
          target.chartState === "queued" ||
          target.chartState === "processing")
      )
      .slice(0, targetCount);
  },
  count,
);

export const collectThumbnailHoverTargets = async (page, count, timeoutMs = 5000) => {
  const startedAt = Date.now();
  const targetsByFileId = new Map();
  const rememberTargets = (targets) => {
    for (const target of targets) {
      if (target.fileId && !targetsByFileId.has(target.fileId)) {
        targetsByFileId.set(target.fileId, target);
      }
    }
  };

  await page.evaluate(() => {
    const viewport = document.querySelector(".file-list-tree .ui-list__viewport") ??
      document.querySelector(".file-list-tree-viewport");
    if (viewport instanceof HTMLElement) {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  }).catch(() => {});
  await scrollThumbnailHoverListByWheel(page, -100000);
  await page.waitForTimeout(30);

  let stagnantScrollCount = 0;
  while (Date.now() - startedAt < timeoutMs && targetsByFileId.size < count) {
    const visibleTargets = await readVisibleThumbnailHoverTargets(page, count);
    rememberTargets(visibleTargets);
    if (targetsByFileId.size >= count) {
      break;
    }

    const beforeCount = targetsByFileId.size;
    const beforeFirstRowIndex = visibleTargets[0]?.rowIndex ?? null;
    const wheelScrolled = await scrollThumbnailHoverListByWheel(page, THUMBNAIL_HOVER_LIST_WHEEL_DELTA_Y);
    if (!wheelScrolled) {
      await page.evaluate(() => {
        const viewport = document.querySelector(".file-list-tree .ui-list__viewport") ??
          document.querySelector(".file-list-tree-viewport");
        if (!(viewport instanceof HTMLElement)) {
          return;
        }
        const row = document.querySelector(".file-list-item")?.getBoundingClientRect().height ?? 22;
        const step = Math.max(row, viewport.clientHeight - row * 2);
        viewport.scrollTop += step;
        viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      }).catch(() => {});
    }

    await page.waitForTimeout(40);
    const nextVisibleTargets = await readVisibleThumbnailHoverTargets(page, count);
    rememberTargets(nextVisibleTargets);
    const nextFirstRowIndex = nextVisibleTargets[0]?.rowIndex ?? null;
    if (targetsByFileId.size === beforeCount && nextFirstRowIndex === beforeFirstRowIndex) {
      stagnantScrollCount += 1;
    } else {
      stagnantScrollCount = 0;
    }
    if (stagnantScrollCount >= 2) {
      break;
    }
  }

  return [...targetsByFileId.values()].slice(0, count);
};

export const scrollThumbnailHoverListByWheel = async (page, deltaY) => {
  const viewport = page.locator(".file-list-tree .ui-list__viewport, .file-list-tree-viewport").first();
  const box = await viewport.boundingBox().catch(() => null);
  if (!box) {
    return false;
  }
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(24, box.height / 2));
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(30);
  return true;
};

export const waitForCollectedThumbnailHoverTargets = async (
  page,
  count,
  timeoutMs = 15000,
  settleMs = 2500,
) => {
  const startedAt = Date.now();
  let lastGrowthAt = startedAt;
  let bestTargets = [];
  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = Math.max(100, timeoutMs - (Date.now() - startedAt));
    const targets = await collectThumbnailHoverTargets(page, count, Math.min(1000, remainingMs));
    if (targets.length > bestTargets.length) {
      bestTargets = targets;
      lastGrowthAt = Date.now();
    }
    if (bestTargets.length >= count || Date.now() - lastGrowthAt >= settleMs) {
      return bestTargets.slice(0, count);
    }
    await page.waitForTimeout(200);
  }
  return bestTargets.slice(0, count);
};

export const mergeThumbnailHoverTargets = (...targetLists) => {
  const targetsByFileId = new Map();
  for (const targets of targetLists) {
    for (const target of targets ?? []) {
      if (target?.fileId && !targetsByFileId.has(target.fileId)) {
        targetsByFileId.set(target.fileId, target);
      }
    }
  }
  return [...targetsByFileId.values()];
};

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

export const scrollThumbnailHoverTargetIntoView = async (page, target, timeoutMs = 1000) => {
  const fileId = typeof target === "string" ? target : target?.fileId;
  if (!fileId) {
    return false;
  }

  const startedAt = Date.now();
  let resetToTop = false;
  while (Date.now() - startedAt < timeoutMs) {
    const found = await page.evaluate((targetFileId) => {
      const target = [...document.querySelectorAll(".file-list-item[data-file-id]")]
        .find(item => item instanceof HTMLElement && item.dataset.fileId === targetFileId) ?? null;
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "center" });
        return true;
      }
      return false;
    }, fileId).catch(() => false);
    if (found) {
      return true;
    }

    const shouldResetToTop = !resetToTop;
    const wheelScrolled = await scrollThumbnailHoverListByWheel(
      page,
      shouldResetToTop ? -100000 : THUMBNAIL_HOVER_LIST_WHEEL_DELTA_Y,
    );
    const scrollState = wheelScrolled
      ? { didScroll: true }
      : await page.evaluate((reset) => {
        const viewport = document.querySelector(".file-list-tree .ui-list__viewport") ??
          document.querySelector(".file-list-tree-viewport");
        if (!(viewport instanceof HTMLElement)) {
          return { didScroll: false };
        }
        const row = document.querySelector(".file-list-item")?.getBoundingClientRect().height ?? 22;
        if (reset) {
          viewport.scrollTop = 0;
        } else {
          const step = Math.max(row, viewport.clientHeight - row * 2);
          viewport.scrollTop += step;
        }
        viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
        return { didScroll: true };
      }, shouldResetToTop).catch(() => ({ didScroll: false }));
    resetToTop = true;
    if (!scrollState.didScroll) {
      break;
    }
    await page.waitForTimeout(16);
  }
  return false;
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

export const dispatchSyntheticFileHoverTarget = async (page, target, previousFileId = null) => {
  const fileId = typeof target === "string" ? target : target?.fileId;
  if (!fileId) {
    return false;
  }
  const visibleDispatch = await dispatchSyntheticFileHover(page, fileId, previousFileId).catch(() => false);
  if (visibleDispatch) {
    return true;
  }
  await scrollThumbnailHoverTargetIntoView(page, target);
  return dispatchSyntheticFileHover(page, fileId, previousFileId).catch(() => false);
};

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
  const targets = await waitForCollectedThumbnailHoverTargets(
    page,
    count,
    Math.min(timeoutMs, 15000),
  );
  const samples = [];
  const startedAt = Date.now();
  let previousFileId = null;

  for (const target of targets) {
    const hoverStartedAt = Date.now();
    const dispatched = await dispatchSyntheticFileHoverTarget(page, target, previousFileId);
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
  let targets = await waitForVisibleThumbnailHoverTargets(page, count, Math.min(timeoutMs, 5000));
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
    if (
      !watchOnly &&
      targets.length < count &&
      eventCount > 0 &&
      eventCount % Math.max(1, targets.length) === 0
    ) {
      targets = mergeThumbnailHoverTargets(
        targets,
        await collectThumbnailHoverTargets(page, count, Math.min(500, timeoutMs)),
      ).slice(0, count);
    }

    const target = watchOnly
      ? watchedTarget
      : targets[eventCount % targets.length];
    if (!target) {
      break;
    }

    const dispatched = await dispatchSyntheticFileHoverTarget(page, target, previousFileId);
    if (dispatched) {
      previousFileId = target.fileId;
    }
    eventCount += 1;
    await page.waitForTimeout(intervalMs);
  }

  if (watchedTarget.fileId !== previousFileId) {
    await dispatchSyntheticFileHoverTarget(page, watchedTarget, previousFileId).catch(() => false);
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
