import assert from "node:assert/strict";
import test from "node:test";
import {
  SIGNED_LOG_Y_DATA_KEY,
  withSignedLogPositivePoints,
} from "./chartViewModel.ts";
import {
  collectCanvasLineRuns,
  toFiniteCanvasNumber,
  valueToCanvasY,
} from "./canvasPlot.ts";

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

test("withSignedLogPositivePoints preserves both current polarities for log display", () => {
  const points = [
    { x: 0, y: -1e-12 },
    { x: 0.1, y: 2e-12 },
    { x: 0.2, y: -5e-6 },
    { x: 0.3, y: -8e-6 },
  ];
  const converted = withSignedLogPositivePoints(points);

  assert.equal(converted[0][SIGNED_LOG_Y_DATA_KEY], 1e-12);
  assert.equal(converted[1][SIGNED_LOG_Y_DATA_KEY], 2e-12);
  assert.equal(converted[2][SIGNED_LOG_Y_DATA_KEY], 5e-6);
  assert.equal(converted[3][SIGNED_LOG_Y_DATA_KEY], 8e-6);
});

test("signed log line runs break at opposite-sign noise points", () => {
  const converted = withSignedLogPositivePoints([
    { x: 0, y: -1e-12 },
    { x: 0.1, y: -2e-12 },
    { x: 0.2, y: 3e-12 },
    { x: 0.3, y: -4e-12 },
    { x: 0.4, y: -1e-5 },
  ]).map((point) => ({
    ...point,
    __chartSign: point.ySignedLogSign,
    __chartY:
      point[SIGNED_LOG_Y_DATA_KEY] === null
        ? null
        : Math.log10(point[SIGNED_LOG_Y_DATA_KEY]),
  }));

  const runs = collectCanvasLineRuns({
    chartYDataKey: "__chartY",
    data: converted,
    effectiveYScale: "log",
    xMin: -1,
    xMax: 1,
  });

  assert.deepEqual(runs, [
    [
      { x: 0, y: -12 },
      { x: 0.1, y: Math.log10(2e-12) },
    ],
    [
      { x: 0.2, y: Math.log10(3e-12) },
    ],
    [
      { x: 0.3, y: Math.log10(4e-12) },
      { x: 0.4, y: -5 },
    ],
  ].filter((run) => run.length >= 2));
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
