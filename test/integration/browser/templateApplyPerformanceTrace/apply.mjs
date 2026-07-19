import { readTraceChartTargets } from "./targets.mjs";

export const readThumbnailHoverDomState = async (page) => page.evaluate(() => {
  const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
  const chartStateCounts = fileItems.reduce((counts, item) => {
    const key = item.dataset.chartState || "none";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const readyItems = fileItems.filter(item =>
    item.dataset.hasChartData === "true" ||
    item.dataset.chartState === "ready"
  );
  return {
    bodyTail: document.body.innerText.slice(-2000),
    chartReadyCount: readyItems.length,
    chartStateCounts,
    fileItemCount: fileItems.length,
    hoverVisible: Boolean(document.querySelector(".file-list-hover--thumbnail")),
    thumbnailCanvasCount: document.querySelectorAll(".file-list-hover--thumbnail canvas.thumbnail_view_chart_canvas").length,
    thumbnailLoadingCount: document.querySelectorAll(".file-list-hover--thumbnail .thumbnail_view_chart_loading").length,
  };
});

export const readTemplateApplyReadinessState = async (page) => {
  const [dom, targets] = await Promise.all([
    readThumbnailHoverDomState(page),
    readTraceChartTargets(page),
  ]);
  const traceTargetStateCounts = targets.reduce((counts, target) => {
    const key = target.chartState || "none";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const traceReadyTargets = targets.filter(isReadyTraceTarget);
  return {
    ...dom,
    traceTargetCount: targets.length,
    traceTargetReadyCount: traceReadyTargets.length,
    traceTargetSamples: targets.slice(0, 8),
    traceTargetStateCounts,
  };
};

export const getApplyAllButton = (page) =>
  page.getByRole("button", { name: /^(应用到所有|Apply to All)$/ });

export const waitForApplyAllReady = async (page, timeoutMs) => page.waitForFunction(
  () => {
    const apply = [...document.querySelectorAll("button")]
      .find(button => /^(应用到所有|Apply to All)$/.test((button.textContent || "").trim()));
    return Boolean(apply && !apply.disabled);
  },
  undefined,
  { timeout: timeoutMs },
);

export const waitForTemplateApplyProcessingVisible = async (page, timeoutMs) => page.waitForFunction(
  () => {
    const traceTargets = window.__conductorTemplateApplyPerformanceTrace?.targetApi
      ?.getChartTargets?.() ?? [];
    if (traceTargets.some(target => isActiveTraceTarget(target))) {
      return true;
    }

    return [...document.querySelectorAll(".file-list-item[data-file-id]")]
      .some(item => {
        const state = item.dataset.chartState;
        return state === "queued" ||
          state === "processing" ||
          state === "ready" ||
          state === "skipped";
      });

    function isActiveTraceTarget(target) {
      return target?.hasChartData === true ||
        target?.chartState === "queued" ||
        target?.chartState === "processing" ||
        target?.chartState === "ready";
    }
  },
  undefined,
  { timeout: timeoutMs },
);

export const runTemplateApplyForThumbnailHover = async ({
  expectedReadyCount,
  expectedTargetCount = expectedReadyCount,
  page,
  timeoutMs,
}) => {
  const expectedReadyTargetCount = Math.max(
    1,
    Math.min(
      Math.max(1, expectedReadyCount),
      Math.max(1, expectedTargetCount),
    ),
  );
  const before = await readTemplateApplyReadinessState(page);
  await waitForApplyAllReady(page, timeoutMs);
  const startedAt = Date.now();
  await getApplyAllButton(page).click();
  try {
    await waitForTemplateApplyReadyTargets(page, expectedReadyTargetCount, timeoutMs);
  } catch (error) {
    const lastState = await readTemplateApplyReadinessState(page);
    throw new Error(
      `Timed out waiting for ${expectedReadyTargetCount} template-applied chart targets. ` +
        `Last state: ${JSON.stringify(createTemplateApplyReadinessErrorState(lastState))}`,
      { cause: error },
    );
  }
  await page.waitForTimeout(300);
  const after = await readTemplateApplyReadinessState(page);
  return {
    after,
    before,
    durationMs: Date.now() - startedAt,
    expectedReadyCount,
    expectedReadyTargetCount,
    expectedTargetCount,
  };
};

export const waitForTemplateApplyReadyTargets = async (
  page,
  expectedReadyTargetCount,
  timeoutMs,
) => page.waitForFunction(
  ({ expectedReadyTargetCount: expected }) => {
    const required = Math.max(1, expected);
    const traceTargets = window.__conductorTemplateApplyPerformanceTrace?.targetApi
      ?.getChartTargets?.() ?? [];
    if (traceTargets.length > 0) {
      const readyTargetCount = traceTargets.filter(target =>
        target?.hasChartData === true ||
        target?.chartState === "ready"
      ).length;
      return traceTargets.length >= required && readyTargetCount >= required;
    }

    const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
    const domRequired = Math.min(
      required,
      Math.max(1, fileItems.length),
    );
    const readyItems = fileItems.filter(item =>
      item.dataset.hasChartData === "true" ||
      item.dataset.chartState === "ready"
    );
    return readyItems.length >= domRequired;
  },
  { expectedReadyTargetCount },
  { timeout: timeoutMs },
);

const isReadyTraceTarget = (target) =>
  target.hasChartData === true ||
  target.chartState === "ready";

const createTemplateApplyReadinessErrorState = (state) => ({
  chartReadyCount: state.chartReadyCount,
  chartStateCounts: state.chartStateCounts,
  fileItemCount: state.fileItemCount,
  traceTargetCount: state.traceTargetCount,
  traceTargetReadyCount: state.traceTargetReadyCount,
  traceTargetSamples: state.traceTargetSamples,
  traceTargetStateCounts: state.traceTargetStateCounts,
});

export const waitForTemplateProcessingBatch = async (page, timeoutMs) => page.waitForFunction(
  () => {
    const traceTargets = window.__conductorTemplateApplyPerformanceTrace?.targetApi
      ?.getChartTargets?.() ?? [];
    if (traceTargets.length > 0) {
      return traceTargets.every(target =>
        target.chartState === "ready" ||
        target.chartState === "failed" ||
        target.chartState === "skipped"
      );
    }

    const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
    return fileItems.length > 0 && fileItems.every(item => {
      const state = item.dataset.chartState;
      return state === "ready" || state === "failed" || state === "skipped";
    });
  },
  undefined,
  { timeout: timeoutMs },
);
