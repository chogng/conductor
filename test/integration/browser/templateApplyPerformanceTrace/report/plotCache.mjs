import {
  countBy,
  getAnalysisPerfEntries,
  readNumber,
} from "./common.mjs";

export const summarizePlotCacheMetrics = (analysisPerfReport) => {
  const entries = getAnalysisPerfEntries(analysisPerfReport);
  const displayCacheEntries = entries
    .filter(entry => entry.stage === "plotService.cachePlotDisplayModel");
  const inspectorCacheEntries = entries
    .filter(entry => entry.stage === "plotService.cachePlotInspectorDisplayModel");
  const trimEntries = entries
    .filter(entry => entry.stage === "plotService.trimPlotDisplayModelCache");
  const inspectorTrimEntries = entries
    .filter(entry => entry.stage === "plotService.trimPlotInspectorDisplayModelCache");
  const clearQueuedInspectorEntries = entries
    .filter(entry => entry.stage === "plotService.clearQueuedInspectorDisplayModel");
  const inspectorPrefetchScheduledEntries = entries
    .filter(entry => entry.stage === "chartViewPane.scheduleInspectorPrefetch");
  const inspectorPrefetchCanceledEntries = entries
    .filter(entry => entry.stage === "chartViewPane.cancelInspectorPrefetch");
  const inspectorPrefetchFiredEntries = entries
    .filter(entry => entry.stage === "chartViewPane.fireInspectorPrefetch");
  const inspectorPrefetchSkippedEntries = entries
    .filter(entry => entry.stage === "chartViewPane.skipInspectorPrefetch");
  const resultCounts = countBy(displayCacheEntries.map(entry => entry.meta?.result));
  const inspectorResultCounts = countBy(inspectorCacheEntries.map(entry => entry.meta?.result));
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
      trimmedActive: sumMeta(trimEntries, "trimmedActive"),
      trimmedBackground: sumMeta(trimEntries, "trimmedBackground"),
      trimmedHover: sumMeta(trimEntries, "trimmedHover"),
      trimmedIdle: sumMeta(trimEntries, "trimmedIdle"),
      trimmedNearby: sumMeta(trimEntries, "trimmedNearby"),
      trimmedVisible: sumMeta(trimEntries, "trimmedVisible"),
      trimEventCount: trimEntries.length,
      upgraded: readNumber(resultCounts.upgraded) ?? 0,
    },
    inspectorDisplayModelCache: {
      created: readNumber(inspectorResultCounts.created) ?? 0,
      eventCount: inspectorCacheEntries.length,
      kept: readNumber(inspectorResultCounts.kept) ?? 0,
      limit: readMaxMeta(inspectorCacheEntries, "limit") ?? readMaxMeta(inspectorTrimEntries, "limit"),
      maxSize: readMaxMeta(inspectorCacheEntries, "cacheSize") ?? readMaxMeta(inspectorTrimEntries, "cacheSize"),
      trimmed: sumMeta(inspectorTrimEntries, "trimmed"),
      trimEventCount: inspectorTrimEntries.length,
    },
    inspectorDisplayQueue: {
      clearEventCount: clearQueuedInspectorEntries.length,
      cleared: sumMeta(clearQueuedInspectorEntries, "cleared"),
    },
    inspectorPrefetchScheduler: {
      canceled: inspectorPrefetchCanceledEntries.length,
      fired: inspectorPrefetchFiredEntries.length,
      scheduled: inspectorPrefetchScheduledEntries.length,
      skipped: inspectorPrefetchSkippedEntries.length,
    },
  };
};

export const createPlotCacheReportBlock = ({ analysisPerfReport }) =>
  summarizePlotCacheMetrics(analysisPerfReport);
