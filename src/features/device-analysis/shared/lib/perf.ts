export const DEVICE_ANALYSIS_PERF_STORAGE_KEY = "conductor.perf";

type PerfMeta = Record<string, unknown>;

type PerfLogOptions = {
  force?: boolean;
};

const isTruthyFlag = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

export const isPerfEnabled = (): boolean => {
  if (import.meta.env.DEV) return true;
  if (isTruthyFlag(import.meta.env.VITE_DEVICE_ANALYSIS_PERF)) return true;

  try {
    const storage = globalThis.localStorage;
    return isTruthyFlag(storage?.getItem(DEVICE_ANALYSIS_PERF_STORAGE_KEY));
  } catch {
    return false;
  }
};

export const getPerfNow = (): number => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
};

export const logPerf = (
  stage: string,
  meta: PerfMeta = {},
  options: PerfLogOptions = {},
): void => {
  if (!options.force && !isPerfEnabled()) return;

  const duration = Number(meta.durationMs);
  const durationText = Number.isFinite(duration)
    ? ` ${Math.round(duration)}ms`
    : "";

  console.info(`[perf][device-analysis] ${stage}${durationText}`, meta);
};

export const startPerf = (
  stage: string,
  meta: PerfMeta = {},
  options: PerfLogOptions = {},
): ((endMeta?: PerfMeta) => void) => {
  const enabled = options.force || isPerfEnabled();
  if (!enabled) return () => {};

  const startedAt = getPerfNow();
  return (endMeta: PerfMeta = {}) => {
    logPerf(
      stage,
      {
        ...meta,
        ...endMeta,
        durationMs: getPerfNow() - startedAt,
      },
      { force: true },
    );
  };
};

const countArrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

const summarizeAnalysisCache = (file: any): PerfMeta => {
  const rawSeries = file?.analysisCache?.series;
  if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) {
    return {
      analysisCacheEstimatedBytes: 0,
      analysisCacheGmPoints: 0,
      analysisCacheSeriesCount: 0,
      analysisCacheSsPoints: 0,
    };
  }

  let gmPoints = 0;
  let seriesCount = 0;
  let ssFitAutoCount = 0;
  let ssPoints = 0;
  let baseCurrentCount = 0;

  for (const result of Object.values(rawSeries)) {
    if (!result || typeof result !== "object") continue;
    seriesCount += 1;
    const seriesResult = result as {
      baseCurrent?: unknown;
      gm?: unknown;
      ss?: unknown;
      ssFitAuto?: unknown;
    };
    gmPoints += countArrayLength(seriesResult.gm);
    ssPoints += countArrayLength(seriesResult.ss);
    if (seriesResult.ssFitAuto) ssFitAutoCount += 1;
    if (seriesResult.baseCurrent) baseCurrentCount += 1;
  }

  const curvePointCount = gmPoints + ssPoints;
  const estimatedBytes =
    // gm/ss points are small point objects with up to four numeric fields.
    curvePointCount * 4 * 8 +
    // ssFitAuto and baseCurrent are compact objects; this is intentionally approximate.
    (ssFitAutoCount + baseCurrentCount) * 512;

  return {
    analysisCacheBaseCurrentCount: baseCurrentCount,
    analysisCacheEstimatedBytes: estimatedBytes,
    analysisCacheGmPoints: gmPoints,
    analysisCacheSeriesCount: seriesCount,
    analysisCacheSsFitAutoCount: ssFitAutoCount,
    analysisCacheSsPoints: ssPoints,
  };
};

export const summarizeProcessedFile = (file: any): PerfMeta => {
  const series = Array.isArray(file?.series) ? file.series : [];
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const sampledPoints = Number(file?.x?.sampledPoints);

  return {
    ...summarizeAnalysisCache(file),
    fileId: file?.fileId ?? null,
    fileName: file?.fileName ?? null,
    groups: xGroups.length,
    sampledPoints: Number.isFinite(sampledPoints) ? sampledPoints : null,
    seriesCount: series.length,
  };
};
