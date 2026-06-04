import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySsFit,
  computeCentralDerivative,
  computeSubthresholdSwingFitAuto,
  interpolateCurveAtX,
  resolveAutoSsSelection,
  splitBidirectionalCurvePoints,
} from "../../common/firstCalculation.ts";

test("resolveAutoSsSelection falls back to suggested window with low confidence", () => {
  const selection = resolveAutoSsSelection({
    strict: { ok: false, reason: "auto.no_window_meets_strict" },
    suggested: {
      ok: true,
      ss: 92,
      x1: 0.6,
      x2: 1.1,
      r2: 0.991,
      decadeSpan: 0.82,
      n: 10,
      detail: { floorMarginDec: 0.7 },
    },
  });

  assert.equal(selection.source, "suggested");
  assert.equal(selection.classification?.ss_ok, true);
  assert.equal(selection.classification?.ss_confidence, "low");
  assert.equal(selection.classification?.ss_reason, "auto.suggested_window");
  assert.equal(selection.fit?.detail?.autoTier, "suggested");
});

test("classifySsFit keeps manual fits near the current floor below high confidence", () => {
  const cls = classifySsFit("manual", {
    ok: true,
    ss: 88,
    r2: 0.998,
    decadeSpan: 1.2,
    n: 14,
    detail: {
      stab: 0.05,
      floorMarginDec: 0.4,
    },
  });

  assert.equal(cls.ss_ok, true);
  assert.equal(cls.ss_confidence, "low");
  assert.equal(cls.ss_reason, "manual.too_close_to_floor");
});

test("classifySsFit allows manual high confidence only when floor margin is healthy", () => {
  const cls = classifySsFit("manual", {
    ok: true,
    ss: 84,
    r2: 0.998,
    decadeSpan: 1.25,
    n: 16,
    detail: {
      stab: 0.04,
      floorMarginDec: 1.15,
    },
  });

  assert.equal(cls.ss_ok, true);
  assert.equal(cls.ss_confidence, "high");
  assert.equal(cls.ss_reason, "ok");
});

test("computeSubthresholdSwingFitAuto can recover a long strict window beyond the default small window sizes", () => {
  const points = [];

  for (let index = 0; index < 10; index += 1) {
    points.push({
      x: index * 0.05,
      y: 1e-13,
    });
  }

  for (let index = 0; index < 29; index += 1) {
    const x = 0.55 + index * 0.05;
    const logI = -12 + (index / 28) * 1.02;
    points.push({
      x,
      y: 10 ** logI,
    });
  }

  const fit = computeSubthresholdSwingFitAuto(points);

  assert.equal(fit.strict?.ok, true);
  assert.ok((fit.strict?.n ?? 0) > 12);
  assert.ok((fit.strict?.decadeSpan ?? 0) >= 1);
  assert.ok((fit.strict?.detail?.floorMarginDec ?? 0) >= 1);
});

test("interpolateCurveAtX linearly interpolates between neighboring points", () => {
  const sample = interpolateCurveAtX(
    [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ],
    1.5,
  );

  assert.equal(sample?.kind, "interpolated");
  assert.equal(sample?.y, 20);
  assert.deepEqual(sample?.left, { x: 1, y: 10 });
  assert.deepEqual(sample?.right, { x: 2, y: 30 });
});

test("interpolateCurveAtX reports out-of-range queries without extrapolating", () => {
  const sample = interpolateCurveAtX(
    [
      { x: 0, y: 5 },
      { x: 1, y: 15 },
    ],
    2,
  );

  assert.equal(sample?.kind, "outOfRange");
  assert.equal(sample?.y, null);
  assert.deepEqual(sample?.domain, { minX: 0, maxX: 1 });
});

test("interpolateCurveAtX supports log interpolation for positive y", () => {
  const sample = interpolateCurveAtX(
    [
      { x: 0, y: 1e-12 },
      { x: 1, y: 1e-8 },
    ],
    0.5,
    "log",
  );

  assert.equal(sample?.kind, "interpolated");
  assert.ok(Math.abs((sample?.y ?? 0) - 1e-10) / 1e-10 < 1e-12);
});

test("interpolateCurveAtX rejects log interpolation when y is non-positive", () => {
  const sample = interpolateCurveAtX(
    [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
    ],
    0.5,
    "log",
  );

  assert.equal(sample?.kind, "empty");
  assert.equal(sample?.y, null);
});

test("interpolateCurveAtX uses the true domain for bidirectional sweeps", () => {
  const sample = interpolateCurveAtX(
    [
      { x: -1, y: 1e-12 },
      { x: 0, y: 1e-11 },
      { x: 1, y: 1e-8 },
      { x: 2, y: 1e-6 },
      { x: 3, y: 1e-5 },
      { x: 2, y: 8e-7 },
      { x: 1, y: 8e-9 },
      { x: 0, y: 9e-12 },
      { x: -1, y: 1.1e-12 },
    ],
    2,
  );

  assert.equal(sample?.kind, "exact");
  assert.equal(sample?.y, 1e-6);
  assert.deepEqual(sample?.domain, { minX: -1, maxX: 3 });
});

test("splitBidirectionalCurvePoints returns forward and reverse segments", () => {
  const segments = splitBidirectionalCurvePoints([
    { x: -1, y: 1e-12 },
    { x: 0, y: 1e-11 },
    { x: 1, y: 1e-9 },
    { x: 2, y: 1e-6 },
    { x: 1, y: 8e-8 },
    { x: 0, y: 2e-12 },
    { x: -1, y: 1.5e-12 },
  ]);

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.branch, "forward");
  assert.equal(segments[1]?.branch, "reverse");
  assert.deepEqual(
    segments.map((segment) => segment.points.map((point) => point.x)),
    [
      [-1, 0, 1, 2],
      [2, 1, 0, -1],
    ],
  );
});

test("computeCentralDerivative avoids bridging across a bidirectional turning point", () => {
  const derivative = computeCentralDerivative([
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 1, y: 30 },
    { x: 0, y: 31 },
    { x: -1, y: 32 },
  ]);

  assert.equal(derivative.length, 7);
  assert.equal(derivative[3]?.y, 1);
  assert.ok(Number.isFinite(derivative[4]?.y));
  assert.ok((derivative[4]?.y ?? 0) < 0);
});
