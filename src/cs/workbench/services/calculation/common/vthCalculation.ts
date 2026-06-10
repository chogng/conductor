/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
type VthPoint = {
  x: number;
  y: number;
};

type VthSourcePoint = {
  x?: unknown;
  y?: unknown;
} | null | undefined;

export type VthBranch = "electron" | "hole";

export type VthFitResult = {
  branch: VthBranch;
  intercept: number;
  r2: number;
  slope: number;
  vth: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

export const createVthSqrtPoints = (points: readonly VthSourcePoint[]) =>
  (Array.isArray(points) ? points : [])
    .map((point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y: Math.sqrt(Math.abs(y)) };
    })
    .filter((point): point is VthPoint => point !== null);

const fitLinear = (points: VthPoint[]) => {
  const n = points.length;
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  let sumYY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXX += point.x * point.x;
    sumXY += point.x * point.y;
    sumYY += point.y * point.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope === 0) {
    return null;
  }

  const ssTot = sumYY - (sumY * sumY) / n;
  let ssRes = 0;
  for (const point of points) {
    const residual = point.y - (slope * point.x + intercept);
    ssRes += residual * residual;
  }

  return {
    intercept,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
    slope,
  };
};

const pickVthLinearFit = (
  points: VthPoint[],
  branch: VthBranch,
): VthFitResult | null => {
  const sorted = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.y > 0)
    .slice()
    .sort((a, b) => a.x - b.x);
  if (sorted.length < 5) return null;

  const minWindow = Math.min(5, sorted.length);
  const maxWindow = Math.min(16, sorted.length);
  const maxY = Math.max(...sorted.map((point) => point.y));
  let best: (VthFitResult & { score: number }) | null = null;

  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
    for (let start = 0; start <= sorted.length - windowSize; start += 1) {
      const fitWindow = sorted.slice(start, start + windowSize);
      const fit = fitLinear(fitWindow);
      if (!fit) continue;
      if (branch === "electron" && fit.slope <= 0) continue;
      if (branch === "hole" && fit.slope >= 0) continue;

      const ys = fitWindow.map((point) => point.y);
      const ySpan = Math.max(...ys) - Math.min(...ys);
      if (maxY > 0 && ySpan / maxY < 0.12) continue;

      const vth = -fit.intercept / fit.slope;
      if (!Number.isFinite(vth)) continue;

      const x1 = fitWindow[0]!.x;
      const x2 = fitWindow[fitWindow.length - 1]!.x;
      const y1 = fit.slope * x1 + fit.intercept;
      const y2 = fit.slope * x2 + fit.intercept;
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;

      const score =
        fit.r2 +
        Math.min(0.08, ySpan / Math.max(maxY, 1e-300) * 0.08) +
        windowSize * 0.002;
      if (!best || score > best.score) {
        best = {
          branch,
          intercept: fit.intercept,
          r2: fit.r2,
          score,
          slope: fit.slope,
          vth,
          x1,
          x2,
          y1,
          y2,
        };
      }
    }
  }

  if (!best) return null;
  const { score: _score, ...fit } = best;
  return fit;
};

export const computeVthSqrtFits = (
  points: readonly VthSourcePoint[],
): VthFitResult[] => {
  const sqrtPoints = createVthSqrtPoints(points);
  if (sqrtPoints.length < 5) return [];

  const valley = sqrtPoints.reduce(
    (best, point) => point.y < best.y ? point : best,
    sqrtPoints[0]!,
  );
  const holePoints = sqrtPoints.filter((point) => point.x <= valley.x);
  const electronPoints = sqrtPoints.filter((point) => point.x >= valley.x);

  return [
    pickVthLinearFit(holePoints, "hole"),
    pickVthLinearFit(electronPoints, "electron"),
  ].filter((fit): fit is VthFitResult => fit !== null);
};
