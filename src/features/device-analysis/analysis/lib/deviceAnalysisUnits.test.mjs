import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeviceAnalysisYUnitMeta,
  normalizeDeviceAnalysisYUnit,
} from "./deviceAnalysisUnits.ts";

test("normalizes capacitance y units instead of falling back to current", () => {
  assert.equal(normalizeDeviceAnalysisYUnit("F", "A"), "F");
  assert.equal(normalizeDeviceAnalysisYUnit("pf", "A"), "pF");
  assert.equal(normalizeDeviceAnalysisYUnit("NF", "A"), "nF");
});

test("scales capacitance display units from base farads", () => {
  assert.deepEqual(getDeviceAnalysisYUnitMeta("F"), {
    value: "F",
    label: "F",
    factor: 1,
  });
  assert.deepEqual(getDeviceAnalysisYUnitMeta("pF"), {
    value: "pF",
    label: "pF",
    factor: 1e12,
  });
});
