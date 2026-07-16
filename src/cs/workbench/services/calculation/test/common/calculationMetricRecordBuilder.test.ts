/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createCalculatedMetricRecords } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type {
	CalculationRecordsInput,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import type { MetricKey } from "src/cs/workbench/services/session/common/sessionModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/calculation/test/common/calculationMetricRecordBuilder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates resource-neutral metric records from base curves", () => {
    const records = createCalculatedMetricRecords(
      createTransferInputForTest([0, 1], [1e-9, 1e-6]),
    );

    assert.deepEqual(records.map(record => record.key), [
      "current:series-1:base",
      "derivative:series-1:gm",
      "subthreshold:series-1:ss:auto",
    ]);
    const current = records.find(record => record.metricFamily === "current");
    assert.equal(Object.prototype.hasOwnProperty.call(current ?? {}, "fileId"), false);
    assert.equal(current?.seriesId, "series-1");
    assert.equal(current?.inputCurves[0]?.curveKey, "base:iv:transfer:series-1");
    assert.equal(current?.inputSignatures.length, 1);
    assert.equal(current?.metricFamily === "current" ? current.value.method : null, "auto");

    const derivative = records.find(record => record.metricFamily === "derivative");
    assert.equal(
      derivative?.metricFamily === "derivative" ? derivative.value.kind : null,
      "gm",
    );
  });

  test("uses precomputed derivative points for derivative metrics", () => {
    const records = createCalculatedMetricRecords(
      createTransferInputForTest([0, 1, 2], [1, 2, 4]),
      {
        derivativePointsBySeriesId: {
          "series-1": [{ x: 0.5, y: 42 }],
        },
      },
    );
    const derivative = records.find(record => record.metricFamily === "derivative");

    assert.equal(
      derivative?.metricFamily === "derivative" ? derivative.value.maxAbs : null,
      42,
    );
    assert.equal(
      derivative?.metricFamily === "derivative" ? derivative.value.xAtMaxAbs : null,
      0.5,
    );
  });

  test("uses normalized Rust analysis for automatic current and SS metrics", () => {
    const records = createCalculatedMetricRecords(
      createTransferInputForTest(
        [0, 0.5, 1],
        [1e-9, 1e-7, 1e-5],
      ),
      {
        analysisBySeriesId: {
          "series-1": {
            baseCurrent: {
              candidateWindows: [],
              ioff: 2,
              ioffWindow: null,
              ion: 10,
              ionIoff: 5,
              ionWindow: null,
              method: "auto",
              xAtIoff: 0,
              xAtIon: 1,
            },
            gm: [{ x: 0.25, y: -42 }],
            ssFitAuto: {
              strict: {
                ok: true,
                ss: 84,
                x1: 0.25,
                x2: 0.75,
              },
            },
          },
        },
      },
    );
    const current = records.find(record => record.metricFamily === "current");
    const derivative = records.find(record => record.metricFamily === "derivative");
    const subthreshold = records.find(record => record.metricFamily === "subthreshold");

    assert.equal(
      current?.metricFamily === "current" ? current.value.ion : null,
      10,
    );
    assert.equal(
      derivative?.metricFamily === "derivative" ? derivative.value.maxAbs : null,
      42,
    );
    assert.equal(
      subthreshold?.metricFamily === "subthreshold" ? subthreshold.value.ss : null,
      84,
    );
    assert.equal(
      subthreshold?.metricFamily === "subthreshold" ? subthreshold.value.xAtSs : null,
      0.5,
    );
  });

  test("applies canonical manual metric inputs during metric generation", () => {
    const xValues = Array.from({ length: 21 }, (_value, index) => index / 20);
    const input = createTransferInputForTest(
      xValues,
      xValues.map((x) => 10 ** (-12 + x * 2)),
    );
    const currentKey = "current:series-1:base" as MetricKey;
    const manualSsKey = "subthreshold:series-1:ss:manual" as MetricKey;
    const withMetricInputs: CalculationRecordsInput = {
      ...input,
      metricInputsByKey: {
        [currentKey]: {
          metricKey: currentKey,
          seriesId: "series-1",
          source: "manual" as const,
          targets: {
            ionX: 0.9,
            ioffX: 0.1,
          },
        },
        [manualSsKey]: {
          metricKey: manualSsKey,
          seriesId: "series-1",
          source: "manual" as const,
          range: {
            x1: 0.25,
            x2: 0.75,
          },
        },
      },
    };

    const records = createCalculatedMetricRecords(withMetricInputs);
    const current = records.find(record => record.metricFamily === "current");
    const subthreshold = records.find(record => record.metricFamily === "subthreshold");

    assert.equal(current?.metricFamily === "current" ? current.value.method : null, "manual");
    assert.equal(current?.metricFamily === "current" ? current.value.xAtIon : null, 0.9);
    assert.equal(current?.metricFamily === "current" ? current.value.xAtIoff : null, 0.1);
    assert.ok(current?.inputSignatures.some(signature => signature.includes(currentKey)));

    assert.equal(subthreshold?.key, manualSsKey);
    assert.equal(
      subthreshold?.metricFamily === "subthreshold" ? subthreshold.value.method : null,
      "manual",
    );
    assert.equal(
      subthreshold?.metricFamily === "subthreshold" ? subthreshold.value.confidence : null,
      "low",
    );
    assert.equal(
      subthreshold?.metricFamily === "subthreshold" ? subthreshold.value.xAtSs : null,
      0.5,
    );
    assert.ok(subthreshold?.inputSignatures.some(signature => signature.includes(manualSsKey)));
  });
});

const createTransferInputForTest = (
  x: readonly number[],
  y: readonly number[],
): CalculationRecordsInput => ({
  axis: {
    xAxisRole: "vg",
    xLabel: "Gate Voltage",
    xUnit: "V",
    yLabel: "Drain Current",
    yUnit: "A",
  },
  baseCurvesByKey: {
    "base:iv:transfer:series-1": {
      curveFamily: "iv",
      curveGeneration: "base",
      domain: {
        x: [Math.min(...x), Math.max(...x)],
        y: [Math.min(...y), Math.max(...y)],
      },
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { seriesId: "series-1" },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: x.map((xValue, index) => ({
        x: xValue,
        y: y[index] ?? Number.NaN,
      })),
      seriesId: "series-1",
      signature: "series-1",
    },
  },
  seriesById: {
    "series-1": {
      groupIndex: 0,
      id: "series-1",
      y,
    },
  },
  seriesOrder: ["series-1"],
});
