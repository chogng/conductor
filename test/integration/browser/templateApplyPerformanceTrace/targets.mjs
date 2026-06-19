export const readTraceChartTargets = async (page, count = Number.POSITIVE_INFINITY) => page.evaluate((targetCount) => {
  const api = window.__conductorTemplateApplyPerformanceTrace?.targetApi;
  const targets = api?.getChartTargets?.() ?? [];
  return targets
    .map((target, index) => ({
      chartState: target.chartState ?? null,
      fileId: String(target.fileId ?? ""),
      hasChartData: target.hasChartData === true,
      index: Number.isFinite(Number(target.index)) ? Number(target.index) : index,
      label: String(target.label ?? target.fileName ?? target.fileId ?? "").slice(0, 160),
      rowIndex: Number.isFinite(Number(target.rowIndex)) ? Number(target.rowIndex) : index,
      selected: target.selected === true,
      source: "trace-api",
    }))
    .filter(target => target.fileId)
    .slice(0, Number.isFinite(targetCount) ? Math.max(0, targetCount) : undefined);
}, count).catch(() => []);

export const waitForTraceChartTargets = async (
  page,
  count,
  timeoutMs = 1000,
  settleMs = 250,
) => {
  const startedAt = Date.now();
  let bestTargets = [];
  let lastGrowthAt = startedAt;
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await readTraceChartTargets(page, count);
    if (targets.length > bestTargets.length) {
      bestTargets = targets;
      lastGrowthAt = Date.now();
    }
    if (bestTargets.length >= count || Date.now() - lastGrowthAt >= settleMs) {
      return bestTargets.slice(0, count);
    }
    await page.waitForTimeout(50);
  }
  return bestTargets.slice(0, count);
};

export const readTraceSelectedChartTargetFileId = async (page) => page.evaluate(() =>
  window.__conductorTemplateApplyPerformanceTrace?.targetApi?.getSelectedChartTargetFileId?.() ?? null
).catch(() => null);

export const dispatchTraceChartTargetSelect = async (page, fileId, reveal = "force") => page.evaluate(({
  fileId: targetFileId,
  reveal: revealMode,
}) => {
  const normalizedFileId = String(targetFileId ?? "").trim();
  if (!normalizedFileId) {
    return false;
  }

  const api = window.__conductorTemplateApplyPerformanceTrace?.targetApi;
  if (typeof api?.selectChartTarget !== "function") {
    return false;
  }

  window.__fileSwitchLiveTrace?.recordDispatch?.(normalizedFileId);
  const selectedFileId = api.selectChartTarget(normalizedFileId, revealMode);
  return selectedFileId === normalizedFileId;
}, {
  fileId,
  reveal,
}).catch(() => false);

export const dispatchTraceChartTargetHoverIntent = async (page, fileId) => page.evaluate((targetFileId) => {
  const normalizedFileId = String(targetFileId ?? "").trim();
  const hoveredFileId = window.__conductorTemplateApplyPerformanceTrace?.targetApi
    ?.setHoveredChartTarget?.(normalizedFileId || null);
  return normalizedFileId ? hoveredFileId === normalizedFileId : hoveredFileId === null;
}, fileId).catch(() => false);

export const clearTraceChartTargetHoverIntent = async (page) =>
  dispatchTraceChartTargetHoverIntent(page, null);
