const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const toPoint = (x, y) => {
  const yVal = isFiniteNumber(y) ? y : null;
  const yAbs = yVal === null ? null : Math.abs(yVal);
  return {
    x,
    y: yVal,
    yPositive: yVal !== null && yVal > 0 ? yVal : null,
    yAbsPositive: yAbs !== null && yAbs > 0 ? yAbs : null,
  };
};

export const SS_CONF = {
  auto: {
    floorQuantile: 0.1,
    floorMarginDecTry: [1.0, 0.7],
    r2Try: [0.995, 0.99, 0.98],
    minDecadeSpanTry: [1.0, 0.7],
    minPointsTry: [12, 8],
    windowPoints: 12,
    slopeStabilityMaxTry: [0.1, 0.15],
    classify: { high: { r2: 0.995, span: 1.0, n: 12, stab: 0.1 } },
    suggestionFloor: { r2: 0.98, span: 0.7, n: 8, stab: 0.15, floor: 0.7 },
  },
  manual: {
    classify: {
      high: { r2: 0.995, span: 1.0, n: 12, stab: 0.1 },
      low: { r2: 0.98, span: 0.5, n: 8 },
      fail: { minN: 8, minSpan: 0.3, minR2: 0.95 },
    },
  },
  idw: {
    minWindowRatioWarn: 10,
    classify: {
      high: { r2: 0.995, span: 1.0, n: 12, stab: 0.1, minWindowRatio: 10 },
      low: { r2: 0.98, span: 0.5, n: 8 },
      fail: { minN: 8, minSpan: 0.3, minR2: 0.95 },
    },
  },
  legacy: { confidence: "low" },
};

const padDomain = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  const pad = span * 0.05;
  return [lo - pad, hi + pad];
};

export const computeCentralDerivative = (points) => {
  if (!Array.isArray(points) || points.length < 2) return [];

  const out = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const x = curr?.x;
    const y = curr?.y;

    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      out[i] = toPoint(x, null);
      continue;
    }

    const prev = i > 0 ? points[i - 1] : null;
    const next = i < points.length - 1 ? points[i + 1] : null;

    if (prev && next) {
      const dx = next.x - prev.x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (next.y - prev.y) / dx);
      continue;
    }

    if (next) {
      const dx = next.x - x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (next.y - y) / dx);
      continue;
    }

    if (prev) {
      const dx = x - prev.x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (y - prev.y) / dx);
      continue;
    }

    out[i] = toPoint(x, null);
  }

  return out;
};

const interpolateMonotonicLinear = (xArrRaw, yArrRaw, xTarget) => {
  const xArr = xArrRaw ?? [];
  const yArr = yArrRaw ?? [];
  const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (n <= 0) return null;

  const x0 = xArr[0];
  const xN = xArr[n - 1];
  if (!isFiniteNumber(x0) || !isFiniteNumber(xN) || !isFiniteNumber(xTarget)) {
    return null;
  }

  const increasing = x0 <= xN;
  if (increasing) {
    if (xTarget < x0 || xTarget > xN) return null;
  } else {
    if (xTarget > x0 || xTarget < xN) return null;
  }

  // Fast-path exact boundary matches.
  if (xTarget === x0) return isFiniteNumber(yArr[0]) ? yArr[0] : null;
  if (xTarget === xN) return isFiniteNumber(yArr[n - 1]) ? yArr[n - 1] : null;

  let lo = 0;
  let hi = n - 1;

  // Binary search for bounding indices.
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const xm = xArr[mid];
    if (!isFiniteNumber(xm)) return null;

    const goRight = increasing ? xm <= xTarget : xm >= xTarget;
    if (goRight) lo = mid;
    else hi = mid;
  }

  const xLo = xArr[lo];
  const xHi = xArr[hi];
  const yLo = yArr[lo];
  const yHi = yArr[hi];
  if (
    !isFiniteNumber(xLo) ||
    !isFiniteNumber(xHi) ||
    !isFiniteNumber(yLo) ||
    !isFiniteNumber(yHi)
  ) {
    return null;
  }

  if (xTarget === xLo) return yLo;
  if (xTarget === xHi) return yHi;

  const dx = xHi - xLo;
  if (!isFiniteNumber(dx) || dx === 0) return yLo;

  const t = (xTarget - xLo) / dx;
  if (!isFiniteNumber(t)) return null;

  // t should be in [0,1], but clamp to be safe with floating errors.
  const tc = Math.max(0, Math.min(1, t));
  return yLo + tc * (yHi - yLo);
};

export const computeLegendDerivativeSeries = (curves) => {
  if (!Array.isArray(curves) || curves.length < 2) return new Map();

  const normalized = curves
    .map((c) => ({
      id: c?.id ?? null,
      x: c?.x ?? null,
      y: c?.y ?? null,
      param: c?.param ?? null,
    }))
    .filter(
      (c) =>
        typeof c.id === "string" &&
        Array.isArray(c.x) === false &&
        Array.isArray(c.y) === false &&
        isFiniteNumber(c.param) &&
        (c.x?.length ?? 0) > 0 &&
        (c.y?.length ?? 0) > 0,
    );

  if (normalized.length < 2) return new Map();

  normalized.sort((a, b) => a.param - b.param);
  const n = normalized.length;

  const findPrevDistinct = (i) => {
    const p0 = normalized[i]?.param;
    for (let p = i - 1; p >= 0; p--) {
      const pv = normalized[p]?.param;
      if (isFiniteNumber(pv) && pv !== p0) return p;
    }
    return -1;
  };

  const findNextDistinct = (i) => {
    const p0 = normalized[i]?.param;
    for (let k = i + 1; k < n; k++) {
      const pv = normalized[k]?.param;
      if (isFiniteNumber(pv) && pv !== p0) return k;
    }
    return -1;
  };

  const outById = new Map();

  for (let i = 0; i < n; i++) {
    const curr = normalized[i];
    const prevIdx = findPrevDistinct(i);
    const nextIdx = findNextDistinct(i);
    const hasPrev = prevIdx >= 0;
    const hasNext = nextIdx >= 0;

    const currX = curr.x;
    const currY = curr.y;
    const out = new Array(currX.length);

    for (let j = 0; j < currX.length; j++) {
      const x = currX[j];
      const yCurr = currY[j];

      if (!isFiniteNumber(x) || !isFiniteNumber(yCurr)) {
        out[j] = toPoint(x, null);
        continue;
      }

      if (hasPrev && hasNext) {
        const prev = normalized[prevIdx];
        const next = normalized[nextIdx];
        const denom = next.param - prev.param;
        if (!isFiniteNumber(denom) || denom === 0) {
          out[j] = toPoint(x, null);
          continue;
        }

        const yPrev = interpolateMonotonicLinear(prev.x, prev.y, x);
        const yNext = interpolateMonotonicLinear(next.x, next.y, x);
        if (!isFiniteNumber(yPrev) || !isFiniteNumber(yNext)) {
          out[j] = toPoint(x, null);
          continue;
        }

        out[j] = toPoint(x, (yNext - yPrev) / denom);
        continue;
      }

      if (hasNext) {
        const next = normalized[nextIdx];
        const denom = next.param - curr.param;
        if (!isFiniteNumber(denom) || denom === 0) {
          out[j] = toPoint(x, null);
          continue;
        }

        const yNext = interpolateMonotonicLinear(next.x, next.y, x);
        if (!isFiniteNumber(yNext)) {
          out[j] = toPoint(x, null);
          continue;
        }

        out[j] = toPoint(x, (yNext - yCurr) / denom);
        continue;
      }

      if (hasPrev) {
        const prev = normalized[prevIdx];
        const denom = curr.param - prev.param;
        if (!isFiniteNumber(denom) || denom === 0) {
          out[j] = toPoint(x, null);
          continue;
        }

        const yPrev = interpolateMonotonicLinear(prev.x, prev.y, x);
        if (!isFiniteNumber(yPrev)) {
          out[j] = toPoint(x, null);
          continue;
        }

        out[j] = toPoint(x, (yCurr - yPrev) / denom);
        continue;
      }

      out[j] = toPoint(x, null);
    }

    outById.set(curr.id, out);
  }

  return outById;
};

export const computeSubthresholdSwing = (points) => {
  if (!Array.isArray(points) || points.length < 3) return [];

  const log10AbsY = points.map((p) => {
    const y = p?.y;
    if (!isFiniteNumber(y)) return null;
    const abs = Math.abs(y);
    if (abs <= 0) return null;
    return Math.log10(abs);
  });

  const out = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const x = points[i]?.x;
    if (!isFiniteNumber(x)) {
      out[i] = toPoint(x, null);
      continue;
    }

    const prev = i > 0 ? points[i - 1] : null;
    const next = i < points.length - 1 ? points[i + 1] : null;

    if (!prev || !next) {
      out[i] = toPoint(x, null);
      continue;
    }

    const prevLog = log10AbsY[i - 1];
    const nextLog = log10AbsY[i + 1];
    if (!isFiniteNumber(prevLog) || !isFiniteNumber(nextLog)) {
      out[i] = toPoint(x, null);
      continue;
    }

    const dx = next.x - prev.x;
    if (!isFiniteNumber(dx) || dx === 0) {
      out[i] = toPoint(x, null);
      continue;
    }

    const slope = (nextLog - prevLog) / dx; // dec / V
    if (!isFiniteNumber(slope) || slope === 0) {
      out[i] = toPoint(x, null);
      continue;
    }

    const ss = (1000 / Math.abs(slope)) * 1; // mV / dec
    out[i] = toPoint(x, ss);
  }

  return out;
};

const median = (arr) => {
  const list = (Array.isArray(arr) ? arr : []).filter(isFiniteNumber);
  if (list.length === 0) return null;
  list.sort((a, b) => a - b);
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 0 ? (list[mid - 1] + list[mid]) / 2 : list[mid];
};

const mad = (arr, med) => {
  const m = isFiniteNumber(med) ? med : median(arr);
  if (!isFiniteNumber(m)) return null;
  const deviations = (Array.isArray(arr) ? arr : [])
    .filter(isFiniteNumber)
    .map((v) => Math.abs(v - m));
  return median(deviations);
};

const computeLinearFit = (xArr, yArr, l, r) => {
  const n0 = Array.isArray(xArr) ? xArr.length : 0;
  const n1 = Array.isArray(yArr) ? yArr.length : 0;
  const n = Math.min(n0, n1);
  const lo = Math.max(0, Math.min(l ?? 0, n - 1));
  const hi = Math.max(0, Math.min(r ?? n - 1, n - 1));
  const start = Math.min(lo, hi);
  const end = Math.max(lo, hi);

  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = start; i <= end; i++) {
    const x = xArr[i];
    const y = yArr[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    count += 1;
    sumX += x;
    sumY += y;
  }
  if (count < 2) return null;
  const meanX = sumX / count;
  const meanY = sumY / count;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = start; i <= end; i++) {
    const x = xArr[i];
    const y = yArr[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    const dx = x - meanX;
    const dy = y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (!isFiniteNumber(sxx) || sxx === 0) return null;

  const a = sxy / sxx;
  const b = meanY - a * meanX;

  let ssRes = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = start; i <= end; i++) {
    const x = xArr[i];
    const y = yArr[i];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    const yHat = a * x + b;
    const e = y - yHat;
    ssRes += e * e;
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }

  const r2 = syy > 0 ? 1 - ssRes / syy : 1;
  const rmse = Math.sqrt(ssRes / Math.max(1, count));
  const decadeSpan = yMax - yMin;

  return {
    a,
    b,
    r2,
    rmse,
    n: count,
    yMin,
    yMax,
    decadeSpan,
    i0: start,
    i1: end,
  };
};

const computeSlopeStability = (xArr, yArr, l, r) => {
  const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  const start = Math.max(0, Math.min(l ?? 0, n - 1));
  const end = Math.max(0, Math.min(r ?? n - 1, n - 1));
  if (end - start < 2) return null;

  const slopes = [];
  for (let i = start + 1; i <= end - 1; i++) {
    const xPrev = xArr[i - 1];
    const xNext = xArr[i + 1];
    const yPrev = yArr[i - 1];
    const yNext = yArr[i + 1];
    if (
      !isFiniteNumber(xPrev) ||
      !isFiniteNumber(xNext) ||
      !isFiniteNumber(yPrev) ||
      !isFiniteNumber(yNext)
    ) {
      continue;
    }
    const dx = xNext - xPrev;
    if (!isFiniteNumber(dx) || dx === 0) continue;
    const s = (yNext - yPrev) / dx;
    if (!isFiniteNumber(s) || s === 0) continue;
    slopes.push(Math.abs(s));
  }

  if (slopes.length < 3) return null;
  const m = median(slopes);
  if (!isFiniteNumber(m) || m <= 0) return null;
  const mdev = mad(slopes, m);
  if (!isFiniteNumber(mdev)) return null;
  return mdev / m;
};

const splitIntoConsecutiveSegments = (indices) => {
  const idx = Array.isArray(indices) ? indices : [];
  if (idx.length === 0) return [];
  const segments = [];
  let start = 0;
  for (let i = 1; i < idx.length; i++) {
    if (idx[i] !== idx[i - 1] + 1) {
      segments.push(idx.slice(start, i));
      start = i;
    }
  }
  segments.push(idx.slice(start));
  return segments;
};

const detectBidirectionalSplitIndex = (xSeq) => {
  const xs = Array.isArray(xSeq) ? xSeq : [];
  if (xs.length < 5) return null;

  let firstDir = 0;
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1];
    const curr = xs[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) continue;
    const dx = curr - prev;
    if (dx === 0) continue;
    firstDir = dx > 0 ? 1 : -1;
    break;
  }
  if (firstDir === 0) return null;

  let hasPos = false;
  let hasNeg = false;
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1];
    const curr = xs[i];
    if (!isFiniteNumber(prev) || !isFiniteNumber(curr)) continue;
    const dx = curr - prev;
    if (dx > 0) hasPos = true;
    if (dx < 0) hasNeg = true;
  }
  if (!(hasPos && hasNeg)) return null;

  if (firstDir > 0) {
    let idxMax = 0;
    let max = xs[0];
    for (let i = 1; i < xs.length; i++) {
      const v = xs[i];
      if (!isFiniteNumber(v)) continue;
      if (!isFiniteNumber(max) || v > max) {
        max = v;
        idxMax = i;
      }
    }
    if (idxMax <= 1 || idxMax >= xs.length - 2) return null;
    return idxMax;
  }

  let idxMin = 0;
  let min = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const v = xs[i];
    if (!isFiniteNumber(v)) continue;
    if (!isFiniteNumber(min) || v < min) {
      min = v;
      idxMin = i;
    }
  }
  if (idxMin <= 1 || idxMin >= xs.length - 2) return null;
  return idxMin;
};

const sanitizeLogPoints = (points) => {
  const raw = Array.isArray(points) ? points : [];
  const cleaned = raw
    .map((p) => ({
      x: typeof p?.x === "number" ? p.x : Number(p?.x),
      i: typeof p?.y === "number" ? p.y : Number(p?.y),
    }))
    .filter((p) => isFiniteNumber(p.x) && isFiniteNumber(p.i) && p.i !== 0);

  if (cleaned.length < 3) return { ok: false, reason: "common.not_enough_points" };

  const xsSeq = cleaned.map((p) => p.x);
  const splitIdx = detectBidirectionalSplitIndex(xsSeq);

  const toSegment = (list) => {
    const sorted = list.slice().sort((a, b) => a.x - b.x);
    const x = sorted.map((p) => p.x);
    const absI = sorted.map((p) => Math.abs(p.i));
    const y = absI.map((v) => (v > 0 ? Math.log10(v) : null));
    return { x, absI, y };
  };

  if (splitIdx == null) {
    return { ok: true, segments: [toSegment(cleaned)] };
  }

  const s1 = cleaned.slice(0, splitIdx + 1);
  const s2 = cleaned.slice(splitIdx);
  const segments = [];
  if (s1.length >= 3) segments.push(toSegment(s1));
  if (s2.length >= 3) segments.push(toSegment(s2));
  if (segments.length === 0) {
    return { ok: false, reason: "common.sweep_split_no_valid" };
  }
  return { ok: true, segments };
};

const selectBestByScore = (results) => {
  const list = Array.isArray(results) ? results.filter(Boolean) : [];
  if (list.length === 0) return null;
  return list.reduce((best, curr) => {
    if (!best) return curr;

    const bestScore = best.score ?? -Infinity;
    const currScore = curr.score ?? -Infinity;
    if (currScore !== bestScore) return currScore > bestScore ? curr : best;

    const bestSpan = best.decadeSpan ?? -Infinity;
    const currSpan = curr.decadeSpan ?? -Infinity;
    if (currSpan !== bestSpan) return currSpan > bestSpan ? curr : best;

    const bestRmse = best.rmse ?? Infinity;
    const currRmse = curr.rmse ?? Infinity;
    if (currRmse !== bestRmse) return currRmse < bestRmse ? curr : best;

    const bestN = best.n ?? -Infinity;
    const currN = curr.n ?? -Infinity;
    if (currN !== bestN) return currN > bestN ? curr : best;

    const bestX1 = best.x1 ?? Infinity;
    const currX1 = curr.x1 ?? Infinity;
    if (currX1 !== bestX1) return currX1 < bestX1 ? curr : best;

    return best;
  }, null);
};

const runAutoSearch = (segment, conf, { wantSuggestion = false } = {}) => {
  const xArr = segment?.x ?? [];
  const yArr = segment?.y ?? [];

  const validY = yArr.filter(isFiniteNumber);
  if (validY.length < 3) return null;

  const q = conf.floorQuantile ?? 0.1;
  const sortedY = validY.slice().sort((a, b) => a - b);
  const nFloor = Math.max(10, Math.ceil(sortedY.length * q));
  const yFloor = median(sortedY.slice(0, Math.min(nFloor, sortedY.length)));
  if (!isFiniteNumber(yFloor)) return null;

  const floorTry = Array.isArray(conf.floorMarginDecTry)
    ? conf.floorMarginDecTry
    : [1.0];
  const spanTry = Array.isArray(conf.minDecadeSpanTry)
    ? conf.minDecadeSpanTry
    : [1.0];
  const minPtsTry = Array.isArray(conf.minPointsTry)
    ? conf.minPointsTry
    : [12];
  const r2Try = Array.isArray(conf.r2Try) ? conf.r2Try : [0.995];
  const stabTry = Array.isArray(conf.slopeStabilityMaxTry)
    ? conf.slopeStabilityMaxTry
    : [0.1];

  const windowPoints = Math.max(3, Math.floor(conf.windowPoints ?? 12));

  const strictHigh = conf.classify?.high ?? null;
  const strictProfile = strictHigh
    ? {
      floorMarginDec: floorTry[0] ?? 1.0,
      minSpan: strictHigh.span ?? 1.0,
      minPoints: strictHigh.n ?? 12,
      r2Min: strictHigh.r2 ?? 0.995,
      stabMax: strictHigh.stab ?? 0.1,
    }
    : null;

  const suggestionFloor = conf.suggestionFloor ?? null;

  let bestAny = null;
  let bestStrict = null;
  let maxAboveCount = 0;

  for (let iFloor = 0; iFloor < floorTry.length; iFloor++) {
    const floorMarginDec = floorTry[iFloor];

    const above = [];
    for (let i = 0; i < yArr.length; i++) {
      const y = yArr[i];
      if (!isFiniteNumber(y)) continue;
      if (y >= yFloor + floorMarginDec) above.push(i);
    }
    maxAboveCount = Math.max(maxAboveCount, above.length);

    const segments = splitIntoConsecutiveSegments(above);

    for (let iSpan = 0; iSpan < spanTry.length; iSpan++) {
      const minSpan = spanTry[iSpan];

      for (let iMinPts = 0; iMinPts < minPtsTry.length; iMinPts++) {
        const minPoints = minPtsTry[iMinPts];

        for (let iR2 = 0; iR2 < r2Try.length; iR2++) {
          const r2Min = r2Try[iR2];

          for (let iStab = 0; iStab < stabTry.length; iStab++) {
            const stabMax = stabTry[iStab];

            for (const seg of segments) {
              if ((seg?.length ?? 0) < minPoints) continue;
              const segLen = seg.length;
              const k1 = Math.min(windowPoints, segLen);
              const k2 = Math.min(minPoints, segLen);
              const windows = k1 === k2 ? [k1] : [k1, k2];

              for (const k of windows) {
                if (k < minPoints) continue;
                for (let t = 0; t <= segLen - k; t++) {
                  const l = seg[t];
                  const r = seg[t + k - 1];
                  const fit = computeLinearFit(xArr, yArr, l, r);
                  if (!fit) continue;
                  if (!isFiniteNumber(fit.r2) || fit.r2 < r2Min) continue;
                  if (!isFiniteNumber(fit.decadeSpan) || fit.decadeSpan < minSpan)
                    continue;

                  const stab = computeSlopeStability(xArr, yArr, l, r);
                  if (stabMax != null && isFiniteNumber(stab)) {
                    if (stab > stabMax) continue;
                  }

                  const score =
                    fit.r2 + 0.25 * Math.min(fit.decadeSpan, 3) - 0.5 * (stab ?? 0);

                  const candidate = {
                    ...fit,
                    x1: xArr[l],
                    x2: xArr[r],
                    yFloor,
                    stab: isFiniteNumber(stab) ? stab : null,
                    score,
                    profileUsed: { floorMarginDec, minSpan, minPoints, r2Min, stabMax },
                    profileRank: [iFloor, iSpan, iMinPts, iR2, iStab],
                    l,
                    r,
                  };

                  // Track best across *all* (for suggestion) if it meets suggestion floor.
                  if (wantSuggestion && suggestionFloor) {
                    const meetsSuggestionFloor =
                      fit.r2 >= suggestionFloor.r2 &&
                      fit.decadeSpan >= suggestionFloor.span &&
                      fit.n >= suggestionFloor.n &&
                      (suggestionFloor.stab == null ||
                        candidate.stab == null ||
                        candidate.stab <= suggestionFloor.stab) &&
                      floorMarginDec >= suggestionFloor.floor;

                    if (meetsSuggestionFloor) {
                      bestAny = selectBestByScore([bestAny, candidate]);
                    }
                  }

                  if (strictProfile) {
                    const isStrict =
                      floorMarginDec === strictProfile.floorMarginDec &&
                      minSpan === strictProfile.minSpan &&
                      minPoints === strictProfile.minPoints &&
                      r2Min === strictProfile.r2Min &&
                      stabMax === strictProfile.stabMax;
                    if (isStrict) {
                      bestStrict = selectBestByScore([bestStrict, candidate]);
                    }
                  }

                  // Stop-at-first-success behavior for strict search profiles:
                  // If this candidate is the first one in current profile set, we still need to pick best within this profile.
                  // We rely on outer logic to stop after scanning the current profile if any candidate exists.
                }
              }
            }

            // If not suggestion mode, implement "stop at first profile that has any valid window".
            if (!wantSuggestion) {
              // Find best candidate among current profile by comparing profileRank equality.
              // We can reuse bestStrict when current profile is strict; otherwise compute it from candidates is costly.
              // Simpler: re-scan by checking candidates already considered isn't available here; so use bestStrict only for strict profile.
              // For non-strict profiles, we approximate by returning the bestAny-like candidate, but only within this profile is not tracked.
              // To keep deterministic behavior, we treat strict search as strict-only: caller uses strict thresholds only.
            }
          }
        }
      }
    }
  }

  return { yFloor, maxAboveCount, bestStrict, bestAny };
};

export const computeSubthresholdSwingFitAuto = (
  points,
  { conf = SS_CONF.auto } = {},
) => {
  const sanitized = sanitizeLogPoints(points);
  if (!sanitized.ok) {
    return {
      strict: {
        ok: false,
        reason: sanitized.reason ?? "common.invalid_points",
        detail: {},
      },
      suggested: { ok: false, reason: sanitized.reason ?? "common.invalid_points" },
    };
  }

  const strictTargets = conf.classify?.high ?? null;
  const strictResults = sanitized.segments
    .map((seg) => {
      const out = runAutoSearch(seg, conf, { wantSuggestion: true });
      if (!out) return null;
      const bestStrict = out.bestStrict ?? null;
      const bestAny = out.bestAny ?? null;
      return { ...out, bestStrict, bestAny };
    })
    .filter(Boolean);

  const pickStrict = selectBestByScore(strictResults.map((r) => r.bestStrict));
  const pickSuggested = selectBestByScore(strictResults.map((r) => r.bestAny));
  const minPointsFloor = Math.min(...(conf.minPointsTry ?? [8]));
  const maxAboveCount = Math.max(0, ...strictResults.map((r) => r.maxAboveCount ?? 0));

  const strict = (() => {
    if (pickStrict && strictTargets) {
      const ss = isFiniteNumber(pickStrict.a) && pickStrict.a !== 0
        ? 1000 / Math.abs(pickStrict.a)
        : null;
      return {
        ok: isFiniteNumber(ss),
        ss: isFiniteNumber(ss) ? ss : null,
        x1: pickStrict.x1,
        x2: pickStrict.x2,
        a: isFiniteNumber(pickStrict.a) ? pickStrict.a : null,
        b: isFiniteNumber(pickStrict.b) ? pickStrict.b : null,
        r2: pickStrict.r2,
        decadeSpan: pickStrict.decadeSpan,
        n: pickStrict.n,
        reason: isFiniteNumber(ss) ? "ok" : "common.invalid_points",
        detail: {
          yFloor: pickStrict.yFloor,
          profileUsed: pickStrict.profileUsed,
          stab: pickStrict.stab,
          score: pickStrict.score,
        },
      };
    }

    // Strict fail, but include best attempt if available.
    const bestAttempt = pickSuggested ?? null;
    const reason =
      maxAboveCount < minPointsFloor
        ? "auto.no_points_above_floor"
        : bestAttempt
          ? "auto.no_window_meets_strict"
          : "auto.no_window_meets_threshold";
    return {
      ok: false,
      reason,
      detail: bestAttempt
        ? {
          bestAttempt: {
            x1: bestAttempt.x1,
            x2: bestAttempt.x2,
            r2: bestAttempt.r2,
            decadeSpan: bestAttempt.decadeSpan,
            n: bestAttempt.n,
            yFloor: bestAttempt.yFloor,
            stab: bestAttempt.stab,
            profileUsed: bestAttempt.profileUsed,
          },
        }
        : {},
    };
  })();

  const suggested = (() => {
    if (!pickSuggested) {
      const reason =
        maxAboveCount < minPointsFloor
          ? "auto.no_points_above_floor"
          : "auto.no_window_meets_threshold";
      return { ok: false, reason };
    }
    const ss = isFiniteNumber(pickSuggested.a) && pickSuggested.a !== 0
      ? 1000 / Math.abs(pickSuggested.a)
      : null;
    return {
      ok: isFiniteNumber(ss),
      ss: isFiniteNumber(ss) ? ss : null,
      x1: pickSuggested.x1,
      x2: pickSuggested.x2,
      a: isFiniteNumber(pickSuggested.a) ? pickSuggested.a : null,
      b: isFiniteNumber(pickSuggested.b) ? pickSuggested.b : null,
      r2: pickSuggested.r2,
      decadeSpan: pickSuggested.decadeSpan,
      n: pickSuggested.n,
      reason: isFiniteNumber(ss) ? "ok" : "common.invalid_points",
      detail: {
        yFloor: pickSuggested.yFloor,
        profileUsed: pickSuggested.profileUsed,
        stab: pickSuggested.stab,
        score: pickSuggested.score,
      },
    };
  })();

  return { strict, suggested };
};

export const computeSubthresholdSwingFitInRange = (points, x1, x2) => {
  const sanitized = sanitizeLogPoints(points);
  if (!sanitized.ok) {
    return { ok: false, reason: sanitized.reason ?? "common.invalid_points" };
  }

  const xLo = Number(x1);
  const xHi = Number(x2);
  if (!isFiniteNumber(xLo) || !isFiniteNumber(xHi)) {
    return { ok: false, reason: "manual.range_outside_domain" };
  }
  const lo = Math.min(xLo, xHi);
  const hi = Math.max(xLo, xHi);

  const perSeg = sanitized.segments
    .map((seg) => {
      const xArr = seg.x;
      const yArr = seg.y;
      const indices = [];
      for (let i = 0; i < xArr.length; i++) {
        const x = xArr[i];
        const y = yArr[i];
        if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
        if (x >= lo && x <= hi) indices.push(i);
      }
      if (indices.length < 2) return null;
      const fit = computeLinearFit(xArr, yArr, indices[0], indices[indices.length - 1]);
      if (!fit) return null;
      const stab = computeSlopeStability(xArr, yArr, indices[0], indices[indices.length - 1]);
      return {
        ...fit,
        x1: xArr[indices[0]],
        x2: xArr[indices[indices.length - 1]],
        stab: isFiniteNumber(stab) ? stab : null,
      };
    })
    .filter(Boolean);

  const best = selectBestByScore(
    perSeg.map((r) => ({ ...r, score: r.r2 })).filter(Boolean),
  );
  if (!best) return { ok: false, reason: "manual.range_outside_domain" };

  const ss = isFiniteNumber(best.a) && best.a !== 0 ? 1000 / Math.abs(best.a) : null;
  return {
    ok: isFiniteNumber(ss),
    ss: isFiniteNumber(ss) ? ss : null,
    x1: best.x1,
    x2: best.x2,
    a: isFiniteNumber(best.a) ? best.a : null,
    b: isFiniteNumber(best.b) ? best.b : null,
    r2: best.r2,
    decadeSpan: best.decadeSpan,
    n: best.n,
    reason: isFiniteNumber(ss) ? "ok" : "common.invalid_points",
    detail: { stab: best.stab },
  };
};

export const computeSubthresholdSwingFitInIdWindow = (
  points,
  iLow,
  iHigh,
  { conf = SS_CONF.idw } = {},
) => {
  const low = Number(iLow);
  const high = Number(iHigh);
  if (!isFiniteNumber(low) || !isFiniteNumber(high) || low <= 0 || high <= 0) {
    return { ok: false, reason: "idw.invalid_input" };
  }

  const lo = Math.min(low, high);
  const hi = Math.max(low, high);

  const sanitized = sanitizeLogPoints(points);
  if (!sanitized.ok) {
    return { ok: false, reason: sanitized.reason ?? "common.invalid_points" };
  }

  const segments = sanitized.segments;
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (const seg of segments) {
    for (const v of seg.absI ?? []) {
      if (!isFiniteNumber(v) || v <= 0) continue;
      dataMin = Math.min(dataMin, v);
      dataMax = Math.max(dataMax, v);
    }
  }

  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return { ok: false, reason: "common.invalid_points" };
  }
  if (dataMax < lo || dataMin > hi) {
    return {
      ok: false,
      reason: "idw.out_of_data_range",
      detail: { dataMinAbsI: dataMin, dataMaxAbsI: dataMax },
    };
  }

  const yLo = Math.log10(lo);
  const yHi = Math.log10(hi);

  const perSeg = segments
    .map((seg) => {
      const xArr = seg.x;
      const yArr = seg.y;
      const indices = [];
      for (let i = 0; i < yArr.length; i++) {
        const y = yArr[i];
        if (!isFiniteNumber(y)) continue;
        if (y >= yLo && y <= yHi) indices.push(i);
      }
      if (indices.length < 2) return null;
      const fit = computeLinearFit(xArr, yArr, indices[0], indices[indices.length - 1]);
      if (!fit) return null;
      const stab = computeSlopeStability(xArr, yArr, indices[0], indices[indices.length - 1]);
      return {
        ...fit,
        x1: xArr[indices[0]],
        x2: xArr[indices[indices.length - 1]],
        stab: isFiniteNumber(stab) ? stab : null,
      };
    })
    .filter(Boolean);

  const best = selectBestByScore(
    perSeg.map((r) => ({ ...r, score: r.r2 })).filter(Boolean),
  );
  if (!best) return { ok: false, reason: "idw.too_few_points" };

  const ss = isFiniteNumber(best.a) && best.a !== 0 ? 1000 / Math.abs(best.a) : null;
  const windowRatio = hi / lo;
  const warnNarrow = windowRatio < (conf?.minWindowRatioWarn ?? 10);

  return {
    ok: isFiniteNumber(ss),
    ss: isFiniteNumber(ss) ? ss : null,
    x1: best.x1,
    x2: best.x2,
    a: isFiniteNumber(best.a) ? best.a : null,
    b: isFiniteNumber(best.b) ? best.b : null,
    r2: best.r2,
    decadeSpan: best.decadeSpan,
    n: best.n,
    reason: warnNarrow ? "idw.window_too_narrow" : isFiniteNumber(ss) ? "ok" : "common.invalid_points",
    detail: {
      stab: best.stab,
      dataMinAbsI: dataMin,
      dataMaxAbsI: dataMax,
      windowRatio,
    },
  };
};

export const computeDomain = (seriesList) => {
  if (!Array.isArray(seriesList) || seriesList.length === 0) {
    return { x: [0, 1], y: [0, 1] };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const series of seriesList) {
    for (const point of series?.data ?? []) {
      if (isFiniteNumber(point?.x)) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
      }
      if (isFiniteNumber(point?.y)) {
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  const [x0, x1] = padDomain(
    Number.isFinite(minX) ? minX : 0,
    Number.isFinite(maxX) ? maxX : 1,
  );
  const [y0, y1] = padDomain(
    Number.isFinite(minY) ? minY : 0,
    Number.isFinite(maxY) ? maxY : 1,
  );

  return { x: [x0, x1], y: [y0, y1] };
};

export const classifySsFit = (
  method,
  fit,
  { conf = SS_CONF, idWindowRatio = null } = {},
) => {
  const m = String(method || "").trim();
  const ss = fit?.ss;

  if (!fit?.ok || !isFiniteNumber(ss)) {
    return {
      ss_ok: false,
      ss_confidence: "fail",
      ss_reason: fit?.reason || "common.invalid_points",
    };
  }

  if (m === "legacy") {
    return {
      ss_ok: true,
      ss_confidence: "low",
      ss_reason: "legacy.compare_only",
    };
  }

  if (m === "auto") {
    return { ss_ok: true, ss_confidence: "high", ss_reason: "ok" };
  }

  const r2 = fit?.r2;
  const span = fit?.decadeSpan;
  const n = fit?.n;
  const stab = fit?.detail?.stab ?? fit?.stab ?? null;

  if (m === "manual") {
    const failCfg = conf.manual?.classify?.fail ?? null;
    if (failCfg) {
      if (isFiniteNumber(n) && n < failCfg.minN) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "manual.too_few_points",
        };
      }
      if (isFiniteNumber(span) && span < failCfg.minSpan) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "manual.span_too_small",
        };
      }
      if (isFiniteNumber(r2) && r2 < failCfg.minR2) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "manual.fit_quality_low",
        };
      }
    }

    const highCfg = conf.manual?.classify?.high ?? null;
    if (
      highCfg &&
      isFiniteNumber(r2) &&
      isFiniteNumber(span) &&
      isFiniteNumber(n) &&
      r2 >= highCfg.r2 &&
      span >= highCfg.span &&
      n >= highCfg.n &&
      (highCfg.stab == null ||
        stab == null ||
        (isFiniteNumber(stab) && stab <= highCfg.stab))
    ) {
      return { ss_ok: true, ss_confidence: "high", ss_reason: "ok" };
    }

    const lowCfg = conf.manual?.classify?.low ?? null;
    if (
      lowCfg &&
      isFiniteNumber(r2) &&
      isFiniteNumber(span) &&
      isFiniteNumber(n) &&
      r2 >= lowCfg.r2 &&
      span >= lowCfg.span &&
      n >= lowCfg.n
    ) {
      return {
        ss_ok: true,
        ss_confidence: "low",
        ss_reason: "manual.fit_quality_low",
      };
    }

    return {
      ss_ok: true,
      ss_confidence: "low",
      ss_reason: "manual.fit_quality_low",
    };
  }

  if (m === "idWindow") {
    if (fit?.reason === "idw.window_too_narrow") {
      return {
        ss_ok: true,
        ss_confidence: "low",
        ss_reason: "idw.window_too_narrow",
      };
    }
    if (
      isFiniteNumber(idWindowRatio) &&
      idWindowRatio < (conf.idw?.minWindowRatioWarn ?? 10)
    ) {
      return {
        ss_ok: true,
        ss_confidence: "low",
        ss_reason: "idw.window_too_narrow",
      };
    }

    const failCfg = conf.idw?.classify?.fail ?? null;
    if (failCfg) {
      if (isFiniteNumber(n) && n < failCfg.minN) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "idw.too_few_points",
        };
      }
      if (isFiniteNumber(span) && span < failCfg.minSpan) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "idw.span_too_small",
        };
      }
      if (isFiniteNumber(r2) && r2 < failCfg.minR2) {
        return {
          ss_ok: false,
          ss_confidence: "fail",
          ss_reason: "idw.fit_quality_low",
        };
      }
    }

    const highCfg = conf.idw?.classify?.high ?? null;
    if (
      highCfg &&
      isFiniteNumber(r2) &&
      isFiniteNumber(span) &&
      isFiniteNumber(n) &&
      r2 >= highCfg.r2 &&
      span >= highCfg.span &&
      n >= highCfg.n &&
      (highCfg.stab == null ||
        stab == null ||
        (isFiniteNumber(stab) && stab <= highCfg.stab))
    ) {
      return { ss_ok: true, ss_confidence: "high", ss_reason: "ok" };
    }

    return {
      ss_ok: true,
      ss_confidence: "low",
      ss_reason: "idw.fit_quality_low",
    };
  }

  return {
    ss_ok: true,
    ss_confidence: "low",
    ss_reason: "manual.fit_quality_low",
  };
};
export const formatNumber = (value, { digits = 4 } = {}) => {
  if (!isFiniteNumber(value)) return "—";

  const abs = Math.abs(value);
  if (abs === 0) return "0";

  const trimZeros = (s) =>
    s.includes(".") ? s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : s;

  // Use scientific notation for very large or very small numbers
  if (abs >= 1e4 || abs < 1e-3) {
    return value.toExponential(2);
  }

  if (abs < 1) {
    const magnitude = Math.floor(Math.log10(abs));
    const decimals = Math.min(20, Math.max(0, -magnitude + (digits + 2)));
    return trimZeros(value.toFixed(decimals));
  }

  return trimZeros(value.toFixed(digits));
};
