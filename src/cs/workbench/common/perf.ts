const PERF_STORAGE_KEY = "conductor.perf";

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
  if (isTruthyFlag(import.meta.env?.VITE_ANALYSIS_PERF)) return true;

  try {
    const storage = globalThis.localStorage;
    return isTruthyFlag(storage?.getItem(PERF_STORAGE_KEY));
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

  console.info(`[perf][analysis] ${stage}${durationText}`, meta);
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

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const createEmptyCalculationCacheSummary = (): PerfMeta => ({
  calculationCacheEstimatedBytes: 0,
  calculationCacheGmPoints: 0,
  calculationCacheSeriesCount: 0,
  calculationCacheSsPoints: 0,
});

const createCalculationCacheSummary = ({
  baseCurrentCount,
  gmPoints,
  seriesCount,
  ssFitAutoCount,
  ssPoints,
}: {
  baseCurrentCount: number;
  gmPoints: number;
  seriesCount: number;
  ssFitAutoCount: number;
  ssPoints: number;
}): PerfMeta => {
  const curvePointCount = gmPoints + ssPoints;
  const estimatedBytes =
    // gm/local SS points are small point objects with up to four numeric fields.
    curvePointCount * 4 * 8 +
    // ssFitAuto and baseCurrent are compact objects; this is intentionally approximate.
    (ssFitAutoCount + baseCurrentCount) * 512;

  return {
    calculationCacheBaseCurrentCount: baseCurrentCount,
    calculationCacheEstimatedBytes: estimatedBytes,
    calculationCacheGmPoints: gmPoints,
    calculationCacheSeriesCount: seriesCount,
    calculationCacheSsFitAutoCount: ssFitAutoCount,
    calculationCacheSsPoints: ssPoints,
  };
};

const summarizeCanonicalCalculationCache = (
  cache: Record<string, unknown>,
): PerfMeta | null => {
  const entriesByKey = cache.entriesByKey;
  if (!isObjectRecord(entriesByKey)) {
    return null;
  }

  let gmPoints = 0;
  let ssFitAutoCount = 0;
  let ssPoints = 0;
  let baseCurrentCount = 0;
  const seriesIds = new Set<string>();

  for (const [key, value] of Object.entries(entriesByKey)) {
    if (!isObjectRecord(value)) {
      continue;
    }

    const kind = String(value.kind ?? "");
    const colonIndex = key.indexOf(":");
    if (colonIndex >= 0 && key.length > colonIndex + 1) {
      seriesIds.add(key.slice(colonIndex + 1));
    }

    if (kind === "baseCurrent") {
      baseCurrentCount += 1;
    } else if (kind === "gm") {
      gmPoints += countArrayLength(value.value);
    } else if (kind === "localSs") {
      ssPoints += countArrayLength(value.value);
    } else if (kind === "ssFitAuto") {
      ssFitAutoCount += 1;
    }
  }

  return createCalculationCacheSummary({
    baseCurrentCount,
    gmPoints,
    seriesCount: seriesIds.size,
    ssFitAutoCount,
    ssPoints,
  });
};

const summarizeLegacyCalculationCachePayload = (
  payload: unknown,
): PerfMeta | null => {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.series)) {
    return null;
  }

  const rawSeries = payload.series;
  let gmPoints = 0;
  let seriesCount = 0;
  let ssFitAutoCount = 0;
  let ssPoints = 0;
  let baseCurrentCount = 0;

  for (const result of Object.values(rawSeries)) {
    if (!isObjectRecord(result)) continue;
    seriesCount += 1;
    gmPoints += countArrayLength(result.gm);
    ssPoints += countArrayLength(result.ss);
    if (result.ssFitAuto) ssFitAutoCount += 1;
    if (result.baseCurrent) baseCurrentCount += 1;
  }

  return createCalculationCacheSummary({
    baseCurrentCount,
    gmPoints,
    seriesCount,
    ssFitAutoCount,
    ssPoints,
  });
};

const summarizeCalculationCache = (file: unknown): PerfMeta => {
  if (!isObjectRecord(file)) {
    return createEmptyCalculationCacheSummary();
  }

  if (isObjectRecord(file.calculationCache)) {
    const canonicalSummary = summarizeCanonicalCalculationCache(file.calculationCache);
    if (canonicalSummary) {
      return canonicalSummary;
    }
  }

  return summarizeLegacyCalculationCachePayload(file["analysisCache"]) ??
    createEmptyCalculationCacheSummary();
};

export const summarizeProcessedFile = (file: unknown): PerfMeta => {
  const record = isObjectRecord(file) ? file : {};
  const series = Array.isArray(record.series) ? record.series : [];
  const xGroups = Array.isArray(record.xGroups) ? record.xGroups : [];
  const xRecord = isObjectRecord(record.x) ? record.x : {};
  const sampledPoints = Number(xRecord.sampledPoints);

  return {
    ...summarizeCalculationCache(file),
    fileId: record.fileId ?? null,
    fileName: record.fileName ?? null,
    groups: xGroups.length,
    sampledPoints: Number.isFinite(sampledPoints) ? sampledPoints : null,
    seriesCount: series.length,
  };
};
