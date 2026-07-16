/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import type { MetricKey } from "src/cs/workbench/services/session/common/sessionModel";
import {
  addSliceOutputToRecordsForTest,
  createFileRecordsForTest,
} from "src/cs/workbench/services/session/test/common/sessionTestRecords";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/calculation/test/common/calculationMetricRecordBuilder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates canonical metric records from session base curves", () => {
    const recordsWithBaseCurves = createTransferRecordsForTest([0, 1], [1e-9, 1e-6]);

    const recordsByFileId = createCalculatedMetricRecordsByFile(
      recordsWithBaseCurves.filesById,
      recordsWithBaseCurves.fileOrder,
    );
    const records = recordsByFileId["file-a"] ?? [];

    assert.deepEqual(records.map(record => record.key), [
      "current:series-1:base",
      "derivative:series-1:gm",
      "subthreshold:series-1:ss:auto",
    ]);
    const current = records.find(record => record.metricFamily === "current");
    assert.equal(current?.fileId, "file-a");
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
    const recordsWithBaseCurves = createTransferRecordsForTest([0, 1, 2], [1, 2, 4]);

    const records = createCalculatedMetricRecordsByFile(
      recordsWithBaseCurves.filesById,
      recordsWithBaseCurves.fileOrder,
      {
        "file-a": {
          derivativePointsBySeriesId: {
            "series-1": [{ x: 0.5, y: 42 }],
          },
        },
      },
    )["file-a"] ?? [];
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
    const recordsWithBaseCurves = createTransferRecordsForTest(
      [0, 0.5, 1],
      [1e-9, 1e-7, 1e-5],
    );

    const records = createCalculatedMetricRecordsByFile(
      recordsWithBaseCurves.filesById,
      recordsWithBaseCurves.fileOrder,
      {
        "file-a": {
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
      },
    )["file-a"] ?? [];
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
    const recordsWithBaseCurves = createTransferRecordsForTest(
      xValues,
      xValues.map((x) => 10 ** (-12 + x * 2)),
    );
    const currentKey = "current:series-1:base" as MetricKey;
    const manualSsKey = "subthreshold:series-1:ss:manual" as MetricKey;
    const filesById = {
      ...recordsWithBaseCurves.filesById,
      "file-a": {
        ...recordsWithBaseCurves.filesById["file-a"],
        metricInputsByKey: {
          [currentKey]: {
            fileId: "file-a",
            metricKey: currentKey,
            seriesId: "series-1",
            source: "manual" as const,
            targets: {
              ionX: 0.9,
              ioffX: 0.1,
            },
          },
          [manualSsKey]: {
            fileId: "file-a",
            metricKey: manualSsKey,
            seriesId: "series-1",
            source: "manual" as const,
            range: {
              x1: 0.25,
              x2: 0.75,
            },
          },
        },
      },
    };

    const records = createCalculatedMetricRecordsByFile(
      filesById,
      recordsWithBaseCurves.fileOrder,
    )["file-a"] ?? [];
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

const createTransferRecordsForTest = (
  x: readonly number[],
  y: readonly number[],
) => addSliceOutputToRecordsForTest(
  createFileRecordsForTest([{
    fileId: "file-a",
    fileName: "Transfer.csv",
  }]),
  {
    fileId: "file-a",
    fileName: "Transfer.csv",
    curveType: "transfer",
    xAxisRole: "vg",
    xGroups: [x],
    series: [{
      id: "series-1",
      groupIndex: 0,
      y,
    }],
  },
);
