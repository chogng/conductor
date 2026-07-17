/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { canUseCachedBaseCurrent } from "./calculationCachePolicy.ts";

export type CachedCalculationSeriesResult = {
  baseCurrent?: unknown;
  gm?: unknown;
  ss?: unknown;
  ssFitAuto?: unknown;
};

type CalculationCacheKind = "baseCurrent" | "gm" | "localSs" | "ssFitAuto";

type CalculationCacheKey = `${CalculationCacheKind}:${string}`;

type CalculationCacheEntryLike = {
  kind?: unknown;
  value?: unknown;
};

type SeriesLike = {
  id?: unknown;
};

type FileLike = {
  calculationCache?: unknown;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const cacheKey = (
  kind: CalculationCacheKind,
  seriesId: string,
): CalculationCacheKey => `${kind}:${seriesId}`;

const getCanonicalCacheEntryValue = (
  file: FileLike | null | undefined,
  kind: CalculationCacheKind,
  seriesId: string,
): unknown => {
  const cache = file?.calculationCache;
  if (!isObjectRecord(cache) || !isObjectRecord(cache.entriesByKey)) {
    return undefined;
  }

  const entry = cache.entriesByKey[cacheKey(kind, seriesId)];
  return isCalculationCacheEntryLike(entry) && entry.kind === kind ? entry.value : undefined;
};

const isCalculationCacheEntryLike = (entry: unknown): entry is CalculationCacheEntryLike =>
  isObjectRecord(entry);

export const getCachedCalculationSeriesResult = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): CachedCalculationSeriesResult | null => {
  const seriesId = String(series?.id ?? "").trim();
  if (!seriesId) {
    return null;
  }

  const cached: CachedCalculationSeriesResult = {
    baseCurrent: getCanonicalCacheEntryValue(file, "baseCurrent", seriesId),
    gm: getCanonicalCacheEntryValue(file, "gm", seriesId),
    ss: getCanonicalCacheEntryValue(file, "localSs", seriesId),
    ssFitAuto: getCanonicalCacheEntryValue(file, "ssFitAuto", seriesId),
  };
  return (
    cached.baseCurrent !== undefined ||
    cached.gm !== undefined ||
    cached.ss !== undefined ||
    cached.ssFitAuto !== undefined
  )
    ? cached
    : null;
};

export const getCachedDerivativePoints = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): unknown[] | null => {
  const cached = getCachedCalculationSeriesResult(file, series);
  return Array.isArray(cached?.gm) ? cached.gm : null;
};

export const getCachedSsFitAuto = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
): unknown | null => {
  const cached = getCachedCalculationSeriesResult(file, series);
  return isObjectRecord(cached?.ssFitAuto) ? cached.ssFitAuto : null;
};

export const getCachedBaseCurrent = (
  file: FileLike | null | undefined,
  series: SeriesLike | null | undefined,
  supportsSs: boolean,
): unknown | null => {
  const cached = getCachedCalculationSeriesResult(file, series);
  return canUseCachedBaseCurrent(cached?.baseCurrent, supportsSs)
    ? cached?.baseCurrent
    : null;
};
