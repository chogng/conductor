import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMetricValue,
  getCurrentTooltip,
  getSsMetricText,
  getSsTooltip,
  getThresholdVoltageTooltip,
} from "./parametersModel.ts";

const row = {
  gmMaxAbs: 1,
  ion: 2,
  ionIoff: 3,
  ioff: 4,
  jon: 5,
  name: "curve",
  ss: null,
  ssConfidence: "fail",
  thresholdVoltage: null,
  thresholdVoltageElectron: 0.7,
  thresholdVoltageHole: -0.6,
  xAtGmMaxAbs: 6,
  xAtIon: 7,
  xAtIoff: 8,
  xAtSs: null,
};

test("formatMetricValue formats metric numbers with fallback", () => {
  assert.equal(formatMetricValue(1.23456, 2), "1.23");
  assert.equal(formatMetricValue(null), "-");
});

test("getSsMetricText shows failed SS without a numeric value", () => {
  assert.equal(getSsMetricText(null, "fail"), "Fail");
  assert.equal(getSsMetricText(null, "low"), "-");
  assert.equal(getSsMetricText(78.912, "high"), "78.91");
});

test("tooltip helpers suppress pending values", () => {
  assert.equal(getCurrentTooltip(() => "ready", true, row, "ion"), "");
  assert.equal(getCurrentTooltip(() => "ready", false, row, "ion"), "ready");
  assert.equal(getSsTooltip(() => "ss", true, row), "");
  assert.equal(getSsTooltip(() => "ss", false, row), "ss");
});

test("getThresholdVoltageTooltip reports both Vth branches", () => {
  assert.equal(getThresholdVoltageTooltip(row, true), "");
  assert.equal(
    getThresholdVoltageTooltip(row, false),
    "sqrt(|Id|)-Vg linear extrapolation: Vth,e=0.7, Vth,h=-0.6",
  );
});
