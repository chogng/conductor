import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

﻿/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
  BaseCurveKey,
  FileRecord,
  MetricKey,
} from "src/cs/workbench/services/session/common/sessionModel";

import {
  createParametersViewState,
  formatMetricValue,
  getCurrentTooltip,
  getSsMetricText,
  getSsTooltip,
  getThresholdVoltageTooltip,
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
): FileRecord => {
  const fileId = "file-a";
  const seriesId = "series-1";
  const curveKey = `base:iv:${ivMode}:series-1` as BaseCurveKey;
  const currentKey = "current:series-1:base" as MetricKey;
  const derivativeKey = `derivative:series-1:${ivMode === "transfer" ? "gm" : "gds"}` as MetricKey;
  const thresholdKey = "threshold:series-1:vth" as MetricKey;
  const subthresholdKey = "subthreshold:series-1:ss:auto" as MetricKey;
  const inputCurve = {
    curveKey,
    fileId,
    seriesId,
    signature: "base-signature",
  };
  const metricBase = {
    fileId,
    inputCurves: [inputCurve],
    inputSignatures: ["base-signature"],
    seriesId,
  };
  const metricsByKey: FileRecord["metricsByKey"] = {
    [currentKey]: {
      ...metricBase,
      contextKey: "base",
      key: currentKey,
      metricFamily: "current",
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
      ...metricBase,
      contextKey: ivMode === "transfer" ? "gm" : "gds",
      key: derivativeKey,
      metricFamily: "derivative",
      value: {
        kind: ivMode === "transfer" ? "gm" : "gds",
        maxAbs: 11,
        xAtMaxAbs: 0.7,
      },
    },
    [thresholdKey]: {
      ...metricBase,
      contextKey: "vth",
      key: thresholdKey,
      metricFamily: "threshold",
      value: {
        electron: 0.43,
        fitQuality: "good",
        hole: -0.41,
        vth: 0.42,
      },
    },
    [subthresholdKey]: {
      ...metricBase,
      contextKey: "ss:auto",
      key: subthresholdKey,
      metricFamily: "subthreshold",
      value: {
        confidence: "high",
        method: "auto",
        ss: 87,
        xAtSs: 0.4,
      },
    },
  };

  return {
    assessmentsByRawTableId: {},
    curvesByKey: {
      [curveKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode,
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId },
          curveGeneration: "base",
          ivMode,
        },
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 10 },
        ],
        domain: {
          x: [0, 1],
          y: [1, 10],
        },
        seriesId,
        signature: "base-signature",
      },
    },
    id: fileId,
    kind: "unknown",
    latestTemplateRunId: "run-a",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey,
    name: "file-a.csv",
    metricsBySeriesId: {
      [seriesId]: [currentKey, derivativeKey, thresholdKey, subthresholdKey],
    },
    raw: {
      fileId,
      fileName: "file-a.csv",
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {
      [seriesId]: {
        fileId,
        groupIndex: 0,
        id: seriesId,
        legendValue: "Vg = 10 V",
        y: [1, 10],
      },
    },
    seriesOrder: [seriesId],
    templateRunsById: {
      "run-a": {
        appliedAt: 1,
        config: {
          stopOnError: false,
          xColumns: [0],
          xDataEnd: 1,
          xDataStart: 0,
          xSegmentationMode: "auto",
          xUnit: "V",
          yColumns: [1],
          yLegendTarget: "auto",
          yUnit: "A",
        },
        configFingerprint: "config-a",
        errors: [],
        fileId,
        id: "run-a",
        mode: "auto",
        outputCurveKeys: [curveKey],
        outputSeriesIds: [seriesId],
        selection: { kind: "auto" },
        sourceBlockIds: [],
        warnings: [],
      },
    },
  };
};
