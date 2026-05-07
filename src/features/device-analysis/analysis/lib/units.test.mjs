import assert from "node:assert/strict";
import test from "node:test";

import {
  getYUnitMeta,
  normalizeYUnit,
} from "./units.ts";

test("normalizes capacitance y units instead of falling back to current", () => {
  assert.equal(normalizeYUnit("F", "A"), "F");
  assert.equal(normalizeYUnit("pf", "A"), "pF");
  assert.equal(normalizeYUnit("NF", "A"), "nF");
});

test("scales capacitance display units from base farads", () => {
  assert.deepEqual(getYUnitMeta("F"), {
    value: "F",
    label: "F",
    factor: 1,
  });
  assert.deepEqual(getYUnitMeta("pF"), {
    value: "pF",
    label: "pF",
    factor: 1e12,
  });
});
