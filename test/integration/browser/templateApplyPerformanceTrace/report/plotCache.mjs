import {
  countBy,
  getAnalysisPerfEntries,
  readNumber,
} from "./common.mjs";

export const summarizePlotCacheMetrics = (analysisPerfReport) => {
  const entries = getAnalysisPerfEntries(analysisPerfReport);
  const displayCacheEntries = entries
    .filter(entry => entry.stage === "plotService.cachePlotDisplayModel");
  const trimEntries = entries
    .filter(entry => entry.stage === "plotService.trimPlotDisplayModelCache");
  const clearQueuedFullEntries = entries
    .filter(entry => entry.stage === "plotService.clearQueuedFullPlotDisplayModel");
  const resultCounts = countBy(displayCacheEntries.map(entry => entry.meta?.result));
  const readMaxMeta = (items, key) => {
    const values = items
      .map(item => readNumber(item.meta?.[key]))
      .filter(value => value != null);
    return values.length ? Math.max(...values) : null;
  };
  const sumMeta = (items, key) =>
    items.reduce((sum, item) => sum + (readNumber(item.meta?.[key]) ?? 0), 0);

  return {
    displayModelCache: {
      created: readNumber(resultCounts.created) ?? 0,
      eventCount: displayCacheEntries.length,
      kept: readNumber(resultCounts.kept) ?? 0,
      limit: readMaxMeta(displayCacheEntries, "limit") ?? readMaxMeta(trimEntries, "limit"),
      maxSize: readMaxMeta(displayCacheEntries, "cacheSize") ?? readMaxMeta(trimEntries, "cacheSize"),
      trimmed: sumMeta(trimEntries, "trimmed"),
      trimEventCount: trimEntries.length,
      upgraded: readNumber(resultCounts.upgraded) ?? 0,
    },
    fullDisplayQueue: {
      clearEventCount: clearQueuedFullEntries.length,
      cleared: sumMeta(clearQueuedFullEntries, "cleared"),
    },
  };
};

export const createPlotCacheReportBlock = ({ analysisPerfReport }) =>
  summarizePlotCacheMetrics(analysisPerfReport);
