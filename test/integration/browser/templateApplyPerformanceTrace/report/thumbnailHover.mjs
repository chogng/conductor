import {
  countBy,
  readNumber,
  roundMetric,
  summarizeDurations,
} from "./common.mjs";
import { getTraceEventWallTime, summarizeAnalysisPerfReport } from "./phase.mjs";
import {
  createTargetPerfMilestoneSamples,
  summarizeTargetPerfMilestoneOffset,
  summarizeTargetPerfMilestoneSamples,
} from "./milestones.mjs";
import {
  durationFromDispatch,
  firstDispatchesByFileForWindow,
  phaseWindowByName,
} from "./interactionCommon.mjs";

export const summarizeThumbnailHoverStress = (result, perfReport) => {
  if (!result) {
    return null;
  }

  const samples = Array.isArray(result.samples) ? result.samples : [];
  const perfSummary = summarizeAnalysisPerfReport(perfReport).thumbnail;
  return {
    canvasDrawnCount: samples.filter(sample => sample.canvasDrawnMs != null).length,
    canvasDrawnMs: summarizeDurations(samples.map(sample => sample.canvasDrawnMs)),
    canvasNonBlankCount: samples.filter(sample => sample.hoverState?.canvasNonBlank).length,
    canvasReadyMs: summarizeDurations(samples.map(sample => sample.canvasReadyMs)),
    canvasStableCount: samples.filter(sample => sample.canvasStableMs != null).length,
    canvasStableMs: summarizeDurations(samples.map(sample => sample.canvasStableMs)),
    canvasVisibleCount: samples.filter(sample => sample.hoverState?.canvasVisible).length,
    durationMs: result.durationMs,
    loadingVisibleCount: samples.filter(sample => sample.hoverState?.loadingVisible).length,
    perf: perfSummary,
    requestedCount: result.requestedCount,
    sampledCount: samples.length,
    targetCount: result.targetCount,
    targetSourceCounts: countBy(samples.map(sample => sample.source ?? "dom")),
    tooltipVisibleCount: samples.filter(sample => sample.hoverState?.tooltipVisible).length,
    tooltipVisibleMs: summarizeDurations(samples.map(sample => sample.tooltipVisibleMs)),
  };
};

export const createLiveHoverTargetSamples = (result, window = null) => {
  const events = Array.isArray(result?.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result?.trace?.dispatches) ? result.trace.dispatches : [];
  return firstDispatchesByFileForWindow(dispatches, window).map((dispatch) => {
    const fileId = String(dispatch.fileId ?? "");
    const fileEvents = events.filter(event =>
      event.fileId === fileId &&
      readNumber(event.timestamp) != null &&
      readNumber(dispatch.timestamp) != null &&
      event.timestamp >= dispatch.timestamp
    );
    const tooltip = fileEvents.find(event => event.tooltipVisible);
    const canvasVisible = fileEvents.find(event => event.canvasVisible);
    const canvasNonBlank = fileEvents.find(event => event.canvasNonBlank);
    const stableReady = fileEvents.find(event =>
      event.canvasNonBlank &&
      event.plotSignature &&
      event.loadingVisible === false
    );
    const canvasIds = new Set(fileEvents.map(event => event.canvasId).filter(Boolean));
    const plotSignatures = new Set(fileEvents.map(event => event.plotSignature).filter(Boolean));
    let blankAfterNonBlankCount = 0;
    let sawNonBlank = false;
    for (const event of fileEvents) {
      if (event.canvasNonBlank) {
        sawNonBlank = true;
      } else if (sawNonBlank && event.canvasVisible) {
        blankAfterNonBlankCount += 1;
      }
    }

    return {
      blankAfterNonBlankCount,
      canvasNonBlankMs: durationFromDispatch(dispatch, canvasNonBlank),
      canvasReplacementCount: Math.max(0, canvasIds.size - 1),
      canvasVisibleMs: durationFromDispatch(dispatch, canvasVisible),
      dispatchTimestamp: roundMetric(readNumber(dispatch.timestamp)),
      dispatchWallTime: roundMetric(getTraceEventWallTime(dispatch)),
      fileId,
      plotSignatureChangeCount: Math.max(0, plotSignatures.size - 1),
      stableReadyMs: durationFromDispatch(dispatch, stableReady),
      tooltipMs: durationFromDispatch(dispatch, tooltip),
    };
  });
};

export const summarizeLiveHoverTargetSamples = (targetSamples) => ({
  sampledTargetCount: targetSamples.length,
  targetBlankAfterNonBlankCount: targetSamples.reduce(
    (sum, sample) => sum + sample.blankAfterNonBlankCount,
    0,
  ),
  targetCanvasNonBlankCount: targetSamples.filter(sample => sample.canvasNonBlankMs != null).length,
  targetCanvasNonBlankMs: summarizeDurations(targetSamples.map(sample => sample.canvasNonBlankMs)),
  targetCanvasReplacementCount: targetSamples.reduce(
    (sum, sample) => sum + sample.canvasReplacementCount,
    0,
  ),
  targetCanvasVisibleCount: targetSamples.filter(sample => sample.canvasVisibleMs != null).length,
  targetCanvasVisibleMs: summarizeDurations(targetSamples.map(sample => sample.canvasVisibleMs)),
  targetPlotSignatureChangeCount: targetSamples.reduce(
    (sum, sample) => sum + sample.plotSignatureChangeCount,
    0,
  ),
  targetSamples,
  targetStableReadyCount: targetSamples.filter(sample => sample.stableReadyMs != null).length,
  targetStableReadyMs: summarizeDurations(targetSamples.map(sample => sample.stableReadyMs)),
  targetTooltipCount: targetSamples.filter(sample => sample.tooltipMs != null).length,
  targetTooltipMs: summarizeDurations(targetSamples.map(sample => sample.tooltipMs)),
});

export const summarizeLiveHoverWindow = (window, targetSamples, perfReport) => {
  if (!window) {
    return null;
  }

  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  return {
    durationMs: window.durationMs,
    endAnchor: window.endAnchor,
    startAnchor: window.startAnchor,
    ...summarizeLiveHoverTargetSamples(targetSamples),
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPlotFullQueuedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullQueued"),
    targetPreviewReadyMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailReady"),
    targetThumbnailWarmedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailWarmed"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
  };
};

export const summarizeThumbnailHoverLiveStress = (result, perfReport, phaseAnchors = []) => {
  if (!result) {
    return null;
  }

  const events = Array.isArray(result.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result.trace?.dispatches) ? result.trace.dispatches : [];
  const targetSamples = createLiveHoverTargetSamples(result);
  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  const duringProcessingWindow = phaseWindowByName(phaseAnchors, "liveThumbnailHoverDuringProcessing");
  const afterProcessingWindow = phaseWindowByName(phaseAnchors, "liveThumbnailHoverAfterProcessing");
  const targetSampleSummary = summarizeLiveHoverTargetSamples(targetSamples);
  const watchedEvents = events.filter(event => event.isWatchedFile);
  const watchedCanvasIds = new Set(watchedEvents
    .map(event => event.canvasId)
    .filter(Boolean));
  const watchedPlotSignatures = new Set(watchedEvents
    .map(event => event.plotSignature)
    .filter(Boolean));
  let blankAfterNonBlankCount = 0;
  let sawNonBlank = false;
  for (const event of watchedEvents) {
    if (event.canvasNonBlank) {
      sawNonBlank = true;
    } else if (sawNonBlank && event.canvasVisible) {
      blankAfterNonBlankCount += 1;
    }
  }
  const firstNonBlank = watchedEvents.find(event => event.canvasNonBlank);
  const firstStableReady = watchedEvents.find(event =>
    event.canvasNonBlank &&
    event.plotSignature &&
    event.loadingVisible === false
  );
  const perfSummary = summarizeAnalysisPerfReport(perfReport).thumbnail;

  return {
    blankAfterNonBlankCount,
    dispatchCount: dispatches.length,
    durationMs: result.durationMs,
    eventCount: result.eventCount,
    hoverEventIntervalMs: result.intervalMs,
    liveWindowMs: result.liveMs,
    perf: perfSummary,
    phaseWindows: {
      afterProcessing: summarizeLiveHoverWindow(
        afterProcessingWindow,
        createLiveHoverTargetSamples(result, afterProcessingWindow),
        perfReport,
      ),
      duringProcessing: summarizeLiveHoverWindow(
        duringProcessingWindow,
        createLiveHoverTargetSamples(result, duringProcessingWindow),
        perfReport,
      ),
    },
    requestedCount: result.requestedCount,
    targetCount: result.targetCount,
    targetSourceCounts: countBy((result.targets ?? []).map(target => target.source ?? "dom")),
    ...targetSampleSummary,
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPlotFullQueuedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullQueued"),
    targetPreviewReadyMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailReady"),
    targetThumbnailWarmedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "thumbnailWarmed"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
    traceEventCount: events.length,
    uniqueDispatchedFileCount: new Set(dispatches.map(dispatch => dispatch.fileId).filter(Boolean)).size,
    watchOnly: result.watchOnly === true,
    watchedCanvasReplacementCount: Math.max(0, watchedCanvasIds.size - 1),
    watchedCanvasStateCounts: countBy(watchedEvents.map(event =>
      event.loadingVisible
        ? "loading"
        : event.canvasNonBlank
          ? "nonBlank"
          : event.canvasVisible
            ? "blankCanvas"
            : event.tooltipVisible
              ? "tooltipNoCanvas"
              : "noTooltip"
    )),
    watchedFirstNonBlankMs: readNumber(firstNonBlank?.timestamp),
    watchedFirstStableReadyMs: readNumber(firstStableReady?.timestamp),
    watchedFileId: result.trace?.watchedFileId ?? result.watchedTarget?.fileId ?? null,
    watchedPlotSignatureChangeCount: Math.max(0, watchedPlotSignatures.size - 1),
    watchedTimelineHead: watchedEvents.slice(0, 12),
    watchedTimelineTail: watchedEvents.slice(-12),
  };
};

export const summarizeLiveWatchedHoverSpeed = (result, liveSummary) => {
  if (!result || !liveSummary) {
    return null;
  }

  const events = Array.isArray(result.trace?.events)
    ? result.trace.events.filter(event => event.isWatchedFile)
    : [];
  const firstMs = predicate => readNumber(events.find(predicate)?.timestamp);
  return {
    blankAfterNonBlankCount: liveSummary.blankAfterNonBlankCount,
    dispatchCount: liveSummary.dispatchCount,
    eventCount: result.eventCount,
    firstCanvasNonBlankMs: firstMs(event => event.canvasNonBlank),
    firstCanvasVisibleMs: firstMs(event => event.canvasVisible),
    firstLoadingMs: firstMs(event => event.loadingVisible),
    firstStableReadyMs: firstMs(event =>
      event.canvasNonBlank &&
      event.plotSignature &&
      event.loadingVisible === false
    ),
    firstTooltipMs: firstMs(event => event.tooltipVisible),
    sampledTargetCount: liveSummary.sampledTargetCount,
    targetCount: result.targetCount,
    targetCanvasNonBlankCount: liveSummary.targetCanvasNonBlankCount,
    targetCanvasNonBlankMs: liveSummary.targetCanvasNonBlankMs,
    targetCanvasReplacementCount: liveSummary.targetCanvasReplacementCount,
    targetCanvasVisibleCount: liveSummary.targetCanvasVisibleCount,
    targetCanvasVisibleMs: liveSummary.targetCanvasVisibleMs,
    targetStableReadyCount: liveSummary.targetStableReadyCount,
    targetStableReadyMs: liveSummary.targetStableReadyMs,
    targetTooltipCount: liveSummary.targetTooltipCount,
    targetTooltipMs: liveSummary.targetTooltipMs,
    uniqueDispatchedFileCount: liveSummary.uniqueDispatchedFileCount,
    watchedCanvasReplacementCount: liveSummary.watchedCanvasReplacementCount,
    watchedFileId: liveSummary.watchedFileId,
    watchedPlotSignatureChangeCount: liveSummary.watchedPlotSignatureChangeCount,
    watchOnly: result.watchOnly === true,
  };
};

export const summarizeStableThumbnailHoverSpeed = (result, stableSummary) => {
  if (!result || !stableSummary) {
    return null;
  }

  return {
    canvasDrawnCount: stableSummary.canvasDrawnCount,
    canvasDrawnMs: stableSummary.canvasDrawnMs,
    canvasReadyMs: stableSummary.canvasReadyMs,
    canvasStableCount: stableSummary.canvasStableCount,
    canvasStableMs: stableSummary.canvasStableMs,
    canvasVisibleCount: stableSummary.canvasVisibleCount,
    loadingVisibleCount: stableSummary.loadingVisibleCount,
    sampledCount: stableSummary.sampledCount,
    targetCount: stableSummary.targetCount,
    tooltipVisibleCount: stableSummary.tooltipVisibleCount,
    tooltipVisibleMs: stableSummary.tooltipVisibleMs,
  };
};

export const summarizeThumbnailHoverSpeedComparison = ({
  apply,
  live,
  liveSummary,
  stable,
  stableSummary,
}) => {
  if (!live && !stable) {
    return null;
  }

  const beforeProcessingComplete = summarizeLiveWatchedHoverSpeed(live, liveSummary);
  const afterProcessingComplete = summarizeStableThumbnailHoverSpeed(stable, stableSummary);
  const beforeFirstNonBlankMs = readNumber(beforeProcessingComplete?.targetCanvasNonBlankMs?.p50Ms) ??
    readNumber(beforeProcessingComplete?.firstCanvasNonBlankMs);
  const afterDrawnP50Ms = readNumber(afterProcessingComplete?.canvasDrawnMs?.p50Ms);
  const afterDrawnMinMs = readNumber(afterProcessingComplete?.canvasDrawnMs?.minMs);
  return {
    afterProcessingComplete,
    beforeProcessingComplete,
    delta: {
      firstNonBlankMinusStableDrawnMinMs: beforeFirstNonBlankMs != null && afterDrawnMinMs != null
        ? roundMetric(beforeFirstNonBlankMs - afterDrawnMinMs)
        : null,
      firstNonBlankMinusStableDrawnP50Ms: beforeFirstNonBlankMs != null && afterDrawnP50Ms != null
        ? roundMetric(beforeFirstNonBlankMs - afterDrawnP50Ms)
        : null,
      firstNonBlankToStableDrawnP50Ratio: beforeFirstNonBlankMs != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(beforeFirstNonBlankMs / afterDrawnP50Ms)
        : null,
    },
    processingBatchMs: readNumber(apply?.processingBatchMs),
  };
};

export const createThumbnailHoverReportBlock = ({ analysis }) => ({
  live: analysis.thumbnailHoverLive,
  speedComparison: analysis.thumbnailHoverSpeedComparison,
  stable: analysis.thumbnailHover,
});
