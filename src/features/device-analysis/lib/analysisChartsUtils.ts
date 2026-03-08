// @ts-nocheck
export const buildPoints = (xArr, yArr) => {
  if (!xArr || !yArr) return [];
  const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (n <= 0) return [];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const xRaw = xArr[i];
    const yRaw = yArr[i];
    const x = Number.isFinite(xRaw) ? xRaw : null;
    const y = Number.isFinite(yRaw) ? yRaw : null;
    const yAbs = y === null ? null : Math.abs(y);
    out[i] = {
      x,
      y,
      yPositive: y !== null && y > 0 ? y : null,
      yAbsPositive: yAbs !== null && yAbs > 0 ? yAbs : null,
    };
  }
  return out;
};

export const normalizeFloat = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return num;
  return Number(num.toPrecision(12));
};

export const normalizeVarToken = (token) => {
  const t = String(token || "").trim().toLowerCase();
  return t === "vg" || t === "vd" ? t : null;
};

export const varTokenToSymbol = (token) => {
  if (token === "vg") return "Vg";
  if (token === "vd") return "Vd";
  return null;
};

// Origin-like: choose a "nice" step (1/2/2.5/5/10 Ã— 10^k), then snap endpoints to multiples of step.
// When preferTightRange is true, prioritize minimizing extra expansion beyond the requested domain.
export const buildNiceTicks = (
  minRaw,
  maxRaw,
  desiredTickCount = 6,
  { preferTightRange = false } = {},
) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  // Avoid degenerate ranges.
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad * 0.5;
    hi += pad * 0.5;
  }

  const safeSpan = hi - lo;
  const target = Math.max(2, Math.floor(desiredTickCount));
  const roughStep = safeSpan / (target - 1);
  if (!Number.isFinite(roughStep) || roughStep <= 0) return null;

  const exp = Math.floor(Math.log10(Math.abs(roughStep)));
  const base = Math.pow(10, exp);
  const candidates = [1, 2, 2.5, 5, 10];
  const maxExpandRatio = preferTightRange ? 0.35 : 0.75;
  const maxTickCount = preferTightRange ? 11 : 15;

  const stepPenalty = (step) => {
    // Prefer steps that can be represented with fewer decimal places.
    const abs = Math.abs(step);
    if (!(abs > 0)) return 100;
    for (let digits = 0; digits <= 8; digits++) {
      const rounded = Number(abs.toFixed(digits));
      if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
    }
    return 9;
  };

  let best = null;
  for (const mantissa of candidates) {
    const step = normalizeFloat(mantissa * base);
    if (!(step > 0)) continue;

    const snappedMin = normalizeFloat(Math.floor(lo / step) * step);
    const snappedMax = normalizeFloat(Math.ceil(hi / step) * step);
    const span = snappedMax - snappedMin;
    if (!(span > 0)) continue;

    const count = Math.round(span / step) + 1;
    const expandRatio = (span - safeSpan) / safeSpan;
    if (count > maxTickCount) continue;
    if (preferTightRange && expandRatio > maxExpandRatio) continue;

    // Primary: closeness to desired tick count; Secondary: minimal extra blank space; Tertiary: fewer decimals.
    const score =
      (preferTightRange
        ? Math.max(0, expandRatio) * 30
        : Math.abs(count - target) * 10) +
      (preferTightRange
        ? Math.abs(count - target) * 2
        : Math.max(0, expandRatio) * 2) +
      stepPenalty(step) * 0.25;

    if (!best || score < best.score) {
      best = { score, step, snappedMin, snappedMax };
    }
  }

  if (!best && preferTightRange) {
    // Fallback: relax constraints if everything got filtered out.
    return buildNiceTicks(minRaw, maxRaw, desiredTickCount, {
      preferTightRange: false,
    });
  }
  if (!best) return null;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = normalizeFloat(best.snappedMin + best.step * i);
    if (v > best.snappedMax + best.step * 0.5) break;
    out.push(v);
  }

  return out.length >= 2 ? out : null;
};

// Origin-like "Auto": balances (1) tick count closeness and (2) snapped endpoints, instead of enforcing a tight range.
// Heuristic notes:
// - Origin typically snaps axis endpoints to "nice" multiples of a "nice" step.
// - It also tries to keep the number of major ticks in a reasonable band (often ~5â€?),
//   but will deviate if doing so would cause excessive expansion.
export const buildOriginAutoTicks = (minRaw, maxRaw, desiredTickCount = 6) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  // Avoid degenerate ranges.
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad * 0.5;
    hi += pad * 0.5;
  }

  const safeSpan = hi - lo;
  const target = Math.max(2, Math.floor(desiredTickCount));
  const roughStep = safeSpan / (target - 1);
  if (!Number.isFinite(roughStep) || roughStep <= 0) return null;

  const exp0 = Math.floor(Math.log10(Math.abs(roughStep)));
  const expCandidates = [exp0 - 1, exp0, exp0 + 1];
  const mantissas = [1, 2, 2.5, 5, 10];

  const maxTickCount = 15;
  const maxExpandRatio = 2.0;

  const stepPenalty = (step) => {
    const abs = Math.abs(step);
    if (!(abs > 0)) return 100;
    for (let digits = 0; digits <= 8; digits++) {
      const rounded = Number(abs.toFixed(digits));
      if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
    }
    return 9;
  };

  const bandPenalty = (count) => {
    // Prefer a typical "auto" band, but don't hard-reject.
    const minBand = 5;
    const maxBand = 7;
    if (count < minBand) return (minBand - count) * 3;
    if (count > maxBand) return (count - maxBand) * 3;
    return 0;
  };

  let best = null;
  for (const exp of expCandidates) {
    const base = Math.pow(10, exp);
    for (const mantissa of mantissas) {
      const step = normalizeFloat(mantissa * base);
      if (!(step > 0)) continue;

      const snappedMin = normalizeFloat(Math.floor(lo / step) * step);
      const snappedMax = normalizeFloat(Math.ceil(hi / step) * step);
      const span = snappedMax - snappedMin;
      if (!(span > 0)) continue;

      const count = Math.round(span / step) + 1;
      if (count > maxTickCount) continue;

      const expandRatio = (span - safeSpan) / safeSpan;
      if (expandRatio > maxExpandRatio) continue;

      const leftPad = lo - snappedMin;
      const rightPad = snappedMax - hi;
      const balancePenalty =
        safeSpan > 0 ? Math.abs(leftPad - rightPad) / safeSpan : 0;

      const score =
        Math.abs(count - target) * 10 +
        bandPenalty(count) * 2 +
        Math.max(0, expandRatio) * 7 +
        balancePenalty * 0.5 +
        stepPenalty(step) * 0.25;

      if (!best || score < best.score) {
        best = { score, step, snappedMin, snappedMax };
      }
    }
  }

  if (!best) return null;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = normalizeFloat(best.snappedMin + best.step * i);
    if (v > best.snappedMax + best.step * 0.5) break;
    out.push(v);
  }

  return out.length >= 2 ? out : null;
};

export const inferTickDigitsFromTicks = (ticks) => {
  if (!Array.isArray(ticks) || ticks.length < 2) return 4;
  const step = Math.abs(Number(ticks[1]) - Number(ticks[0]));
  if (!Number.isFinite(step) || step <= 0) return 4;

  const abs = normalizeFloat(step);
  for (let digits = 0; digits <= 8; digits++) {
    const rounded = Number(abs.toFixed(digits));
    if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
  }
  return 4;
};

export const computeLabelInterval = (ticks, maxLabels = 7) => {
  const n = Array.isArray(ticks) ? ticks.length : 0;
  if (n <= maxLabels) return 0;
  // Recharts interval: number of ticks to skip between labels.
  return Math.max(0, Math.ceil(n / maxLabels) - 1);
};

export const parseOptionalNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

export const padLinearDomain = (min, max) => {
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

export const padLogDomain = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [1e-3, 1];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= 0) return [1e-3, 1];
  const safeLo = lo > 0 ? lo : hi / 1000;
  if (safeLo === hi) return [safeLo / 1.25, hi * 1.25];
  return [safeLo / 1.1, hi * 1.1];
};

export const computeMinMax = (seriesList, { yKey = "y" } = {}) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const resolvedYKey = typeof yKey === "string" && yKey ? yKey : "y";

  for (const series of seriesList ?? []) {
    for (const point of series?.data ?? []) {
      const x = point?.x;
      const y = point?.[resolvedYKey];
      if (typeof x === "number" && Number.isFinite(x)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (typeof y === "number" && Number.isFinite(y)) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    minX: Number.isFinite(minX) ? minX : null,
    maxX: Number.isFinite(maxX) ? maxX : null,
    minY: Number.isFinite(minY) ? minY : null,
    maxY: Number.isFinite(maxY) ? maxY : null,
  };
};

export const buildStepTicks = (minRaw, maxRaw, stepRaw) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  const step = Number(stepRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step))
    return null;
  if (step <= 0) return null;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);

  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;

  const out = [];
  const maxIterations = 200;
  for (let i = 0; i < maxIterations; i++) {
    const v = start + step * i;
    if (v > end + step * 0.5) break;
    out.push(Number(v.toPrecision(12)));
  }
  return out.length >= 2 ? out : null;
};

export const buildLogTicks = (minRaw, maxRaw, decadeStepRaw = 1) => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  const decadeStep = Math.max(1, Math.floor(Number(decadeStepRaw) || 1));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= 0) return null;

  const safeLo = lo > 0 ? lo : hi / 1000;
  const expMin = Math.floor(Math.log10(safeLo));
  const expMax = Math.ceil(Math.log10(hi));

  const out = [];
  for (let e = expMin; e <= expMax; e += decadeStep) {
    out.push(Math.pow(10, e));
  }
  return out.length >= 2 ? out : null;
};

export const preserveScrollPosition = (action) => {
  if (typeof window === "undefined") return action();
  const x = window.scrollX;
  const y = window.scrollY;
  action();
  // Prevent layout shifts (e.g. active badge moving) from causing page jumps.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(x, y);
    });
  });
};
