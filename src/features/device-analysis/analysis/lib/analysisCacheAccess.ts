import {
  canUseCachedBaseCurrent,
  isCompatibleAnalysisCache,
} from "./analysisCachePolicy.ts";

export type CachedAnalysisSeriesResult = {
  baseCurrent?: unknown;
  gm?: unknown;
  ss?: unknown;
  ssFitAuto?: unknown;
};

type SeriesLike = {
  id?: unknown;
};

type FileLike = {
  analysisCache?: unknown;
};

export const getCachedAnalysisSeriesResult = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): CachedAnalysisSeriesResult | null => {
  if (!isCompatibleAnalysisCache((file as any)?.analysisCache)) return null;
  const seriesId = String(series?.id ?? "");
  if (!seriesId) return null;

  const resultBySeriesId = (file as any)?.analysisCache?.series;
  if (
    !resultBySeriesId ||
    typeof resultBySeriesId !== "object" ||
    Array.isArray(resultBySeriesId)
  ) {
    return null;
  }

  const result = resultBySeriesId[seriesId];
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as CachedAnalysisSeriesResult)
    : null;
};

export const getCachedDerivativePoints = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): any[] | null => {
  const cached = getCachedAnalysisSeriesResult(file, series);
  return Array.isArray(cached?.gm) ? (cached.gm as any[]) : null;
};

export const getCachedSsFitAuto = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): unknown | null => {
  const cached = getCachedAnalysisSeriesResult(file, series);
  return cached?.ssFitAuto && typeof cached.ssFitAuto === "object"
    ? cached.ssFitAuto
    : null;
};

export const getCachedBaseCurrent = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
  supportsSs: boolean,
): unknown | null => {
  const cached = getCachedAnalysisSeriesResult(file, series);
  return canUseCachedBaseCurrent(cached?.baseCurrent, supportsSs)
    ? cached?.baseCurrent
    : null;
};
