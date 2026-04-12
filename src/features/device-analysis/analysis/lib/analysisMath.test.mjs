import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySsFit,
  computeSubthresholdSwingFitAuto,
  resolveAutoSsSelection,
} from "./analysisMath.ts";

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
