/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  getYUnitValuesForFamily,
  getXUnitValuesForFamily,
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeXUnitForFamily,
  normalizeYUnit,
  normalizeYUnitForFamily,
} from "src/cs/workbench/services/plot/common/units";

suite("workbench/services/plot/common/units", () => {
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

  test("filters y units by compatible unit family", () => {
    assert.deepEqual(getYUnitValuesForFamily("A"), ["A", "mA", "uA", "nA", "pA"]);
    assert.deepEqual(getYUnitValuesForFamily("F"), ["F", "mF", "uF", "nF", "pF"]);
    assert.equal(normalizeYUnitForFamily("mA", "A"), "mA");
    assert.equal(normalizeYUnitForFamily("pF", "A"), "");
    assert.equal(normalizeYUnitForFamily("pF", "F"), "pF");
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
    assert.equal(normalizeXUnit("µV", "V"), "uV");
    assert.equal(normalizeXUnit("unknown", "mV"), "mV");
    assert.equal(normalizeXUnit("", "bad"), "");
    assert.deepEqual(getXUnitMeta("mV"), {
      value: "mV",
      label: "mV",
      factor: 1e3,
    });
  });

  test("filters x units by voltage or frequency family", () => {
    assert.deepEqual(getXUnitValuesForFamily("V"), ["V", "mV", "uV", "kV"]);
    assert.deepEqual(getXUnitValuesForFamily("Hz"), ["Hz", "kHz", "MHz", "GHz"]);
    assert.equal(normalizeXUnitForFamily("kHz", "Hz"), "kHz");
    assert.equal(normalizeXUnitForFamily("mV", "Hz"), "");
    assert.deepEqual(getXUnitMeta("kHz"), {
      value: "kHz",
      label: "kHz",
      factor: 1e-3,
    });
  });
});
