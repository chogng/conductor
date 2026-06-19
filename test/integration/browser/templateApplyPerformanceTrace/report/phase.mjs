import {
  countBy,
  readNumber,
  roundMetric,
  summarizeDurations,
  summarizeStageDuration,
} from "./common.mjs";
import { summarizeResourceSamples } from "./resources.mjs";

export const getTraceEventWallTime = event =>
  readNumber(event?.wallTime) ??
  (readNumber(event?.timeOrigin) != null && readNumber(event?.timestamp) != null
    ? readNumber(event.timeOrigin) + readNumber(event.timestamp)
    : null);

export const isInWindow = (time, window) =>
  time != null &&
  time >= window.startWallTime &&
  (window.endWallTime == null || time <= window.endWallTime);

export const filterByWindow = (items, window, getTime) =>
  items.filter(item => isInWindow(getTime(item), window));

export const createPhaseWindows = (anchors) => {
  const byName = new Map();
  for (const anchor of anchors) {
    if (!byName.has(anchor.name)) {
      byName.set(anchor.name, anchor);
    }
  }

  const createWindow = (name, startName, endName) => {
    const start = byName.get(startName);
    if (!start) {
      return null;
    }

    const end = byName.get(endName);
    if (end?.wallTime != null && end.wallTime < start.wallTime) {
      return null;
    }
    return {
      endAnchor: endName,
      endWallTime: end?.wallTime ?? null,
      name,
      startAnchor: startName,
      startWallTime: start.wallTime,
      durationMs: end?.wallTime != null
        ? Math.max(0, end.wallTime - start.wallTime)
        : null,
    };
  };

  return [
    createWindow("importDispatch", "import.dispatch.start", "import.dispatch.end"),
    createWindow("importUntilReady", "import.dispatch.start", "import.ready"),
    createWindow("applyClick", "apply.click.start", "apply.click.end"),
    createWindow("applyProcessing", "apply.click.start", "processing.done"),
    createWindow("liveThumbnailHover", "live.thumbnailHover.start", "live.thumbnailHover.end"),
    createWindow("liveThumbnailHoverDuringProcessing", "live.thumbnailHover.start", "processing.done"),
    createWindow("liveThumbnailHoverAfterProcessing", "processing.done", "live.thumbnailHover.end"),
    createWindow("liveFileSwitch", "live.fileSwitch.start", "live.fileSwitch.end"),
    createWindow("liveFileSwitchDuringProcessing", "live.fileSwitch.start", "processing.done"),
    createWindow("liveFileSwitchAfterProcessing", "processing.done", "live.fileSwitch.end"),
    createWindow("stableThumbnailHover", "stable.thumbnailHover.start", "stable.thumbnailHover.end"),
    createWindow("stableFileSwitch", "stable.fileSwitch.start", "stable.fileSwitch.end"),
    createWindow("postProcessingStable", "processing.done", "stable.end"),
  ].filter(Boolean);
};

export const summarizePerfEntries = (entries) => {
  const stageCounts = countBy(entries.map(entry => entry.stage));
  const stageDurationMs = {};
  for (const stage of Object.keys(stageCounts).sort()) {
    const summary = summarizeStageDuration(entries, stage);
    if (summary.count > 0) {
      stageDurationMs[stage] = summary;
    }
  }

  const topStageDurationMs = Object.entries(stageDurationMs)
    .map(([stage, summary]) => ({
      count: summary.count,
      maxMs: summary.maxMs,
      stage,
      totalMs: summary.totalMs,
    }))
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
    .slice(0, 12);

  return {
    entryCount: entries.length,
    stageCounts,
    stageDurationMs,
    topStageDurationMs,
  };
};

export const summarizePhaseWindow = ({
  analysisPerfReport,
  resourceSamples,
  traceEvents,
  window,
}) => {
  const windowTraceEvents = filterByWindow(
    traceEvents,
    window,
    getTraceEventWallTime,
  );
  const perfEntries = filterByWindow(
    Array.isArray(analysisPerfReport?.entries) ? analysisPerfReport.entries : [],
    window,
    entry => readNumber(entry?.timestamp),
  );
  const resources = filterByWindow(
    resourceSamples,
    window,
    sample => readNumber(sample?.wallTime),
  );
  const longTasks = windowTraceEvents.filter(event => event.stage === "import.runtime.longTask");
  const eventLoopLag = windowTraceEvents.filter(event => event.stage === "import.runtime.eventLoopLag");

  return {
    ...window,
    eventLoopLagMs: summarizeDurations(eventLoopLag.map(event => event.meta?.durationMs)),
    longTaskMs: summarizeDurations(longTasks.map(event => event.meta?.durationMs)),
    perf: summarizePerfEntries(perfEntries),
    resources: summarizeResourceSamples(resources),
    topLongTasks: longTasks
      .map(event => ({
        durationMs: roundMetric(readNumber(event.meta?.durationMs)),
        name: event.meta?.name ?? null,
        offsetMs: roundMetric(getTraceEventWallTime(event) - window.startWallTime),
        stage: event.stage,
      }))
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 8),
    traceEventCount: windowTraceEvents.length,
    traceStageCounts: countBy(windowTraceEvents.map(event => event.stage)),
  };
};

export const summarizePhaseAnalysis = ({
  analysisPerfReport,
  phaseAnchors,
  resourceSamples,
  traceEvents,
}) => {
  const windows = createPhaseWindows(phaseAnchors);
  const summaries = windows.map(window => summarizePhaseWindow({
    analysisPerfReport,
    resourceSamples,
    traceEvents,
    window,
  }));
  return {
    anchorCount: phaseAnchors.length,
    anchors: phaseAnchors,
    windows: summaries,
    windowsByName: Object.fromEntries(summaries.map(summary => [summary.name, summary])),
  };
};

export const pickPhaseWindows = (analysis, names) => Object.fromEntries(
  names.map(name => [name, analysis.phaseAnalysis?.windowsByName?.[name] ?? null]),
);

export const summarizeAnalysisPerfReport = (report) => {
  const entries = Array.isArray(report?.entries) ? report.entries : [];
  if (!entries.length) {
    return {
      entryCount: 0,
      stageCounts: {},
      thumbnail: null,
    };
  }

  const thumbnailEntries = entries.filter(entry =>
    String(entry.stage ?? "").startsWith("thumbnail")
  );
  const thumbnailHoverRenders = entries.filter(entry => entry.stage === "thumbnailHover.render");
  const thumbnailHoverShellReuses = entries.filter(entry => entry.stage === "thumbnailHover.reuseShell");
  const thumbnailHoverIdentityMismatches = entries.filter(entry => entry.stage === "thumbnailHover.identityMismatch");
  const thumbnailPreviewRequests = entries.filter(entry => entry.stage === "thumbnailPreview.request");
  return {
    entryCount: entries.length,
    stageCounts: countBy(entries.map(entry => entry.stage)),
    thumbnail: {
      entryCount: thumbnailEntries.length,
      hoverIdentityMismatchCount: thumbnailHoverIdentityMismatches.length,
      hoverRenderCacheHits: countBy(thumbnailHoverRenders.map(entry => entry.meta?.cacheHit)),
      hoverRenderModelSources: countBy(thumbnailHoverRenders.map(entry => entry.meta?.plotModelSource)),
      hoverRenderPreviewStates: countBy(thumbnailHoverRenders.map(entry => entry.meta?.previewState)),
      hoverShellReuseCount: thumbnailHoverShellReuses.length,
      previewRequestMs: summarizeStageDuration(entries, "thumbnailPreview.request"),
      previewRequestPriorities: countBy(thumbnailPreviewRequests.map(entry => entry.meta?.priority)),
      previewRequestStates: countBy(thumbnailPreviewRequests.map(entry => entry.meta?.state)),
      stageCounts: countBy(thumbnailEntries.map(entry => entry.stage)),
    },
  };
};
