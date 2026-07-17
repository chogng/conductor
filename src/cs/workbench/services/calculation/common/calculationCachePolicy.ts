/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
      .map((candidateWindow) => String(candidateWindow.key ?? "")),
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
