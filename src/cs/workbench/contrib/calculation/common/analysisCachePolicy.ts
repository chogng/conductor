export const CACHE_VERSION = 2;

export const isCompatibleAnalysisCache = (analysisCache: any): boolean =>
  Number(analysisCache?.version) === CACHE_VERSION;

export const hasSlidingCurrentWindowCandidates = (baseCurrent: any): boolean => {
  const windows = baseCurrent?.candidateWindows;
  if (!Array.isArray(windows)) return false;

  const keys = new Set(
    windows.map((window: any) => String(window?.key ?? "")),
  );
  return keys.has("minCurrent") && keys.has("maxCurrent");
};

export const canUseCachedBaseCurrent = (
  baseCurrent: any,
  supportsSs: boolean,
): boolean => {
  if (!baseCurrent || typeof baseCurrent !== "object") return false;
  if (!supportsSs) return true;

  return hasSlidingCurrentWindowCandidates(baseCurrent);
};
