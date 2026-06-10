/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

type TickBuilderOptions = {
  preferTightRange?: boolean;
};

type NiceTickCandidate = {
  score: number;
  step: number;
  snappedMin: number;
  snappedMax: number;
};

export const normalizeFloat = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return num;
  return Number(num.toPrecision(12));
};

// Origin-like: choose a "nice" step (1/2/2.5/5/10 * 10^k), then snap endpoints to multiples of step.
// When preferTightRange is true, prioritize minimizing extra expansion beyond the requested domain.
export const buildNiceTicks = (
  minRaw: unknown,
  maxRaw: unknown,
  desiredTickCount = 6,
  { preferTightRange = false }: TickBuilderOptions = {},
): number[] | null => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

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

  const stepPenalty = (step: number): number => {
    const abs = Math.abs(step);
    if (!(abs > 0)) return 100;
    for (let digits = 0; digits <= 8; digits++) {
      const rounded = Number(abs.toFixed(digits));
      if (Math.abs(rounded - abs) <= Math.max(1e-12, abs * 1e-9)) return digits;
    }
    return 9;
  };

  let best: NiceTickCandidate | null = null;
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

export const padLinearDomain = (
  min: unknown,
  max: unknown,
): [number, number] => {
  const minValue = Number(min);
  const maxValue = Number(max);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [0, 1];
  const lo = Math.min(minValue, maxValue);
  const hi = Math.max(minValue, maxValue);
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  const pad = span * 0.05;
  return [lo - pad, hi + pad];
};
