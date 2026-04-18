import { useCallback, useEffect, useRef } from "react";
import {
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
} from "./lib/analysisMath";
import { buildPoints } from "./lib/analysisChartsUtils";
import { computeBaseCurrentMetrics } from "./lib/deviceAnalysisMetrics";

type CachePrefetchHandle =
  | {
      type: "idle";
      id: number;
    }
  | {
      type: "timeout";
      id: ReturnType<typeof setTimeout>;
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
      ssIdWindowFitByKey: new Map(),
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

    const precomputeFile = (file: any) => {
      const fileId = file?.fileId;
      if (!fileId) return;
      const cache = getFileCache(fileId, file);
      if (!cache) return;

      for (const series of file?.series ?? []) {
        if (!series?.id || cache.pointsBySeriesId.has(series.id)) continue;
        const xArr = file?.xGroups?.[series.groupIndex];
        cache.pointsBySeriesId.set(series.id, buildPoints(xArr, series.y));
      }

      for (const series of file?.series ?? []) {
        if (!series?.id) continue;

        const points = cache.pointsBySeriesId.get(series.id) ?? [];
        if (!cache.gmByMode.x.has(series.id)) {
          cache.gmByMode.x.set(series.id, computeCentralDerivative(points));
        }
        if (!cache.ssDiagnosticsBySeriesId.has(series.id)) {
          cache.ssDiagnosticsBySeriesId.set(
            series.id,
            computeSubthresholdSwing(points),
          );
        }
        if (!cache.ssAutoBySeriesId.has(series.id)) {
          cache.ssAutoBySeriesId.set(
            series.id,
            computeSubthresholdSwingFitAuto(points),
          );
        }
        if (!cache.baseMetricsBySeriesId.has(series.id)) {
          const baseCurrentMetrics = computeBaseCurrentMetrics({
            points,
            sourceFile: file,
          });
          const ssDiagnostics = cache.ssDiagnosticsBySeriesId.get(series.id) ?? [];
          let legacySsMin = Infinity;
          let legacyXAtSsMin = null;
          for (const point of ssDiagnostics) {
            const x = point?.x;
            const y = point?.y;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (y > 0 && y < legacySsMin) {
              legacySsMin = y;
              legacyXAtSsMin = x;
            }
          }

          cache.baseMetricsBySeriesId.set(series.id, {
            ...baseCurrentMetrics,
            legacySsMin: Number.isFinite(legacySsMin) ? legacySsMin : null,
            legacyXAtSsMin,
          });
        }
      }
    };

    const run = (_deadline?: IdleDeadline) => {
      if (cachePrefetchJobIdRef.current !== jobId) return;

      const next = queue.shift();
      if (next) precomputeFile(next);

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
