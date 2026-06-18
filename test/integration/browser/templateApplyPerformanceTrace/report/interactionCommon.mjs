import { readNumber, roundMetric } from "./common.mjs";
import {
  createPhaseWindows,
  filterByWindow,
  getTraceEventWallTime,
} from "./phase.mjs";

export const firstDispatchesByFile = (dispatches) => {
  const seen = new Set();
  const firstDispatches = [];
  for (const dispatch of dispatches) {
    const fileId = String(dispatch?.fileId ?? "");
    if (!fileId || seen.has(fileId)) {
      continue;
    }
    seen.add(fileId);
    firstDispatches.push(dispatch);
  }
  return firstDispatches;
};

export const durationFromDispatch = (dispatch, event) => {
  const start = readNumber(dispatch?.timestamp);
  const end = readNumber(event?.timestamp);
  return start != null && end != null ? roundMetric(end - start) : null;
};

export const phaseWindowByName = (phaseAnchors, name) =>
  createPhaseWindows(Array.isArray(phaseAnchors) ? phaseAnchors : [])
    .find(window => window.name === name) ?? null;

export const firstDispatchesByFileForWindow = (dispatches, window) =>
  firstDispatchesByFile(
    window
      ? filterByWindow(dispatches, window, getTraceEventWallTime)
      : dispatches,
  );
