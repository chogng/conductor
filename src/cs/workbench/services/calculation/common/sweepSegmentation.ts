/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const detectBidirectionalSplitIndex = (xSeq: any) => {
  const xs = Array.isArray(xSeq) ? xSeq : [];
  if (xs.length < 5) {
    return null;
  }
  let firstDir = 0;
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1];
    const curr = xs[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) {
      continue;
    }
    const dx = curr - prev;
    if (dx === 0) {
      continue;
    }
    firstDir = dx > 0 ? 1 : -1;
    break;
  }
  if (firstDir === 0) {
    return null;
  }
  let hasPos = false;
  let hasNeg = false;
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1];
    const curr = xs[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) {
      continue;
    }
    const dx = curr - prev;
    if (dx > 0) {
      hasPos = true;
    }
    if (dx < 0) {
      hasNeg = true;
    }
  }
  if (!(hasPos && hasNeg)) {
    return null;
  }
  if (firstDir > 0) {
    let idxMax = 0;
    let max = xs[0];
    for (let i = 1; i < xs.length; i++) {
      const v = xs[i];
      if (!isFiniteNumber(v)) {
        continue;
      }
      if (!isFiniteNumber(max) || v > max) {
        max = v;
        idxMax = i;
      }
    }
    if (idxMax <= 1 || idxMax >= xs.length - 2) {
      return null;
    }
    return idxMax;
  }
  let idxMin = 0;
  let min = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const v = xs[i];
    if (!isFiniteNumber(v)) {
      continue;
    }
    if (!isFiniteNumber(min) || v < min) {
      min = v;
      idxMin = i;
    }
  }
  if (idxMin <= 1 || idxMin >= xs.length - 2) {
    return null;
  }
  return idxMin;
};

export const splitBidirectionalCurvePoints = (pointsRaw: any) => {
  const points = Array.isArray(pointsRaw) ? pointsRaw : [];
  if (points.length < 2) {
    return points.length ? [{ branch: "full", points }] : [];
  }
  const xsSeq = points.map((point: any) => {
    const x = point?.x;
    return typeof x === "number" ? x : Number(x);
  });
  const splitIdx = detectBidirectionalSplitIndex(xsSeq);
  if (splitIdx == null) {
    return [{ branch: "full", points }];
  }
  let firstDir = 0;
  for (let i = 1; i < xsSeq.length; i++) {
    const prev = xsSeq[i - 1];
    const curr = xsSeq[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) {
      continue;
    }
    const dx = curr - prev;
    if (dx === 0) {
      continue;
    }
    firstDir = dx > 0 ? 1 : -1;
    break;
  }
  const firstBranch = firstDir >= 0 ? "forward" : "reverse";
  const secondBranch = firstBranch === "forward" ? "reverse" : "forward";
  return [
    { branch: firstBranch, points: points.slice(0, splitIdx + 1) },
    { branch: secondBranch, points: points.slice(splitIdx) },
  ].filter((segment: any) => Array.isArray(segment.points) && segment.points.length > 0);
};
