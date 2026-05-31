import {
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
} from "../common/analysisMath";
import { buildPoints } from "src/cs/workbench/contrib/chart/browser/chartViewModel";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "../common/metrics";
import {
  canUseCachedBaseCurrent,
  isCompatibleAnalysisCache,
} from "../common/analysisCachePolicy";
import {
  getPerfNow,
  logPerf,
  startPerf,
  summarizeProcessedFile,
} from "src/cs/workbench/common/deviceAnalysis/perf";
import { BrowserDiagnosticsService } from "src/cs/workbench/contrib/diagnostics/browser/diagnosticsService";

type CachePrefetchHandle =
  | {
      type: "idle";
      id: number;
    }
  | {
      type: "timeout";
      id: ReturnType<typeof setTimeout>;
    };

const applyRustAnalysisResultsToCache = ({
  cache,
  analysisCache,
  seriesList,
  stageCounts,
  supportsSs,
}: {
  cache: any;
  analysisCache: any;
  seriesList: any[];
  stageCounts: Record<string, number>;
  supportsSs: boolean;
}) => {
  if (!isCompatibleAnalysisCache(analysisCache)) return false;

  const resultBySeriesId = analysisCache?.series;
  if (!resultBySeriesId || typeof resultBySeriesId !== "object") return false;

  let applied = false;
  for (const series of seriesList) {
    if (!series?.id) continue;
    const result = resultBySeriesId?.[series.id];
    if (Array.isArray(result?.gm) && !cache.gmByMode.x.has(series.id)) {
      cache.gmByMode.x.set(series.id, result.gm);
      stageCounts.gm += 1;
      applied = true;
    }
    if (
      supportsSs &&
      Array.isArray(result?.ss) &&
      !cache.ssDiagnosticsBySeriesId.has(series.id)
    ) {
      cache.ssDiagnosticsBySeriesId.set(series.id, result.ss);
      stageCounts.ss += 1;
      applied = true;
    }
    if (
      supportsSs &&
      result?.ssFitAuto &&
      !cache.ssAutoBySeriesId.has(series.id)
    ) {
      cache.ssAutoBySeriesId.set(series.id, result.ssFitAuto);
      stageCounts.ssAuto += 1;
      applied = true;
    }
    if (
      canUseCachedBaseCurrent(result?.baseCurrent, supportsSs) &&
      !cache.baseMetricsBySeriesId.has(series.id)
    ) {
      cache.baseMetricsBySeriesId.set(series.id, result.baseCurrent);
      stageCounts.baseCurrent += 1;
      applied = true;
    }
  }
  return applied;
};

const getCachedSeriesPoints = (file: any, cache: any, series: any) => {
  const existing = cache.pointsBySeriesId.get(series.id);
  if (existing) return { built: false, points: existing };

  const xArr = file?.xGroups?.[series.groupIndex];
  const points = buildPoints(xArr, series.y);
  cache.pointsBySeriesId.set(series.id, points);
  return { built: true, points };
};

const createFileCacheEntry = (sourceFile: any = null) => ({
  sourceFile,
  sourceSeries: sourceFile?.series ?? null,
  sourceXGroups: sourceFile?.xGroups ?? null,
  analysisByConfigKey: new Map(),
  plotSeriesByConfigKey: new Map(),
  pointsBySeriesId: new Map(),
  gmByMode: { x: new Map(), legend: new Map() },
  gmLegendComputed: false,
  ssDiagnosticsBySeriesId: new Map(),
  ssAutoBySeriesId: new Map(),
  baseMetricsBySeriesId: new Map(),
  gmMetricsByMode: { x: new Map(), legend: new Map() },
  ssManualFitBySeriesId: new Map(),
  jByAreaKey: new Map(),
  minMaxByKey: new Map(),
});

export const createAnalysisFileCache = ({
  effectiveActiveFileId,
  processedData,
}: {
  effectiveActiveFileId: unknown;
  processedData: any[];
}) => {
  const diagnosticsService = new BrowserDiagnosticsService();
  const fileAnalysisCache = new Map();
  const renderSeriesCacheRef = { current: new WeakMap<object, Map<string, any[]>>() };
  let cachePrefetchJobId = 0;
  let cachePrefetchHandle: CachePrefetchHandle | null = null;

  const keep = new Set(
    (Array.isArray(processedData) ? processedData : [])
      .map((file: any) => file?.fileId)
      .filter(Boolean),
  );
  for (const fileId of Array.from(fileAnalysisCache.keys())) {
    if (!keep.has(fileId)) fileAnalysisCache.delete(fileId);
  }

  const getFileCache = (fileId: any, sourceFile: any = null) => {
    if (!fileId) return null;

    diagnosticsService.touchAnalysisCacheSourceFile(sourceFile);
    let entry = fileAnalysisCache.get(fileId);
    const shouldResetForSource =
      sourceFile &&
      entry &&
      (entry.sourceFile !== sourceFile ||
        entry.sourceSeries !== sourceFile?.series ||
        entry.sourceXGroups !== sourceFile?.xGroups);
    if (!entry || shouldResetForSource) {
      entry = createFileCacheEntry(sourceFile);
      fileAnalysisCache.set(fileId, entry);
    }

    return entry;
  };

  if (effectiveActiveFileId && Array.isArray(processedData)) {
    const activeFile = processedData.find(
      (file: any) => file?.fileId === effectiveActiveFileId,
    );
    diagnosticsService.touchAnalysisCacheSourceFile(activeFile);
  }

  const cancelScheduled = () => {
    const handle = cachePrefetchHandle;
    if (!handle || typeof window === "undefined") return;
    if (
      handle.type === "idle" &&
      typeof window.cancelIdleCallback === "function"
    ) {
      window.cancelIdleCallback(handle.id);
    } else if (handle.type === "timeout") {
      clearTimeout(handle.id);
    }
    cachePrefetchHandle = null;
  };

  const precomputeFile = async (file: any) => {
    const fileId = file?.fileId;
    if (!fileId) return;
    diagnosticsService.touchAnalysisCacheSourceFile(file);
    const finishPerf = startPerf("analysis:prefetch-file", {
      ...summarizeProcessedFile(file),
      active: fileId === effectiveActiveFileId,
    });
    const stageMs = {
      baseCurrent: 0,
      gm: 0,
      points: 0,
      ss: 0,
      ssAuto: 0,
    };
    const stageCounts = {
      baseCurrent: 0,
      gm: 0,
      points: 0,
      ss: 0,
      ssAuto: 0,
    };
    const cache = getFileCache(fileId, file);
    if (!cache) return;
    const supportsSs = isTransferLikeFile(file);
    applyRustAnalysisResultsToCache({
      analysisCache: file?.analysisCache,
      cache,
      seriesList: Array.isArray(file?.series) ? file.series : [],
      stageCounts,
      supportsSs,
    });

    for (const series of file?.series ?? []) {
      if (!series?.id) continue;

      let points: any[] | null = null;
      const getPoints = (): any[] => {
        if (points !== null) return points;
        const stageStartedAt = getPerfNow();
        const result = getCachedSeriesPoints(file, cache, series);
        stageMs.points += getPerfNow() - stageStartedAt;
        if (result.built) stageCounts.points += 1;
        const nextPoints = result.points as any[];
        points = nextPoints;
        return nextPoints;
      };

      if (!cache.gmByMode.x.has(series.id)) {
        const stageStartedAt = getPerfNow();
        cache.gmByMode.x.set(series.id, computeCentralDerivative(getPoints()));
        stageMs.gm += getPerfNow() - stageStartedAt;
        stageCounts.gm += 1;
      }
      if (supportsSs && !cache.ssDiagnosticsBySeriesId.has(series.id)) {
        const stageStartedAt = getPerfNow();
        cache.ssDiagnosticsBySeriesId.set(
          series.id,
          computeSubthresholdSwing(getPoints()),
        );
        stageMs.ss += getPerfNow() - stageStartedAt;
        stageCounts.ss += 1;
      }
      if (!cache.baseMetricsBySeriesId.has(series.id)) {
        const stageStartedAt = getPerfNow();
        const baseCurrentMetrics = computeBaseCurrentMetrics({
          points: getPoints(),
          sourceFile: file,
        });
        cache.baseMetricsBySeriesId.set(series.id, baseCurrentMetrics);
        stageMs.baseCurrent += getPerfNow() - stageStartedAt;
        stageCounts.baseCurrent += 1;
      }
    }

    if (supportsSs) {
      for (const series of file?.series ?? []) {
        if (!series?.id || cache.ssAutoBySeriesId.has(series.id)) continue;
        const stageStartedAt = getPerfNow();
        const pointsResult = getCachedSeriesPoints(file, cache, series);
        stageMs.points += getPerfNow() - stageStartedAt;
        if (pointsResult.built) stageCounts.points += 1;

        const ssAutoStartedAt = getPerfNow();
        cache.ssAutoBySeriesId.set(
          series.id,
          computeSubthresholdSwingFitAuto(pointsResult.points),
        );
        stageMs.ssAuto += getPerfNow() - ssAutoStartedAt;
        stageCounts.ssAuto += 1;
      }
    }

    finishPerf({
      stageCounts,
      stageMs,
    });
    logPerf("analysis:prefetch-breakdown", {
      ...summarizeProcessedFile(file),
      stageCounts,
      stageMs,
    });
  };

  if (typeof window !== "undefined") {
    cachePrefetchJobId += 1;
    const jobId = cachePrefetchJobId;
    cancelScheduled();

    const candidates = (Array.isArray(processedData) ? processedData : []).filter(
      (file: any) =>
        typeof file?.fileId === "string" &&
        Array.isArray(file?.series) &&
        file.series.length > 0,
    );
    const queue = candidates.slice();
    if (effectiveActiveFileId) {
      const idx = queue.findIndex(
        (file: any) => file.fileId === effectiveActiveFileId,
      );
      if (idx > 0) {
        const [active] = queue.splice(idx, 1);
        queue.unshift(active);
      }
    }

    const run = async (_deadline?: IdleDeadline) => {
      if (cachePrefetchJobId !== jobId) return;

      const next = queue.shift();
      if (next) await precomputeFile(next);
      if (cachePrefetchJobId !== jobId) return;

      if (!queue.length) {
        cachePrefetchHandle = null;
        return;
      }

      schedule();
    };

    const schedule = () => {
      if (cachePrefetchJobId !== jobId || !queue.length) return;

      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(run, { timeout: 300 });
        cachePrefetchHandle = { type: "idle", id };
        return;
      }

      const id = setTimeout(() => run(), 0);
      cachePrefetchHandle = { type: "timeout", id };
    };

    schedule();
  }

  return {
    getFileCache,
    renderSeriesCacheRef,
  };
};

export const useAnalysisFileCache = createAnalysisFileCache;
