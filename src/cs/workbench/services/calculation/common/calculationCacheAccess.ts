/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import type {
  CacheKey,
  CalculationCacheEntry,
} from "src/cs/workbench/services/session/common/sessionModel";

import {
  canUseCachedBaseCurrent,
  isCompatibleCalculationCachePayload,
} from "./calculationCachePolicy.ts";

// TODO(conductor-architecture): Migration bridge.
// Prefer canonical FileRecord.calculationCache; keep analysisCache reads only for
// legacy compatibility until legacy session payloads are removed.
export type CachedCalculationSeriesResult = {
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
  calculationCache?: unknown;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const cacheKey = (
  kind: CalculationCacheEntry["kind"],
  seriesId: string,
): CacheKey => `${kind}:${seriesId}` as CacheKey;

const getCanonicalCacheEntryValue = (
  file: FileLike | null | undefined,
  kind: CalculationCacheEntry["kind"],
  seriesId: string,
): unknown => {
  const cache = file?.calculationCache;
  if (!isObjectRecord(cache) || !isObjectRecord(cache.entriesByKey)) {
    return undefined;
  }

  const entry = cache.entriesByKey[cacheKey(kind, seriesId)];
  return isObjectRecord(entry) && entry.kind === kind ? entry.value : undefined;
};

const getLegacyCalculationSeriesResult = (
  file: FileLike | null | undefined,
  seriesId: string,
): CachedCalculationSeriesResult | null => {
  const payload = isObjectRecord(file) ? file["analysisCache"] : undefined;
  if (!isCompatibleCalculationCachePayload(payload) || !isObjectRecord(payload)) {
    return null;
  }

  const resultBySeriesId = payload.series;
  if (!isObjectRecord(resultBySeriesId)) {
    return null;
  }

  const result = resultBySeriesId[seriesId];
  if (!isObjectRecord(result)) {
    return null;
  }

  return {
    baseCurrent: result.baseCurrent,
    gm: result.gm,
    ss: result.ss,
    ssFitAuto: result.ssFitAuto,
  };
};

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
  if (
    cached.baseCurrent !== undefined ||
    cached.gm !== undefined ||
    cached.ss !== undefined ||
    cached.ssFitAuto !== undefined
  ) {
    return cached;
  }

  return getLegacyCalculationSeriesResult(file, seriesId);
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
