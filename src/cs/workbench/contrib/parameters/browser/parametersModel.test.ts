import assert from "assert";

import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

import {
  createParametersViewState,
  formatMetricValue,
  getCurrentTooltip,
  getSsMetricText,
  getSsTooltip,
  getThresholdVoltageTooltip,
} from "./parametersModel.ts";

suite("workbench/contrib/parameters/browser/parametersModel", () => {
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

  test("createParametersViewState returns empty state without parameter input", () => {
    const state = createParametersViewState(null);

    assert.equal(state.kind, "empty");
  });

  test("createParametersViewState returns empty state for unsupported curve types", () => {
    const state = createParametersViewState({
      curveType: "cv",
      series: [{ y: [1, 2, 3] }],
      xGroups: [[0, 1, 2]],
    });

    assert.equal(state.kind, "empty");
  });

  test("createParametersViewState labels output derivative metrics as gds", () => {
    const state = createParametersViewState(createFile("output", "vd"));

    assert.equal(state.kind, "table");
    if (state.kind !== "table") return;
    assert.equal(state.gmMetricHeader, "gds");
    assert.equal(state.showTransferMetrics, false);
    assert.equal(state.rows.length, 1);
  });

  test("createParametersViewState labels transfer derivative metrics as gm", () => {
    const state = createParametersViewState(createFile("transfer", "vg"));

    assert.equal(state.kind, "table");
    if (state.kind !== "table") return;
    assert.equal(state.gmMetricHeader, "gm");
    assert.equal(state.showTransferMetrics, true);
  });
});

const createFile = (
  curveType: string,
  xAxisRole: NonNullable<CleanedEntry["xAxisRole"]>,
): CleanedEntry => ({
  curveType,
  series: [{ name: "curve", y: [1, 3, 6] }],
  xAxisRole,
  xGroups: [[0, 1, 2]],
});
