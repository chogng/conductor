import {
  readNumber,
  roundMetric,
  summarizeDurations,
} from "./common.mjs";
import { getTraceEventWallTime } from "./phase.mjs";
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

export const createLiveFileSwitchTargetSamples = (result, window = null) => {
  const events = Array.isArray(result?.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result?.trace?.dispatches) ? result.trace.dispatches : [];
  return firstDispatchesByFileForWindow(dispatches, window).map((dispatch) => {
    const fileId = String(dispatch.fileId ?? "");
    const dispatchSignature = dispatch.state?.canvasSignature ?? null;
    const dispatchRenderSignature = dispatch.state?.canvasRenderSignature ?? null;
    const fileEvents = events.filter(event =>
      event.selectedFileId === fileId &&
      readNumber(event.timestamp) != null &&
      readNumber(dispatch.timestamp) != null &&
      event.timestamp >= dispatch.timestamp
    );
    const selected = fileEvents[0] ?? null;
    const canvasVisible = fileEvents.find(event => event.canvasVisible);
    const canvasNonBlank = fileEvents.find(event => event.canvasNonBlank);
    const renderSignatureDrawn = fileEvents.find(event =>
      event.canvasNonBlank &&
      typeof event.canvasRenderSignature === "string" &&
      event.canvasRenderSignature.split("|")[0] === fileId
    );
    const canvasChanged = fileEvents.find(event =>
      event.canvasNonBlank &&
      event.canvasSignature &&
      event.canvasSignature !== dispatchSignature
    );
    const renderSignatureChanged = fileEvents.find(event =>
      event.canvasNonBlank &&
      event.canvasRenderSignature &&
      event.canvasRenderSignature !== dispatchRenderSignature
    );
    const chartChanged = renderSignatureDrawn ?? canvasChanged;
    const readySelected = fileEvents.find(event =>
      event.selectedChartState === "ready" ||
      event.selectedHasChartData === true
    );
    return {
      canvasChangedMs: durationFromDispatch(dispatch, canvasChanged),
      canvasNonBlankMs: durationFromDispatch(dispatch, canvasNonBlank),
      canvasVisibleMs: durationFromDispatch(dispatch, canvasVisible),
      chartDrawnMs: durationFromDispatch(dispatch, chartChanged),
      chartDrawnSource: renderSignatureDrawn
        ? "renderSignature"
        : chartChanged
          ? "canvasSignature"
          : null,
      dispatchTimestamp: roundMetric(readNumber(dispatch.timestamp)),
      dispatchWallTime: roundMetric(getTraceEventWallTime(dispatch)),
      fileId,
      readySelectedMs: durationFromDispatch(dispatch, readySelected),
      renderSignatureChangedMs: durationFromDispatch(dispatch, renderSignatureChanged),
      renderSignatureDrawnMs: durationFromDispatch(dispatch, renderSignatureDrawn),
      selectedMs: durationFromDispatch(dispatch, selected),
    };
  });
};

export const summarizeFileSwitchStress = (result) => {
  if (!result) {
    return null;
  }

  const samples = Array.isArray(result.samples) ? result.samples : [];
  return {
    canvasVisibleCount: samples.filter(sample => sample.canvasVisibleMs != null).length,
    canvasVisibleMs: summarizeDurations(samples.map(sample => sample.canvasVisibleMs)),
    chartDrawnCount: samples.filter(sample => sample.chartDrawnMs != null).length,
    chartDrawnMs: summarizeDurations(samples.map(sample => sample.chartDrawnMs)),
    durationMs: result.durationMs,
    dispatchedCount: samples.filter(sample => sample.dispatched).length,
    requestedCount: result.requestedCount,
    sampledCount: samples.length,
    selectedCount: samples.filter(sample => sample.selectedMs != null).length,
    selectedMs: summarizeDurations(samples.map(sample => sample.selectedMs)),
    targetCount: result.targetCount,
  };
};

export const summarizeLiveFileSwitchTargetSamples = (targetSamples) => ({
  targetCanvasChangedCount: targetSamples.filter(sample => sample.canvasChangedMs != null).length,
  targetCanvasChangedMs: summarizeDurations(targetSamples.map(sample => sample.canvasChangedMs)),
  readySelectedCount: targetSamples.filter(sample => sample.readySelectedMs != null).length,
  readySelectedMs: summarizeDurations(targetSamples.map(sample => sample.readySelectedMs)),
  targetChartDrawnByCanvasSignatureCount: targetSamples.filter(sample => sample.chartDrawnSource === "canvasSignature").length,
  targetChartDrawnByRenderSignatureCount: targetSamples.filter(sample => sample.chartDrawnSource === "renderSignature").length,
  sampledTargetCount: targetSamples.length,
  targetCanvasNonBlankCount: targetSamples.filter(sample => sample.canvasNonBlankMs != null).length,
  targetCanvasNonBlankMs: summarizeDurations(targetSamples.map(sample => sample.canvasNonBlankMs)),
  targetCanvasVisibleCount: targetSamples.filter(sample => sample.canvasVisibleMs != null).length,
  targetCanvasVisibleMs: summarizeDurations(targetSamples.map(sample => sample.canvasVisibleMs)),
  targetChartDrawnCount: targetSamples.filter(sample => sample.chartDrawnMs != null).length,
  targetChartDrawnMs: summarizeDurations(targetSamples.map(sample => sample.chartDrawnMs)),
  targetRenderSignatureChangedCount: targetSamples.filter(sample => sample.renderSignatureChangedMs != null).length,
  targetRenderSignatureChangedMs: summarizeDurations(targetSamples.map(sample => sample.renderSignatureChangedMs)),
  targetRenderSignatureDrawnCount: targetSamples.filter(sample => sample.renderSignatureDrawnMs != null).length,
  targetRenderSignatureDrawnMs: summarizeDurations(targetSamples.map(sample => sample.renderSignatureDrawnMs)),
  targetSamples,
  targetSelectedCount: targetSamples.filter(sample => sample.selectedMs != null).length,
  targetSelectedMs: summarizeDurations(targetSamples.map(sample => sample.selectedMs)),
});

export const summarizeLiveFileSwitchWindow = (window, targetSamples, perfReport) => {
  if (!window) {
    return null;
  }

  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  return {
    durationMs: window.durationMs,
    endAnchor: window.endAnchor,
    startAnchor: window.startAnchor,
    ...summarizeLiveFileSwitchTargetSamples(targetSamples),
    targetPlotMainDrawnMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotMainDrawn"),
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
  };
};

export const summarizeFileSwitchLiveStress = (result, phaseAnchors = [], perfReport = null) => {
  if (!result) {
    return null;
  }

  const events = Array.isArray(result.trace?.events) ? result.trace.events : [];
  const dispatches = Array.isArray(result.trace?.dispatches) ? result.trace.dispatches : [];
  const targetSamples = createLiveFileSwitchTargetSamples(result);
  const targetPerfMilestones = createTargetPerfMilestoneSamples(perfReport, targetSamples);
  const duringProcessingWindow = phaseWindowByName(phaseAnchors, "liveFileSwitchDuringProcessing");
  const afterProcessingWindow = phaseWindowByName(phaseAnchors, "liveFileSwitchAfterProcessing");
  const targetSampleSummary = summarizeLiveFileSwitchTargetSamples(targetSamples);
  const settleSample = result.settleSample ?? null;
  return {
    dispatchCount: dispatches.length,
    durationMs: result.durationMs,
    eventCount: result.eventCount,
    fileSwitchIntervalMs: result.intervalMs,
    liveWindowMs: result.liveMs,
    phaseWindows: {
      afterProcessing: summarizeLiveFileSwitchWindow(
        afterProcessingWindow,
        createLiveFileSwitchTargetSamples(result, afterProcessingWindow),
        perfReport,
      ),
      duringProcessing: summarizeLiveFileSwitchWindow(
        duringProcessingWindow,
        createLiveFileSwitchTargetSamples(result, duringProcessingWindow),
        perfReport,
      ),
    },
    requestedCount: result.requestedCount,
    settleCanvasVisibleMs: readNumber(settleSample?.canvasVisibleMs),
    settleChartDrawnMs: readNumber(settleSample?.chartDrawnMs),
    settleFileId: settleSample?.fileId ?? null,
    settleSelectedMs: readNumber(settleSample?.selectedMs),
    settleState: settleSample?.afterState ?? null,
    targetCount: result.targetCount,
    ...targetSampleSummary,
    targetPlotMainDrawnMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotMainDrawn"),
    targetPlotChartCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotChartCached"),
    targetPlotFullCachedMs: summarizeTargetPerfMilestoneOffset(targetPerfMilestones, "plotFullCached"),
    targetPerfMilestoneSummary: summarizeTargetPerfMilestoneSamples(targetPerfMilestones),
    targetPerfMilestones,
    traceEventCount: events.length,
    uniqueDispatchedFileCount: new Set(dispatches.map(dispatch => dispatch.fileId).filter(Boolean)).size,
  };
};

export const summarizeFileSwitchSpeedComparison = ({
  apply,
  liveSummary,
  stableSummary,
}) => {
  if (!liveSummary && !stableSummary) {
    return null;
  }

  const beforeDrawnP50Ms = readNumber(liveSummary?.targetChartDrawnMs?.p50Ms);
  const beforeSelectedP50Ms = readNumber(liveSummary?.targetSelectedMs?.p50Ms);
  const settleDrawnMs = readNumber(liveSummary?.settleChartDrawnMs);
  const settleSelectedMs = readNumber(liveSummary?.settleSelectedMs);
  const afterDrawnP50Ms = readNumber(stableSummary?.chartDrawnMs?.p50Ms);
  const afterSelectedP50Ms = readNumber(stableSummary?.selectedMs?.p50Ms);
  return {
    afterProcessingComplete: stableSummary,
    beforeProcessingComplete: liveSummary,
    delta: {
      chartDrawnP50MinusStableP50Ms: beforeDrawnP50Ms != null && afterDrawnP50Ms != null
        ? roundMetric(beforeDrawnP50Ms - afterDrawnP50Ms)
        : null,
      chartDrawnP50ToStableP50Ratio: beforeDrawnP50Ms != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(beforeDrawnP50Ms / afterDrawnP50Ms)
        : null,
      settleChartDrawnMinusStableP50Ms: settleDrawnMs != null && afterDrawnP50Ms != null
        ? roundMetric(settleDrawnMs - afterDrawnP50Ms)
        : null,
      settleChartDrawnToStableP50Ratio: settleDrawnMs != null && afterDrawnP50Ms != null && afterDrawnP50Ms > 0
        ? roundMetric(settleDrawnMs / afterDrawnP50Ms)
        : null,
      settleSelectedMinusStableP50Ms: settleSelectedMs != null && afterSelectedP50Ms != null
        ? roundMetric(settleSelectedMs - afterSelectedP50Ms)
        : null,
      settleSelectedToStableP50Ratio: settleSelectedMs != null && afterSelectedP50Ms != null && afterSelectedP50Ms > 0
        ? roundMetric(settleSelectedMs / afterSelectedP50Ms)
        : null,
      selectedP50MinusStableP50Ms: beforeSelectedP50Ms != null && afterSelectedP50Ms != null
        ? roundMetric(beforeSelectedP50Ms - afterSelectedP50Ms)
        : null,
      selectedP50ToStableP50Ratio: beforeSelectedP50Ms != null && afterSelectedP50Ms != null && afterSelectedP50Ms > 0
        ? roundMetric(beforeSelectedP50Ms / afterSelectedP50Ms)
        : null,
    },
    processingBatchMs: readNumber(apply?.processingBatchMs),
  };
};

export const createFileSwitchReportBlock = ({ analysis }) => ({
  live: analysis.fileSwitchLive,
  speedComparison: analysis.fileSwitchSpeedComparison,
  stable: analysis.fileSwitch,
});
