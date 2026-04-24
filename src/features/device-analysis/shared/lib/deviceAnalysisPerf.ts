export const DEVICE_ANALYSIS_PERF_STORAGE_KEY = "conductor.deviceAnalysisPerf";

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

export const isDeviceAnalysisPerfEnabled = (): boolean => {
  if (import.meta.env.DEV) return true;
  if (isTruthyFlag(import.meta.env.VITE_DEVICE_ANALYSIS_PERF)) return true;

  try {
    const storage = globalThis.localStorage;
    return isTruthyFlag(storage?.getItem(DEVICE_ANALYSIS_PERF_STORAGE_KEY));
  } catch {
    return false;
  }
};

export const getDeviceAnalysisPerfNow = (): number => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
};

export const logDeviceAnalysisPerf = (
  stage: string,
  meta: PerfMeta = {},
  options: PerfLogOptions = {},
): void => {
  if (!options.force && !isDeviceAnalysisPerfEnabled()) return;

  const duration = Number(meta.durationMs);
  const durationText = Number.isFinite(duration)
    ? ` ${Math.round(duration)}ms`
    : "";

  console.info(`[perf][device-analysis] ${stage}${durationText}`, meta);
};

export const startDeviceAnalysisPerf = (
  stage: string,
  meta: PerfMeta = {},
  options: PerfLogOptions = {},
): ((endMeta?: PerfMeta) => void) => {
  const enabled = options.force || isDeviceAnalysisPerfEnabled();
  if (!enabled) return () => {};

  const startedAt = getDeviceAnalysisPerfNow();
  return (endMeta: PerfMeta = {}) => {
    logDeviceAnalysisPerf(
      stage,
      {
        ...meta,
        ...endMeta,
        durationMs: getDeviceAnalysisPerfNow() - startedAt,
      },
      { force: true },
    );
  };
};

export const summarizeDeviceAnalysisProcessedFile = (file: any): PerfMeta => {
  const series = Array.isArray(file?.series) ? file.series : [];
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const sampledPoints = Number(file?.x?.sampledPoints);

  return {
    fileId: file?.fileId ?? null,
    fileName: file?.fileName ?? null,
    groups: xGroups.length,
    sampledPoints: Number.isFinite(sampledPoints) ? sampledPoints : null,
    seriesCount: series.length,
  };
};
