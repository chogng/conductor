import { useCallback, useEffect, useRef } from "react";
import {
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
} from "./lib/analysisMath";
import { buildPoints } from "./lib/analysisChartsUtils";
import { computeBaseCurrentMetrics } from "./lib/deviceAnalysisMetrics";
import {
  getDeviceAnalysisPerfNow,
  logDeviceAnalysisPerf,
  startDeviceAnalysisPerf,
  summarizeDeviceAnalysisProcessedFile,
} from "../shared/lib/deviceAnalysisPerf";

type CachePrefetchHandle =
  | {
      type: "idle";
      id: number;
    }
  | {
      type: "timeout";
      id: ReturnType<typeof setTimeout>;
    };

const buildRustSsAutoSeriesPayload = (file: any, cache: any) => {
  const payload = [];
  for (const series of file?.series ?? []) {
    if (!series?.id || cache.ssAutoBySeriesId.has(series.id)) continue;
    const points = cache.pointsBySeriesId.get(series.id) ?? [];
    const x = [];
    const y = [];
    for (const point of points) {
      const xv = point?.x;
      const yv = point?.y;
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      x.push(xv);
      y.push(yv);
    }
    if (x.length >= 3) {
      payload.push({
        id: series.id,
        x,
        y,
      });
    }
  }
  return payload;
};

export const useAnalysisFileCache = ({
  effectiveActiveFileId,
  processedData,
}: {
  effectiveActiveFileId: unknown;
  processedData: any[];
}) => {
  const fileAnalysisCacheRef = useRef(new Map());
  const renderSeriesCacheRef = useRef(new WeakMap<object, Map<number, any[]>>());
  const cachePrefetchJobIdRef = useRef(0);
  const cachePrefetchHandleRef = useRef<CachePrefetchHandle | null>(null);

  const createFileCacheEntry = useCallback(
    (sourceFile: any = null) => ({
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
    }),
    [],
  );

  useEffect(() => {
    const store = fileAnalysisCacheRef.current;
    if (!store || store.size === 0) return;

    const keep = new Set(
      (Array.isArray(processedData) ? processedData : [])
        .map((file: any) => file?.fileId)
        .filter(Boolean),
    );
    for (const fileId of Array.from(store.keys())) {
      if (!keep.has(fileId)) store.delete(fileId);
    }

    for (const file of Array.isArray(processedData) ? processedData : []) {
      const fileId = file?.fileId;
      if (!fileId) continue;
      const cache = store.get(fileId);
      if (!cache) continue;
      if (
        cache.sourceFile === file &&
        cache.sourceSeries === file?.series &&
        cache.sourceXGroups === file?.xGroups
      ) {
        continue;
      }
      store.set(fileId, createFileCacheEntry(file));
    }
  }, [createFileCacheEntry, processedData]);

  const getFileCache = useCallback((fileId: any, sourceFile: any = null) => {
    if (!fileId) return null;

    const store = fileAnalysisCacheRef.current;
    let entry = store.get(fileId);
    const shouldResetForSource =
      sourceFile &&
      entry &&
      (entry.sourceFile !== sourceFile ||
        entry.sourceSeries !== sourceFile?.series ||
        entry.sourceXGroups !== sourceFile?.xGroups);
    if (!entry || shouldResetForSource) {
      entry = createFileCacheEntry(sourceFile);
      store.set(fileId, entry);
    }

    return entry;
  }, [createFileCacheEntry]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    cachePrefetchJobIdRef.current += 1;
    const jobId = cachePrefetchJobIdRef.current;

    const cancelScheduled = () => {
      const handle = cachePrefetchHandleRef.current;
      if (!handle) return;
      if (
        handle.type === "idle" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(handle.id);
      } else if (handle.type === "timeout") {
        clearTimeout(handle.id);
      }
      cachePrefetchHandleRef.current = null;
    };

    cancelScheduled();
    if (!processedData?.length) return cancelScheduled;

    const candidates = processedData.filter(
      (file: any) =>
        typeof file?.fileId === "string" &&
        Array.isArray(file?.series) &&
        file.series.length > 0,
    );
    if (!candidates.length) return cancelScheduled;

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

    const precomputeFile = async (file: any) => {
      const fileId = file?.fileId;
      if (!fileId) return;
      const finishPerf = startDeviceAnalysisPerf("analysis:prefetch-file", {
        ...summarizeDeviceAnalysisProcessedFile(file),
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

      let stageStartedAt = getDeviceAnalysisPerfNow();
      for (const series of file?.series ?? []) {
        if (!series?.id || cache.pointsBySeriesId.has(series.id)) continue;
        const xArr = file?.xGroups?.[series.groupIndex];
        cache.pointsBySeriesId.set(series.id, buildPoints(xArr, series.y));
        stageCounts.points += 1;
      }
      stageMs.points += getDeviceAnalysisPerfNow() - stageStartedAt;

      for (const series of file?.series ?? []) {
        if (!series?.id) continue;

        const points = cache.pointsBySeriesId.get(series.id) ?? [];
        if (!cache.gmByMode.x.has(series.id)) {
          stageStartedAt = getDeviceAnalysisPerfNow();
          cache.gmByMode.x.set(series.id, computeCentralDerivative(points));
          stageMs.gm += getDeviceAnalysisPerfNow() - stageStartedAt;
          stageCounts.gm += 1;
        }
        if (!cache.ssDiagnosticsBySeriesId.has(series.id)) {
          stageStartedAt = getDeviceAnalysisPerfNow();
          cache.ssDiagnosticsBySeriesId.set(
            series.id,
            computeSubthresholdSwing(points),
          );
          stageMs.ss += getDeviceAnalysisPerfNow() - stageStartedAt;
          stageCounts.ss += 1;
        }
        if (!cache.baseMetricsBySeriesId.has(series.id)) {
          stageStartedAt = getDeviceAnalysisPerfNow();
          const baseCurrentMetrics = computeBaseCurrentMetrics({
            points,
            sourceFile: file,
          });
          cache.baseMetricsBySeriesId.set(series.id, baseCurrentMetrics);
          stageMs.baseCurrent += getDeviceAnalysisPerfNow() - stageStartedAt;
          stageCounts.baseCurrent += 1;
        }
      }

      const rustSsAutoSeries = buildRustSsAutoSeriesPayload(file, cache);
      const rustAnalyze =
        globalThis.window?.desktopImport?.analyzeDeviceAnalysisSeriesBatchWithRust;
      if (rustAnalyze && rustSsAutoSeries.length) {
        stageStartedAt = getDeviceAnalysisPerfNow();
        try {
          const response: any = await rustAnalyze({
            fileId,
            series: rustSsAutoSeries,
          });
          const resultBySeriesId = response?.ok
            ? response?.result?.series
            : null;
          if (resultBySeriesId && typeof resultBySeriesId === "object") {
            for (const series of rustSsAutoSeries) {
              const ssFitAuto = resultBySeriesId?.[series.id]?.ssFitAuto;
              if (ssFitAuto && !cache.ssAutoBySeriesId.has(series.id)) {
                cache.ssAutoBySeriesId.set(series.id, ssFitAuto);
                stageCounts.ssAuto += 1;
              }
            }
          }
        } catch {
          // The TypeScript implementation below remains the compatibility fallback.
        } finally {
          stageMs.ssAuto += getDeviceAnalysisPerfNow() - stageStartedAt;
        }
      }

      stageStartedAt = getDeviceAnalysisPerfNow();
      for (const series of file?.series ?? []) {
        if (!series?.id || cache.ssAutoBySeriesId.has(series.id)) continue;
        cache.ssAutoBySeriesId.set(
          series.id,
          computeSubthresholdSwingFitAuto(
            cache.pointsBySeriesId.get(series.id) ?? [],
          ),
        );
        stageCounts.ssAuto += 1;
      }
      stageMs.ssAuto += getDeviceAnalysisPerfNow() - stageStartedAt;

      finishPerf({
        stageCounts,
        stageMs,
      });
      logDeviceAnalysisPerf("analysis:prefetch-breakdown", {
        ...summarizeDeviceAnalysisProcessedFile(file),
        stageCounts,
        stageMs,
      });
    };

    const run = async (_deadline?: IdleDeadline) => {
      if (cachePrefetchJobIdRef.current !== jobId) return;

      const next = queue.shift();
      if (next) await precomputeFile(next);
      if (cachePrefetchJobIdRef.current !== jobId) return;

      if (!queue.length) {
        cachePrefetchHandleRef.current = null;
        return;
      }

      schedule();
    };

    const schedule = () => {
      if (cachePrefetchJobIdRef.current !== jobId || !queue.length) return;

      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(run, { timeout: 300 });
        cachePrefetchHandleRef.current = { type: "idle", id };
        return;
      }

      const id = setTimeout(() => run(), 0);
      cachePrefetchHandleRef.current = { type: "timeout", id };
    };

    schedule();
    return cancelScheduled;
  }, [effectiveActiveFileId, getFileCache, processedData]);

  return {
    getFileCache,
    renderSeriesCacheRef,
  };
};
