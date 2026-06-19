import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  countBy,
  readNumber,
  roundMetric,
  summaryCount,
  summaryP95,
  summarizeDurations,
  summarizeStageDuration,
} from "./common.mjs";
import { summarizeCalculationBuildMetrics } from "./calculation.mjs";
import { summarizePlotCacheMetrics } from "./plotCache.mjs";
import { resolveTemplateApplyPerformanceTraceScenario } from "../scenarios.mjs";

export const createScenarioKey = (options) => {
  if (!options.scenario) {
    return createWorkloadScenarioKey(options);
  }

  const scenario = resolveTemplateApplyPerformanceTraceScenario(options.scenario);
  const scenarioHistoryKey = scenario?.historyKey ?? options.scenario;
  if (isScenarioDefaultWorkload(options)) {
    return scenarioHistoryKey;
  }

  return `${scenarioHistoryKey}.override.${createWorkloadScenarioKey(options)}`;
};

const createWorkloadScenarioKey = (options) => [
  options.runtime,
  options.profile,
  `files${options.fileCount}`,
  `rows${options.rowCount}`,
  options.thumbnailHover || options.thumbnailHoverLive ? `hover${options.thumbnailHoverCount}` : null,
  options.fileSwitch || options.fileSwitchLive ? `switch${options.fileSwitchCount}` : null,
  options.thumbnailHoverLive ? "live-hover" : null,
  options.fileSwitchLive ? "live-switch" : null,
  options.thumbnailHover ? "stable-hover" : null,
  options.fileSwitch ? "stable-switch" : null,
  options.liveStressCoordinated ? "coordinated" : options.liveStressParallel ? "parallel" : "serial",
].filter(Boolean).join(".");

const isScenarioDefaultWorkload = (options) => {
  const scenario = resolveTemplateApplyPerformanceTraceScenario(options.scenario);
  const defaults = scenario?.defaults ?? {};
  return Object.entries(defaults).every(([key, value]) => options[key] === value);
};

export const sanitizeFileName = (value) =>
  String(value ?? "default").replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";

export const createPerformanceMetricRow = ({
  analysis,
  analysisPerfReport,
  generatedAt,
  milestones,
  options,
  runId,
  runtime,
  thumbnailApply,
}) => {
  const applyProcessing = analysis.phaseAnalysis?.windowsByName?.applyProcessing;
  const calculationBuild = summarizeCalculationBuildMetrics(analysisPerfReport);
  const plotCache = summarizePlotCacheMetrics(analysisPerfReport);
  const plotMainDraw = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "plotMainChart.draw",
  );
  const plotDisplayTargetPrewarm = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "workbenchDomainBridge.prefetchPlotDisplayTargets",
  );
  const plotDisplayTargetPrewarmReasons = summarizePerfStageReasons(
    analysisPerfReport?.entries ?? [],
    "workbenchDomainBridge.prefetchPlotDisplayTargets",
    "priority",
  );
  const plotDisplayBatchPrewarm = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "plotService.prefetchPlotDisplayModels",
  );
  const plotDisplayBatchPrewarmReasons = summarizePerfStageReasons(
    analysisPerfReport?.entries ?? [],
    "plotService.prefetchPlotDisplayModels",
    "priority",
  );
  const workbenchRefresh = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshWorkbench",
  );
  const workbenchRefreshReasons = summarizePerfStageReasons(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshWorkbench",
  );
  const workbenchAuxiliaryRefresh = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshAuxiliarySurfaces",
  );
  const workbenchAuxiliaryRefreshReasons = summarizePerfStageReasons(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshAuxiliarySurfaces",
  );
  const workbenchSelectionRefresh = summarizeStageDuration(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshSelectionSurfaces",
  );
  const workbenchSelectionRefreshReasons = summarizePerfStageReasons(
    analysisPerfReport?.entries ?? [],
    "workbench.refreshSelectionSurfaces",
  );
  const thumbnailDuring = analysis.thumbnailHoverLive?.phaseWindows?.duringProcessing;
  const thumbnailAfter = analysis.thumbnailHoverLive?.phaseWindows?.afterProcessing;
  const switchDuring = analysis.fileSwitchLive?.phaseWindows?.duringProcessing;
  const switchAfter = analysis.fileSwitchLive?.phaseWindows?.afterProcessing;
  const flat = {
    applyEventLoopLagCount: summaryCount(applyProcessing?.eventLoopLagMs),
    applyEventLoopLagP95Ms: summaryP95(applyProcessing?.eventLoopLagMs),
    applyLongTaskCount: summaryCount(applyProcessing?.longTaskMs),
    applyLongTaskP95Ms: summaryP95(applyProcessing?.longTaskMs),
    applyProcessingMs: readNumber(thumbnailApply?.processingBatchMs) ?? readNumber(applyProcessing?.durationMs),
    calculationMainForegroundP95Ms: summaryP95(calculationBuild.mainForeground),
    calculationWorkerBackgroundP95Ms: summaryP95(calculationBuild.workerBackground),
    calculationWorkerBackgroundWaitP95Ms: summaryP95(calculationBuild.workerBackgroundWait),
    calculationWorkerForegroundP95Ms: summaryP95(calculationBuild.workerForeground),
    calculationWorkerForegroundWaitP95Ms: summaryP95(calculationBuild.workerForegroundWait),
    calculationWorkerWaitP95Ms: summaryP95(calculationBuild.workerWait),
    fileSwitchAfterChartDrawnP95Ms: summaryP95(switchAfter?.targetChartDrawnMs),
    fileSwitchAfterCanvasNonBlankP95Ms: summaryP95(switchAfter?.targetCanvasNonBlankMs),
    fileSwitchAfterPendingDisplayP95Ms: summaryP95(switchAfter?.targetPendingDisplayMs),
    fileSwitchAfterRenderSignatureDrawnP95Ms: summaryP95(switchAfter?.targetRenderSignatureDrawnMs),
    fileSwitchAfterStaleCanvasClearedP95Ms: summaryP95(switchAfter?.targetStaleCanvasClearedMs),
    fileSwitchDuringChartDrawnP95Ms: summaryP95(switchDuring?.targetChartDrawnMs),
    fileSwitchDuringCanvasNonBlankP95Ms: summaryP95(switchDuring?.targetCanvasNonBlankMs),
    fileSwitchDuringPendingDisplayP95Ms: summaryP95(switchDuring?.targetPendingDisplayMs),
    fileSwitchDuringPlotDisplayRequestedP95Ms: summaryP95(
      switchDuring?.targetPerfMilestoneSummary?.plotDisplayRequested?.offsetMs,
    ),
    fileSwitchDuringPlotMainDrawnP95Ms: summaryP95(
      switchDuring?.targetPerfMilestoneSummary?.plotMainDrawn?.offsetMs,
    ),
    fileSwitchDuringRenderSignatureDrawnP95Ms: summaryP95(switchDuring?.targetRenderSignatureDrawnMs),
    fileSwitchDuringRenderSignatureLagP95Ms: summaryP95(summarizeSampleDelta(
      switchDuring?.targetSamples,
      "renderSignatureDrawnMs",
      "canvasNonBlankMs",
    )),
    fileSwitchDuringSelectedP95Ms: summaryP95(switchDuring?.targetSelectedMs),
    fileSwitchDuringStaleCanvasClearedP95Ms: summaryP95(switchDuring?.targetStaleCanvasClearedMs),
    fileSwitchLiveTargetCount: readNumber(analysis.fileSwitchLive?.targetCount),
    fileSwitchLiveUniqueDispatchCount: readNumber(analysis.fileSwitchLive?.uniqueDispatchedFileCount),
    fileSwitchStableTargetCount: readNumber(analysis.fileSwitch?.targetCount),
    importAllBadgeMs: readNumber(milestones.allAssessmentBadgeMs),
    importAllPrepareMs: readNumber(milestones.allPrepareCompleteMs),
    importSessionCommitMs: readNumber(milestones.sessionCommitMs),
    maxCpuPercent: readNumber(analysis.resources?.maxCpuPercent),
    maxRssMb: readNumber(analysis.resources?.maxRssMb),
    maxTotalJsHeapMb: readNumber(analysis.resources?.maxTotalJsHeapMb),
    maxUsedJsHeapMb: readNumber(analysis.resources?.maxUsedJsHeapMb),
    meanCpuPercent: readNumber(analysis.resources?.avgCpuPercent),
    plotDisplayCacheCreated: readNumber(plotCache.displayModelCache.created),
    plotDisplayCacheHardLimit: readNumber(plotCache.displayModelCache.hardLimit),
    plotDisplayCacheMaxSize: readNumber(plotCache.displayModelCache.maxSize),
    plotDisplayCacheTrimmed: readNumber(plotCache.displayModelCache.trimmed),
    plotDisplayCacheTrimmedActive: readNumber(plotCache.displayModelCache.trimmedActive),
    plotDisplayCacheTrimmedBackground: readNumber(plotCache.displayModelCache.trimmedBackground),
    plotDisplayCacheTrimmedHover: readNumber(plotCache.displayModelCache.trimmedHover),
    plotDisplayCacheTrimmedProtected: readNumber(plotCache.displayModelCache.trimmedProtected),
    plotDisplayCacheTrimmedVisible: readNumber(plotCache.displayModelCache.trimmedVisible),
    plotDisplayCacheUpgraded: readNumber(plotCache.displayModelCache.upgraded),
    plotDisplayBatchPrewarmActiveCount: readNumber(plotDisplayBatchPrewarmReasons.active) ?? 0,
    plotDisplayBatchPrewarmCacheHitCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "cacheHitCount",
    ),
    plotDisplayBatchPrewarmCount: summaryCount(plotDisplayBatchPrewarm),
    plotDisplayBatchPrewarmDuplicateCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "duplicateCount",
    ),
    plotDisplayBatchPrewarmHoverCount: readNumber(plotDisplayBatchPrewarmReasons.hover) ?? 0,
    plotDisplayBatchPrewarmInputCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "inputCount",
    ),
    plotDisplayBatchPrewarmMissingCalculatedDataCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "missingCalculatedDataCount",
    ),
    plotDisplayBatchPrewarmNearbyCount: readNumber(plotDisplayBatchPrewarmReasons.nearby) ?? 0,
    plotDisplayBatchPrewarmP95Ms: summaryP95(plotDisplayBatchPrewarm),
    plotDisplayBatchPrewarmQueuedCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "queuedCount",
    ),
    plotDisplayBatchPrewarmRequestCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "plotService.prefetchPlotDisplayModels",
      "requestCount",
    ),
    plotDisplayBatchPrewarmVisibleCount: readNumber(plotDisplayBatchPrewarmReasons.visible) ?? 0,
    plotDisplayTargetPrewarmActiveCount: readNumber(plotDisplayTargetPrewarmReasons.active) ?? 0,
    plotDisplayTargetPrewarmCount: summaryCount(plotDisplayTargetPrewarm),
    plotDisplayTargetPrewarmFileCount: sumPerfStageNumber(
      analysisPerfReport?.entries ?? [],
      "workbenchDomainBridge.prefetchPlotDisplayTargets",
      "requestedFileCount",
    ),
    plotDisplayTargetPrewarmHoverCount: readNumber(plotDisplayTargetPrewarmReasons.hover) ?? 0,
    plotDisplayTargetPrewarmNearbyCount: readNumber(plotDisplayTargetPrewarmReasons.nearby) ?? 0,
    plotDisplayTargetPrewarmP95Ms: summaryP95(plotDisplayTargetPrewarm),
    plotDisplayTargetPrewarmVisibleCount: readNumber(plotDisplayTargetPrewarmReasons.visible) ?? 0,
    plotMainDrawCount: summaryCount(plotMainDraw),
    plotMainDrawP95Ms: summaryP95(plotMainDraw),
    plotInspectorCacheCreated: readNumber(plotCache.inspectorDisplayModelCache.created),
    plotInspectorCacheMaxSize: readNumber(plotCache.inspectorDisplayModelCache.maxSize),
    plotInspectorCacheTrimmed: readNumber(plotCache.inspectorDisplayModelCache.trimmed),
    plotInspectorPrefetchCanceled: readNumber(plotCache.inspectorPrefetchScheduler.canceled),
    plotInspectorPrefetchFired: readNumber(plotCache.inspectorPrefetchScheduler.fired),
    plotInspectorPrefetchScheduled: readNumber(plotCache.inspectorPrefetchScheduler.scheduled),
    plotInspectorPrefetchSkipped: readNumber(plotCache.inspectorPrefetchScheduler.skipped),
    plotInspectorQueueCleared: readNumber(plotCache.inspectorDisplayQueue.cleared),
    sessionCalculatedCommitP95Ms: summaryP95(
      applyProcessing?.perf?.stageDurationMs?.["sessionService.commitCalculatedRecordsBatch"],
    ),
    sessionTemplateCommitP95Ms: summaryP95(
      applyProcessing?.perf?.stageDurationMs?.["sessionService.commitTemplateOutput"],
    ),
    thumbnailAfterNonBlankP95Ms: summaryP95(thumbnailAfter?.targetCanvasNonBlankMs),
    thumbnailDuringNonBlankP95Ms: summaryP95(thumbnailDuring?.targetCanvasNonBlankMs),
    thumbnailFlickerCount: readNumber(analysis.thumbnailHoverLive?.blankAfterNonBlankCount) ?? 0,
    thumbnailLiveTargetCount: readNumber(analysis.thumbnailHoverLive?.targetCount),
    thumbnailLiveUniqueDispatchCount: readNumber(analysis.thumbnailHoverLive?.uniqueDispatchedFileCount),
    thumbnailStableTargetCount: readNumber(analysis.thumbnailHover?.targetCount),
    workbenchRefreshCount: summaryCount(workbenchRefresh),
    workbenchRefreshP95Ms: summaryP95(workbenchRefresh),
    workbenchRefreshReasons,
    workbenchRefreshNavigationCount: readNumber(workbenchRefreshReasons.navigation) ?? 0,
    workbenchRefreshSameViewModeCount: readNumber(workbenchRefreshReasons.sameViewMode) ?? 0,
    workbenchAuxiliaryRefreshCount: summaryCount(workbenchAuxiliaryRefresh),
    workbenchAuxiliaryRefreshP95Ms: summaryP95(workbenchAuxiliaryRefresh),
    workbenchAuxiliaryRefreshReasons,
    workbenchAuxiliaryRefreshExportStateCount: readNumber(workbenchAuxiliaryRefreshReasons.exportState) ?? 0,
    workbenchAuxiliaryRefreshPlotStateCount: readNumber(workbenchAuxiliaryRefreshReasons.plotState) ?? 0,
    workbenchAuxiliaryRefreshSessionCount: countReasonPrefix(workbenchAuxiliaryRefreshReasons, "session:"),
    workbenchAuxiliaryRefreshSettingsCount: readNumber(workbenchAuxiliaryRefreshReasons.settings) ?? 0,
    workbenchAuxiliaryRefreshTemplateStateCount: readNumber(workbenchAuxiliaryRefreshReasons.templateState) ?? 0,
    workbenchSelectionRefreshCount: summaryCount(workbenchSelectionRefresh),
    workbenchSelectionRefreshP95Ms: summaryP95(workbenchSelectionRefresh),
    workbenchSelectionRefreshReasons,
  };
  return {
    fileCount: options.fileCount,
    generatedAt,
    profile: options.profile,
    rowCount: options.rowCount,
    runId,
    runtime,
    scenarioKey: createScenarioKey(options),
    variant: options.variant,
    metrics: flat,
    calculationBuild,
  };
};

export const metricHistoryKeys = [
  "applyProcessingMs",
  "applyLongTaskP95Ms",
  "applyEventLoopLagP95Ms",
  "thumbnailAfterNonBlankP95Ms",
  "thumbnailDuringNonBlankP95Ms",
  "thumbnailLiveTargetCount",
  "thumbnailLiveUniqueDispatchCount",
  "thumbnailStableTargetCount",
  "fileSwitchAfterChartDrawnP95Ms",
  "fileSwitchAfterCanvasNonBlankP95Ms",
  "fileSwitchAfterPendingDisplayP95Ms",
  "fileSwitchAfterRenderSignatureDrawnP95Ms",
  "fileSwitchAfterStaleCanvasClearedP95Ms",
  "fileSwitchDuringCanvasNonBlankP95Ms",
  "fileSwitchDuringChartDrawnP95Ms",
  "fileSwitchDuringPendingDisplayP95Ms",
  "fileSwitchDuringPlotDisplayRequestedP95Ms",
  "fileSwitchDuringPlotMainDrawnP95Ms",
  "fileSwitchDuringRenderSignatureDrawnP95Ms",
  "fileSwitchDuringRenderSignatureLagP95Ms",
  "fileSwitchDuringStaleCanvasClearedP95Ms",
  "fileSwitchLiveTargetCount",
  "fileSwitchLiveUniqueDispatchCount",
  "fileSwitchStableTargetCount",
  "calculationMainForegroundP95Ms",
  "calculationWorkerForegroundP95Ms",
  "calculationWorkerForegroundWaitP95Ms",
  "calculationWorkerBackgroundWaitP95Ms",
  "calculationWorkerWaitP95Ms",
  "maxUsedJsHeapMb",
  "maxRssMb",
  "meanCpuPercent",
  "maxCpuPercent",
  "plotDisplayCacheMaxSize",
  "plotDisplayCacheHardLimit",
  "plotDisplayCacheCreated",
  "plotDisplayCacheUpgraded",
  "plotDisplayCacheTrimmed",
  "plotDisplayCacheTrimmedBackground",
  "plotDisplayCacheTrimmedProtected",
  "plotDisplayCacheTrimmedVisible",
  "plotDisplayCacheTrimmedHover",
  "plotDisplayCacheTrimmedActive",
  "plotDisplayBatchPrewarmActiveCount",
  "plotDisplayBatchPrewarmCacheHitCount",
  "plotDisplayBatchPrewarmCount",
  "plotDisplayBatchPrewarmDuplicateCount",
  "plotDisplayBatchPrewarmHoverCount",
  "plotDisplayBatchPrewarmInputCount",
  "plotDisplayBatchPrewarmMissingCalculatedDataCount",
  "plotDisplayBatchPrewarmNearbyCount",
  "plotDisplayBatchPrewarmP95Ms",
  "plotDisplayBatchPrewarmQueuedCount",
  "plotDisplayBatchPrewarmRequestCount",
  "plotDisplayBatchPrewarmVisibleCount",
  "plotDisplayTargetPrewarmActiveCount",
  "plotDisplayTargetPrewarmCount",
  "plotDisplayTargetPrewarmFileCount",
  "plotDisplayTargetPrewarmHoverCount",
  "plotDisplayTargetPrewarmNearbyCount",
  "plotDisplayTargetPrewarmP95Ms",
  "plotDisplayTargetPrewarmVisibleCount",
  "plotMainDrawCount",
  "plotMainDrawP95Ms",
  "plotInspectorCacheMaxSize",
  "plotInspectorCacheCreated",
  "plotInspectorCacheTrimmed",
  "plotInspectorPrefetchScheduled",
  "plotInspectorPrefetchFired",
  "plotInspectorPrefetchCanceled",
  "plotInspectorPrefetchSkipped",
  "plotInspectorQueueCleared",
  "workbenchRefreshCount",
  "workbenchRefreshP95Ms",
  "workbenchRefreshNavigationCount",
  "workbenchRefreshSameViewModeCount",
  "workbenchAuxiliaryRefreshCount",
  "workbenchAuxiliaryRefreshP95Ms",
  "workbenchAuxiliaryRefreshExportStateCount",
  "workbenchAuxiliaryRefreshPlotStateCount",
  "workbenchAuxiliaryRefreshSessionCount",
  "workbenchAuxiliaryRefreshSettingsCount",
  "workbenchAuxiliaryRefreshTemplateStateCount",
  "workbenchSelectionRefreshCount",
  "workbenchSelectionRefreshP95Ms",
];

const summarizePerfStageReasons = (entries, stage, key = "reasons") => {
  const reasons = [];
  for (const entry of entries ?? []) {
    if (entry?.stage !== stage) {
      continue;
    }

    const rawReasons = String(entry.meta?.[key] ?? entry.meta?.reason ?? "unknown")
      .split(",")
      .map(reason => reason.trim())
      .filter(Boolean);
    reasons.push(...(rawReasons.length ? rawReasons : ["unknown"]));
  }
  return countBy(reasons);
};

const countReasonPrefix = (counts, prefix) =>
  Object.entries(counts ?? {}).reduce((total, [reason, count]) => (
    reason.startsWith(prefix) ? total + (readNumber(count) ?? 0) : total
  ), 0);

const summarizeSampleDelta = (samples, endKey, startKey) =>
  summarizeDurations((samples ?? []).map((sample) => {
    const end = readNumber(sample?.[endKey]);
    const start = readNumber(sample?.[startKey]);
    return end != null && start != null ? end - start : null;
  }));

const sumPerfStageNumber = (entries, stage, key) =>
  (entries ?? []).reduce((total, entry) => {
    if (entry?.stage !== stage) {
      return total;
    }

    return total + (readNumber(entry.meta?.[key]) ?? 0);
  }, 0);

export const readHistoryRows = (historyPath) => {
  if (!existsSync(historyPath)) {
    return [];
  }

  return readFileSync(historyPath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

export const compareMetricRows = (current, previous) => {
  if (!previous) {
    return null;
  }

  const metrics = {};
  for (const key of metricHistoryKeys) {
    const currentValue = readNumber(current.metrics?.[key]);
    const previousValue = readNumber(previous.metrics?.[key]);
    metrics[key] = {
      current: currentValue,
      delta: currentValue != null && previousValue != null
        ? roundMetric(currentValue - previousValue)
        : null,
      deltaPercent: currentValue != null && previousValue != null && previousValue !== 0
        ? roundMetric(((currentValue - previousValue) / previousValue) * 100)
        : null,
      previous: previousValue,
    };
  }
  return {
    previousGeneratedAt: previous.generatedAt ?? null,
    previousRunId: previous.runId ?? null,
    metrics,
  };
};

export const toCsvCell = (value) => {
  if (value == null) {
    return "";
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const writeHistoryCsv = (csvPath, rows) => {
  const columns = [
    "generatedAt",
    "runId",
    "runtime",
    "scenarioKey",
    "variant",
    "profile",
    "fileCount",
    "rowCount",
    ...metricHistoryKeys,
  ];
  const lines = [
    columns.join(","),
    ...rows.map(row => columns.map(column =>
      toCsvCell(row.metrics?.[column] ?? row[column])
    ).join(",")),
  ];
  writeFileSync(csvPath, `${lines.join("\n")}\n`);
};

export const writeHistorySvg = (svgPath, rows, scenarioKey) => {
  const scenarioRows = rows.filter(row => row.scenarioKey === scenarioKey);
  const chartKeys = [
    "applyProcessingMs",
    "applyLongTaskP95Ms",
    "calculationWorkerForegroundWaitP95Ms",
    "calculationWorkerWaitP95Ms",
    "thumbnailDuringNonBlankP95Ms",
    "fileSwitchDuringPendingDisplayP95Ms",
    "fileSwitchDuringStaleCanvasClearedP95Ms",
    "fileSwitchDuringCanvasNonBlankP95Ms",
    "fileSwitchDuringChartDrawnP95Ms",
    "fileSwitchDuringRenderSignatureLagP95Ms",
    "maxUsedJsHeapMb",
    "plotDisplayCacheMaxSize",
    "plotDisplayCacheHardLimit",
    "plotDisplayCacheTrimmedBackground",
    "plotDisplayCacheTrimmedProtected",
    "plotDisplayCacheTrimmedVisible",
    "plotDisplayCacheTrimmedHover",
    "plotDisplayCacheTrimmedActive",
    "plotDisplayBatchPrewarmQueuedCount",
    "plotMainDrawP95Ms",
    "workbenchSelectionRefreshP95Ms",
    "plotInspectorPrefetchFired",
    "meanCpuPercent",
  ];
  const width = 980;
  const chartHeight = 118;
  const gap = 28;
  const left = 170;
  const right = 32;
  const top = 46;
  const height = top + chartKeys.length * (chartHeight + gap) + 30;
  const xFor = index => left + (scenarioRows.length <= 1
    ? 0
    : index * ((width - left - right) / (scenarioRows.length - 1)));
  const escapeXml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const charts = chartKeys.map((key, chartIndex) => {
    const yTop = top + chartIndex * (chartHeight + gap);
    const values = scenarioRows.map(row => readNumber(row.metrics?.[key]));
    const numericValues = values.filter(value => value != null);
    const minValue = numericValues.length ? Math.min(...numericValues) : 0;
    const maxValue = numericValues.length ? Math.max(...numericValues) : 1;
    const range = maxValue === minValue ? Math.max(1, maxValue || 1) : maxValue - minValue;
    const yFor = value => yTop + chartHeight - ((value - minValue) / range) * chartHeight;
    const points = values
      .map((value, index) => value == null ? null : `${roundMetric(xFor(index))},${roundMetric(yFor(value))}`)
      .filter(Boolean)
      .join(" ");
    const circles = values.map((value, index) => value == null
      ? ""
      : `<circle cx="${roundMetric(xFor(index))}" cy="${roundMetric(yFor(value))}" r="3.5"><title>${escapeXml(scenarioRows[index].variant ?? scenarioRows[index].runId)}: ${value}</title></circle>`
    ).join("");
    return `
      <g>
        <text x="24" y="${yTop + 18}" class="metric">${escapeXml(key)}</text>
        <text x="24" y="${yTop + 40}" class="range">${roundMetric(minValue)} - ${roundMetric(maxValue)}</text>
        <line x1="${left}" x2="${width - right}" y1="${yTop + chartHeight}" y2="${yTop + chartHeight}" class="axis"/>
        <line x1="${left}" x2="${left}" y1="${yTop}" y2="${yTop + chartHeight}" class="axis"/>
        <polyline points="${points}" class="line"/>
        ${circles}
      </g>
    `;
  }).join("\n");
  const labels = scenarioRows.map((row, index) => `
    <text x="${roundMetric(xFor(index))}" y="${height - 10}" class="tick" text-anchor="middle">${escapeXml(row.variant ?? String(index + 1))}</text>
  `).join("");
  writeFileSync(svgPath, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #202124; }
    .title { font-size: 16px; font-weight: 650; }
    .metric { font-weight: 650; }
    .range, .tick { fill: #5f6368; }
    .axis { stroke: #dadce0; stroke-width: 1; }
    .line { fill: none; stroke: #1a73e8; stroke-width: 2.5; }
    circle { fill: #1a73e8; stroke: white; stroke-width: 1.5; }
  </style>
  <text x="24" y="24" class="title">${escapeXml(scenarioKey)} optimization history</text>
  ${charts}
  ${labels}
</svg>
`);
};
