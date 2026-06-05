import assert from "node:assert/strict";
import test from "node:test";

import {
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeYUnit,
} from "../../common/units.ts";

test("normalizes capacitance y units instead of falling back to current", () => {
  assert.equal(normalizeYUnit("F", "A"), "F");
  assert.equal(normalizeYUnit("pf", "A"), "pF");
  assert.equal(normalizeYUnit("NF", "A"), "nF");
});

test("normalizes current unit aliases and safe fallbacks", () => {
  assert.equal(normalizeYUnit("µA", "A"), "uA");
  assert.equal(normalizeYUnit("μA", "A"), "uA");
  assert.equal(normalizeYUnit("unknown", "nA"), "nA");
  assert.equal(normalizeYUnit("", "bad"), "");
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

test("normalizes x units and scales millivolts", () => {
  assert.equal(normalizeXUnit("mv", "V"), "mV");
  assert.equal(normalizeXUnit("unknown", "mV"), "mV");
  assert.equal(normalizeXUnit("", "bad"), "");
  assert.deepEqual(getXUnitMeta("mV"), {
    value: "mV",
    label: "mV",
    factor: 1e3,
  });
});
