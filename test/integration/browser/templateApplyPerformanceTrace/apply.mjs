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

export const runTemplateApplyForThumbnailHover = async ({
  expectedReadyCount,
  page,
  timeoutMs,
}) => {
  const before = await readThumbnailHoverDomState(page);
  await waitForApplyAllReady(page, timeoutMs);
  const startedAt = Date.now();
  await getApplyAllButton(page).click();
  await page.waitForFunction(
    ({ expectedReadyCount: expected }) => {
      const fileItems = [...document.querySelectorAll(".file-list-item[data-file-id]")];
      const required = Math.min(
        Math.max(1, expected),
        Math.max(1, fileItems.length),
      );
      const readyItems = fileItems.filter(item =>
        item.dataset.hasChartData === "true" ||
        item.dataset.chartState === "ready"
      );
      return readyItems.length >= required;
    },
    { expectedReadyCount },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(300);
  const after = await readThumbnailHoverDomState(page);
  return {
    after,
    before,
    durationMs: Date.now() - startedAt,
    expectedReadyCount,
  };
};


export const waitForTemplateProcessingBatch = async (page, timeoutMs) => page.waitForFunction(
  () => Boolean(window.conductorAnalysisPerf?.getReport?.()?.entries?.some(entry =>
    entry.stage === "processing:batch"
  )),
  undefined,
  { timeout: timeoutMs },
).catch(() => null);

