import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

﻿/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createParametersViewState,
  formatMetricValue,
  getCurrentTooltip,
  getSsMetricText,
  getSsTooltip,
  getThresholdVoltageTooltip,
  type ParametersFileRecord,
} from "src/cs/workbench/services/parameters/common/parameterModel";

suite("workbench/services/parameters/common/parameterModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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

  test("createParametersViewState reads canonical transfer metrics", () => {
    const state = createParametersViewState(null, createCanonicalFileRecord("transfer"));

    assert.equal(state.kind, "table");
    if (state.kind !== "table") return;
    assert.equal(state.gmMetricHeader, "gm");
    assert.equal(state.showTransferMetrics, true);
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0]?.name, "10 V");
    assert.equal(state.rows[0]?.legendHeader, "Vg");
    assert.equal(state.rows[0]?.ion, 10);
    assert.equal(state.rows[0]?.ioff, 2);
    assert.equal(state.rows[0]?.ionIoff, 5);
    assert.equal(state.rows[0]?.gmMaxAbs, 11);
    assert.equal(state.rows[0]?.thresholdVoltage, 0.42);
    assert.equal(state.rows[0]?.thresholdVoltageElectron, 0.43);
    assert.equal(state.rows[0]?.thresholdVoltageHole, -0.41);
    assert.equal(state.rows[0]?.ss, 87);
    assert.equal(state.rows[0]?.ssConfidence, "high");
  });

  test("createParametersViewState reads canonical output derivative metrics as gds", () => {
    const state = createParametersViewState(null, createCanonicalFileRecord("output"));

    assert.equal(state.kind, "table");
    if (state.kind !== "table") return;
    assert.equal(state.gmMetricHeader, "gds");
    assert.equal(state.showTransferMetrics, false);
    assert.equal(state.rows[0]?.gmMaxAbs, 11);
  });
});

const createCanonicalFileRecord = (
  ivMode: "transfer" | "output",
): ParametersFileRecord => {
  const seriesId = "series-1";
  const curveKey = `base:iv:${ivMode}:series-1`;
  const currentKey = "current:series-1:base";
  const derivativeKey = `derivative:series-1:${ivMode === "transfer" ? "gm" : "gds"}`;
  const thresholdKey = "threshold:series-1:vth";
  const subthresholdKey = "subthreshold:series-1:ss:auto";
  const metricsByKey: ParametersFileRecord["metricsByKey"] = {
    [currentKey]: {
      metricFamily: "current",
      seriesId,
      value: {
        candidateWindows: [],
        ion: 10,
        ionIoff: 5,
        ionWindow: null,
        ioff: 2,
        ioffWindow: null,
        method: "auto",
        xAtIon: 1,
        xAtIoff: 0,
      },
    },
    [derivativeKey]: {
      metricFamily: "derivative",
      seriesId,
      value: {
        maxAbs: 11,
        xAtMaxAbs: 0.7,
      },
    },
    [thresholdKey]: {
      metricFamily: "threshold",
      seriesId,
      value: {
        electron: 0.43,
        hole: -0.41,
        vth: 0.42,
      },
    },
    [subthresholdKey]: {
      metricFamily: "subthreshold",
      seriesId,
      value: {
        confidence: "high",
        method: "auto",
        ss: 87,
        xAtSs: 0.4,
      },
    },
  };

  return {
    curvesByKey: {
      [curveKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        ivMode,
      },
    },
    metricsByKey,
    metricsBySeriesId: {
      [seriesId]: [currentKey, derivativeKey, thresholdKey, subthresholdKey],
    },
    seriesById: {
      [seriesId]: {
        legendValue: "Vg = 10 V",
      },
    },
    seriesOrder: [seriesId],
  };
};
