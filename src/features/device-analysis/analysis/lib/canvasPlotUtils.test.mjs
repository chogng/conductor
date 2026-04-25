import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCanvasLineRuns,
  toFiniteCanvasNumber,
  valueToCanvasY,
} from "./canvasPlotUtils.ts";

test("toFiniteCanvasNumber preserves null-like canvas gaps", () => {
  assert.equal(toFiniteCanvasNumber(null), null);
  assert.equal(toFiniteCanvasNumber(undefined), null);
  assert.equal(toFiniteCanvasNumber(""), null);
  assert.equal(toFiniteCanvasNumber("not-a-number"), null);
  assert.equal(toFiniteCanvasNumber(0), 0);
  assert.equal(toFiniteCanvasNumber("0"), 0);
  assert.equal(toFiniteCanvasNumber("-12.5"), -12.5);
});

test("valueToCanvasY does not coerce log nulls into zero", () => {
  assert.equal(valueToCanvasY({ __chartY: null }, "__chartY"), null);
  assert.equal(valueToCanvasY({ __chartY: 0 }, "__chartY"), 0);
});

test("collectCanvasLineRuns breaks log paths at invalid chart y values", () => {
  const runs = collectCanvasLineRuns({
    chartYDataKey: "__chartY",
    data: [
      { x: -1, __chartY: -12 },
      { x: -0.9, __chartY: null },
      { x: -0.8, __chartY: -11 },
      { x: -0.7, __chartY: -10 },
      { x: -0.6, __chartY: "" },
      { x: -0.5, __chartY: -9 },
    ],
    effectiveYScale: "log",
    xMin: -2,
    xMax: 2,
  });

  assert.deepEqual(runs, [
    [
      { x: -0.8, y: -11 },
      { x: -0.7, y: -10 },
    ],
  ]);
});

test("collectCanvasLineRuns does not connect across bidirectional log sweep turns", () => {
  const runs = collectCanvasLineRuns({
    chartYDataKey: "__chartY",
    data: [
      { x: 0, __chartY: -12 },
      { x: 1, __chartY: -11 },
      { x: 2, __chartY: -10 },
      { x: 1, __chartY: -9 },
      { x: 0, __chartY: -8 },
    ],
    effectiveYScale: "log",
    xMin: -1,
    xMax: 3,
  });

  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], [
    { x: 0, y: -12 },
    { x: 1, y: -11 },
    { x: 2, y: -10 },
  ]);
  assert.deepEqual(runs[1], [
    { x: 2, y: -10 },
    { x: 1, y: -9 },
    { x: 0, y: -8 },
  ]);
});
