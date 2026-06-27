import { getPerformanceNow } from "src/cs/base/common/performance";

const PERF_STORAGE_KEY = "conductor.perf";
const PERF_ENTRY_LIMIT = 5_000;

type PerfMeta = Record<string, unknown>;

type PerfLogOptions = {
  force?: boolean;
  silent?: boolean;
};

export type PerfEntry = {
  readonly stage: string;
  readonly timestamp: number;
  readonly meta: PerfMeta;
};

export type PerfReport = {
  readonly generatedAt: number;
  readonly entries: readonly PerfEntry[];
  readonly stages: Record<string, {
    readonly count: number;
    readonly maxDurationMs: number | null;
    readonly totalDurationMs: number;
  }>;
};

type AnalysisPerfApi = {
  clear(): void;
  getEntries(): readonly PerfEntry[];
  getReport(): PerfReport;
};

const perfEntries: PerfEntry[] = [];

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
  return getPerformanceNow();
};

export const logPerf = (
  stage: string,
  meta: PerfMeta = {},
  options: PerfLogOptions = {},
): void => {
  if (!options.force && !isPerfEnabled()) return;

  recordPerfEntry(stage, meta);

  if (options.silent) {
    return;
  }

  const duration = Number(meta.durationMs);
  const durationText = Number.isFinite(duration)
    ? ` ${Math.round(duration)}ms`
    : "";

  console.info(`[perf][analysis] ${stage}${durationText}`, meta);
};

export const getPerfEntries = (): readonly PerfEntry[] =>
  perfEntries.map(entry => ({
    meta: { ...entry.meta },
    stage: entry.stage,
    timestamp: entry.timestamp,
  }));

export const clearPerfEntries = (): void => {
  perfEntries.length = 0;
};

export const getPerfReport = (): PerfReport => {
  const stages: PerfReport["stages"] = {};
  for (const entry of perfEntries) {
    const duration = Number(entry.meta.durationMs);
    const current = stages[entry.stage] ?? {
      count: 0,
      maxDurationMs: null,
      totalDurationMs: 0,
    };
    stages[entry.stage] = {
      count: current.count + 1,
      maxDurationMs: Number.isFinite(duration)
        ? Math.max(current.maxDurationMs ?? 0, duration)
        : current.maxDurationMs,
      totalDurationMs: Number.isFinite(duration)
        ? current.totalDurationMs + duration
        : current.totalDurationMs,
    };
  }

  return {
    entries: getPerfEntries(),
    generatedAt: Date.now(),
    stages,
  };
};

const recordPerfEntry = (stage: string, meta: PerfMeta): void => {
  perfEntries.push({
    meta: { ...meta },
    stage,
    timestamp: Date.now(),
  });
  if (perfEntries.length > PERF_ENTRY_LIMIT) {
    perfEntries.splice(0, perfEntries.length - PERF_ENTRY_LIMIT);
  }
  exposePerfApi();
};

const exposePerfApi = (): void => {
  const target = globalThis as typeof globalThis & {
    conductorAnalysisPerf?: AnalysisPerfApi;
  };
  target.conductorAnalysisPerf ??= {
    clear: clearPerfEntries,
    getEntries: getPerfEntries,
    getReport: getPerfReport,
  };
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
      { force: true, silent: options.silent },
    );
  };
};

const countArrayLength = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (
    ArrayBuffer.isView(value) &&
    typeof (value as unknown as { readonly length?: unknown }).length === "number"
  ) {
    return (value as unknown as { readonly length: number }).length;
  }

  return 0;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readText = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text || null;
};

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

const summarizeRetiredCalculationCachePayload = (
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

  return summarizeRetiredCalculationCachePayload(file["analysisCache"]) ??
    createEmptyCalculationCacheSummary();
};

export const summarizeProcessedFile = (file: unknown): PerfMeta => {
  const record = isObjectRecord(file) ? file : {};
  const series = Array.isArray(record.series) ? record.series : [];
  const xGroups = Array.isArray(record.xGroups) ? record.xGroups : [];
  const xRecord = isObjectRecord(record.x) ? record.x : {};
  const sampledPoints = Number(xRecord.sampledPoints);
  const seriesPointCount = series.reduce((count, item) => {
    if (!isObjectRecord(item)) return count;
    return count + countArrayLength(item.y);
  }, 0);
  const xPointCount = xGroups.reduce((count, group) => count + countArrayLength(group), 0);

  return {
    ...summarizeCalculationCache(file),
    curveType: readText(record.curveType),
    fileId: record.fileId ?? null,
    fileName: record.fileName ?? null,
    groups: xGroups.length,
    sampledPoints: Number.isFinite(sampledPoints) ? sampledPoints : null,
    seriesCount: series.length,
    seriesPointCount,
    xAxisRole: readText(record.xAxisRole),
    xPointCount,
  };
};
