import test from "node:test";
import assert from "node:assert/strict";

import { locateSeriesAtX } from "../../browser/mainPlotLocatorModel.ts";

const createSeries = (overrides = {}) => ({
  id: "series-a",
  name: "Vg=0",
  data: [
    { x: 0, y: 0 },
    { x: 1, y: 10 },
    { x: 2, y: 20 },
  ],
  ...overrides,
});

test("locateSeriesAtX returns exact y values for each series", () => {
  const results = locateSeriesAtX([
    createSeries(),
    createSeries({
      id: "series-b",
      name: "Vg=1",
      data: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
      ],
    }),
  ], 1);

  assert.deepEqual(
    results.map((result) => [result.seriesName, result.status, result.y]),
    [
      ["Vg=0", "ready", 10],
      ["Vg=1", "ready", 3],
    ],
  );
});

test("locateSeriesAtX interpolates between adjacent points", () => {
  const results = locateSeriesAtX([createSeries()], 0.25);

  assert.equal(results[0].status, "ready");
  assert.equal(results[0].y, 2.5);
});

test("locateSeriesAtX handles descending or unsorted x points", () => {
  const results = locateSeriesAtX([
    createSeries({
      data: [
        { x: 2, y: 20 },
        { x: 0, y: 0 },
        { x: 1, y: 10 },
      ],
    }),
  ], 1.5);

  assert.equal(results[0].status, "ready");
  assert.equal(results[0].y, 15);
});

test("locateSeriesAtX marks missing or out-of-range series", () => {
  const results = locateSeriesAtX([
    createSeries({ data: [] }),
    createSeries(),
  ], 3);

  assert.deepEqual(
    results.map((result) => [result.status, result.y]),
    [
      ["empty", null],
      ["outOfRange", null],
    ],
  );
});

test("locateSeriesAtX ignores non-finite points", () => {
  const results = locateSeriesAtX([
    createSeries({
      data: [
        { x: 0, y: 0 },
        { x: 1, y: null },
        { x: 2, y: 20 },
      ],
    }),
  ], 1);

  assert.equal(results[0].status, "ready");
  assert.equal(results[0].y, 10);
});
