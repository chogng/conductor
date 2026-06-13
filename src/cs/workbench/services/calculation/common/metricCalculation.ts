/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import { splitBidirectionalCurvePoints } from "./curveCalculation.ts";
import type { IonIoffMethod } from "./calculation.ts";

type PointLike = {
  x?: unknown;
  y?: unknown;
};

type MetricSourceFileLike = {
  supportsSs?: unknown;
  xAxisRole?: unknown;
  curveType?: unknown;
  xLabel?: unknown;
};

const normalizeCurveTypeToken = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const isNonIvSpecialCurveType = (curveType: string): boolean =>
  curveType === "pv" || curveType === "cv" || curveType === "cf";

type FiniteCurrentPoint = {
  absI: number;
  x: number;
};

export type IonIoffManualTargets = {
  ionX?: unknown;
  ioffX?: unknown;
};

export type CurrentWindowKind =
  | "lowEnd"
  | "highEnd"
  | "maxCurrent"
  | "minCurrent"
  | "zeroBias"
  | "manualIon"
  | "manualIoff";

export type CurrentWindowMeta = {
  current: number | null;
  key: CurrentWindowKind;
  label: string;
  pointCount: number;
  targetX: number | null;
  x: number | null;
  x1: number | null;
  x2: number | null;
};

export type BaseCurrentMetrics = {
  candidateWindows: CurrentWindowMeta[];
  ioff: number | null;
  ioffWindow: CurrentWindowMeta | null;
  ion: number | null;
  ionIoff: number | null;
  ionWindow: CurrentWindowMeta | null;
  method: IonIoffMethod | "unavailable";
  xAtIoff: number | null;
  xAtIon: number | null;
};

const CURRENT_WINDOW_RATIO = 0.1;
const CURRENT_WINDOW_MAX_POINTS = 7;
const CURRENT_WINDOW_MIN_POINTS = 3;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const median = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length === 0) return null;

  const sorted = values
    .filter((value) => isFiniteNumber(value))
    .slice()
    .sort((a, b) => a - b);

  if (!sorted.length) return null;

  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;

  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return null;
  return (left + right) / 2;
};

const toFiniteCurrentPoints = (points: PointLike[]): FiniteCurrentPoint[] =>
  (Array.isArray(points) ? points : [])
    .map((point) => {
      const x = point?.x;
      const y = point?.y;
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
      return {
        absI: Math.abs(y),
        x,
      };
    })
    .filter((point): point is FiniteCurrentPoint => point !== null);

const resolveCurrentWindowPointCount = (pointCount: number): number => {
  if (!Number.isFinite(pointCount) || pointCount <= 0) return 1;

  const maxWindowPoints = Math.max(
    1,
    Math.min(CURRENT_WINDOW_MAX_POINTS, Math.floor(pointCount / 3)),
  );
  const minWindowPoints = Math.min(CURRENT_WINDOW_MIN_POINTS, maxWindowPoints);
  const preferredWindowPoints = Math.round(pointCount * CURRENT_WINDOW_RATIO);

  return clampNumber(
    Math.max(minWindowPoints, preferredWindowPoints),
    1,
    maxWindowPoints,
  );
};

const buildCurrentWindow = ({
  key,
  label,
  points,
  targetX = null,
}: {
  key: CurrentWindowKind;
  label: string;
  points: FiniteCurrentPoint[];
  targetX?: number | null;
}): CurrentWindowMeta | null => {
  if (!Array.isArray(points) || points.length === 0) return null;

  const absValues = points
    .map((point) => point.absI)
    .filter((value) => isFiniteNumber(value));
  const xValues = points
    .map((point) => point.x)
    .filter((value) => isFiniteNumber(value));

  if (!absValues.length || !xValues.length) return null;

  const current = median(absValues);
  const xMedian = median(xValues);
  const x1 = Math.min(...xValues);
  const x2 = Math.max(...xValues);

  if (current === null || xMedian === null) return null;

  return {
    current,
    key,
    label,
    pointCount: xValues.length,
    targetX: isFiniteNumber(targetX) ? targetX : null,
    x: isFiniteNumber(targetX) ? targetX : xMedian,
    x1,
    x2,
  };
};

const takeNearestWindow = ({
  key,
  label,
  pointCount,
  points,
  targetX,
}: {
  key: CurrentWindowKind;
  label: string;
  pointCount: number;
  points: FiniteCurrentPoint[];
  targetX: number;
}): CurrentWindowMeta | null => {
  const windowPoints = points
    .slice()
    .sort((a, b) => {
      const distanceDelta = Math.abs(a.x - targetX) - Math.abs(b.x - targetX);
      if (distanceDelta !== 0) return distanceDelta;
      return a.x - b.x;
    })
    .slice(0, pointCount);

  return buildCurrentWindow({
    key,
    label,
    points: windowPoints,
    targetX,
  });
};

const pickExtremeCurrentWindow = (
  candidates: CurrentWindowMeta[],
  kind: "max" | "min",
): CurrentWindowMeta | null => {
  const finiteCandidates = candidates.filter(
    (candidate): candidate is CurrentWindowMeta =>
      candidate !== null && isFiniteNumber(candidate.current),
  );
  if (!finiteCandidates.length) return null;

  return finiteCandidates.slice(1).reduce((best, candidate) => {
    if (kind === "max") {
      return (candidate.current ?? Number.NEGATIVE_INFINITY) >
        (best.current ?? Number.NEGATIVE_INFINITY)
        ? candidate
        : best;
    }
    return (candidate.current ?? Number.POSITIVE_INFINITY) <
      (best.current ?? Number.POSITIVE_INFINITY)
      ? candidate
      : best;
  }, finiteCandidates[0]);
};

const buildSlidingExtremeCurrentWindow = ({
  key,
  kind,
  label,
  points,
  windowPointCount,
}: {
  key: Extract<CurrentWindowKind, "maxCurrent" | "minCurrent">;
  kind: "max" | "min";
  label: string;
  points: FiniteCurrentPoint[];
  windowPointCount: number;
}): CurrentWindowMeta | null => {
  if (!Array.isArray(points) || points.length === 0) return null;

  const resolvedPointCount = clampNumber(
    Math.floor(windowPointCount),
    1,
    points.length,
  );
  const windows: CurrentWindowMeta[] = [];

  for (let index = 0; index <= points.length - resolvedPointCount; index += 1) {
    const window = buildCurrentWindow({
      key,
      label,
      points: points.slice(index, index + resolvedPointCount),
    });
    if (window) windows.push(window);
  }

  return pickExtremeCurrentWindow(windows, kind);
};

const buildAutoCandidateWindows = (
  finitePoints: FiniteCurrentPoint[],
  branchLabel?: string | null,
): CurrentWindowMeta[] => {
  const windowPointCount = resolveCurrentWindowPointCount(finitePoints.length);
  const suffix = branchLabel ? ` (${branchLabel})` : "";
  const lowEnd = buildCurrentWindow({
    key: "lowEnd",
    label: `low-end${suffix}`,
    points: finitePoints.slice(0, windowPointCount),
  });
  const highEnd = buildCurrentWindow({
    key: "highEnd",
    label: `high-end${suffix}`,
    points: finitePoints.slice(-windowPointCount),
  });
  const minX = finitePoints[0]?.x;
  const maxX = finitePoints[finitePoints.length - 1]?.x;
  const zeroBias =
    isFiniteNumber(minX) && isFiniteNumber(maxX) && minX <= 0 && maxX >= 0
      ? takeNearestWindow({
          key: "zeroBias",
          label: `near 0${suffix}`,
          pointCount: windowPointCount,
          points: finitePoints,
          targetX: 0,
      })
    : null;
  const minCurrent = buildSlidingExtremeCurrentWindow({
    key: "minCurrent",
    kind: "min",
    label: `min-current${suffix}`,
    points: finitePoints,
    windowPointCount,
  });
  const maxCurrent = buildSlidingExtremeCurrentWindow({
    key: "maxCurrent",
    kind: "max",
    label: `max-current${suffix}`,
    points: finitePoints,
    windowPointCount,
  });

  return [lowEnd, highEnd, zeroBias, minCurrent, maxCurrent].filter(
    (candidate): candidate is CurrentWindowMeta => candidate !== null,
  );
};
const resolveSegmentBranchLabel = (branch: unknown): string | null => {
  const value = String(branch ?? "").trim().toLowerCase();
  if (value === "forward") return "forward";
  if (value === "reverse") return "reverse";
  return null;
};

const buildEmptyBaseCurrentMetrics = (): BaseCurrentMetrics => ({
  candidateWindows: [],
  ioff: null,
  ioffWindow: null,
  ion: null,
  ionIoff: null,
  ionWindow: null,
  method: "unavailable",
  xAtIoff: null,
  xAtIon: null,
});

export const isTransferLikeFile = (
  file: MetricSourceFileLike | null | undefined,
): boolean => {
  const curveType = normalizeCurveTypeToken(file?.curveType);
  if (isNonIvSpecialCurveType(curveType)) return false;
  if (file?.supportsSs === true) return true;
  if (file?.supportsSs === false) return false;

  const xAxisRole = String(file?.xAxisRole || "").toLowerCase();
  if (xAxisRole) return xAxisRole === "vg";

  if (curveType) return curveType.includes("vg") || curveType.includes("transfer");

  const label = String(file?.xLabel || "").toLowerCase();
  return label.includes("vg");
};

export const isOutputLikeFile = (
  file: MetricSourceFileLike | null | undefined,
): boolean => {
  const curveType = normalizeCurveTypeToken(file?.curveType);
  if (isNonIvSpecialCurveType(curveType)) return false;
  if (file?.supportsSs === true) return false;
  if (file?.supportsSs === false && curveType === "output") return true;

  const xAxisRole = String(file?.xAxisRole || "").toLowerCase();
  if (xAxisRole) return xAxisRole === "vd";

  if (curveType) return curveType.includes("vd") || curveType.includes("output");

  const label = String(file?.xLabel || "").toLowerCase();
  return label.includes("vd");
};

export const computeBaseCurrentMetrics = ({
  manualTargets,
  method = "auto",
  points,
  sourceFile,
}: {
  manualTargets?: IonIoffManualTargets | null;
  method?: IonIoffMethod;
  points: PointLike[];
  sourceFile?: MetricSourceFileLike | null;
}): BaseCurrentMetrics => {
  if (!isTransferLikeFile(sourceFile)) {
    return buildEmptyBaseCurrentMetrics();
  }

  const segmentEntries = splitBidirectionalCurvePoints(points)
    .map((segment) => ({
      branchLabel: resolveSegmentBranchLabel(segment?.branch),
      points: toFiniteCurrentPoints(segment?.points ?? []).sort((a, b) => a.x - b.x),
    }))
    .filter((segment) => segment.points.length > 0);
  if (!segmentEntries.length) {
    return buildEmptyBaseCurrentMetrics();
  }

  const candidateWindows = segmentEntries.flatMap((segment) =>
    buildAutoCandidateWindows(segment.points, segment.branchLabel),
  );
  const autoIonWindow = pickExtremeCurrentWindow(candidateWindows, "max");
  const autoIoffWindow = pickExtremeCurrentWindow(candidateWindows, "min");

  if (method !== "manual") {
    const ion = autoIonWindow?.current ?? null;
    const ioff = autoIoffWindow?.current ?? null;
    return {
      candidateWindows,
      ioff,
      ioffWindow: autoIoffWindow,
      ion,
      ionIoff:
        ion !== null && ioff !== null && Number.isFinite(ioff) && ioff !== 0
          ? ion / ioff
          : null,
      ionWindow: autoIonWindow,
      method: "auto",
      xAtIoff: autoIoffWindow?.x ?? null,
      xAtIon: autoIonWindow?.x ?? null,
    };
  }
  const ionTargetX = Number(manualTargets?.ionX);
  const ioffTargetX = Number(manualTargets?.ioffX);
  const ionCandidates = isFiniteNumber(ionTargetX)
    ? segmentEntries
        .map((segment) =>
          takeNearestWindow({
            key: "manualIon",
            label: `manual Ion${segment.branchLabel ? ` (${segment.branchLabel})` : ""}`,
            pointCount: resolveCurrentWindowPointCount(segment.points.length),
            points: segment.points,
            targetX: ionTargetX,
          }),
        )
        .filter((window): window is CurrentWindowMeta => window !== null)
    : [];
  const ioffCandidates = isFiniteNumber(ioffTargetX)
    ? segmentEntries
        .map((segment) =>
          takeNearestWindow({
            key: "manualIoff",
            label: `manual Ioff${segment.branchLabel ? ` (${segment.branchLabel})` : ""}`,
            pointCount: resolveCurrentWindowPointCount(segment.points.length),
            points: segment.points,
            targetX: ioffTargetX,
          }),
        )
        .filter((window): window is CurrentWindowMeta => window !== null)
    : [];
  const ionWindow = pickExtremeCurrentWindow(ionCandidates, "max");
  const ioffWindow = pickExtremeCurrentWindow(ioffCandidates, "min");
  const ion = ionWindow?.current ?? null;
  const ioff = ioffWindow?.current ?? null;

  return {
    candidateWindows,
    ioff,
    ioffWindow,
    ion,
    ionIoff:
      ion !== null && ioff !== null && Number.isFinite(ioff) && ioff !== 0
        ? ion / ioff
        : null,
    ionWindow,
    method: "manual",
    xAtIoff: ioffWindow?.x ?? null,
    xAtIon: ionWindow?.x ?? null,
  };
};
