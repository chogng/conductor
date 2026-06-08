export const CACHE_VERSION = 2;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isCompatibleCalculationCachePayload = (payload: unknown): boolean =>
  isObjectRecord(payload) && Number(payload.version) === CACHE_VERSION;

export const hasSlidingCurrentWindowCandidates = (baseCurrent: unknown): boolean => {
  if (!isObjectRecord(baseCurrent)) {
    return false;
  }

  const windows = baseCurrent.candidateWindows;
  if (!Array.isArray(windows)) {
    return false;
  }

  const keys = new Set(
    windows
      .filter(isObjectRecord)
      .map((window) => String(window.key ?? "")),
  );
  return keys.has("minCurrent") && keys.has("maxCurrent");
};

export const canUseCachedBaseCurrent = (
  baseCurrent: unknown,
  supportsSs: boolean,
): boolean => {
  if (!isObjectRecord(baseCurrent)) {
    return false;
  }
  if (!supportsSs) {
    return true;
  }

  return hasSlidingCurrentWindowCandidates(baseCurrent);
};
