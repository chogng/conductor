/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculatedMetrics";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { MetricKey } from "src/cs/workbench/services/session/common/sessionModel";
import {
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";

suite("workbench/services/calculation/test/common/calculatedMetrics", () => {
  test("creates canonical metric records from session base curves", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
    }]);
    const processedRecords = mergeProcessedFileIntoRecords(
      rawRecords.filesById,
      rawRecords.fileOrder,
      {
        fileId: "file-a",
        fileName: "Transfer.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[0, 1]],
        series: [{
          id: "series-1",
          groupIndex: 0,
          y: [1e-9, 1e-6],
        }],
      },
      createSnapshot(rawRecords),
    );

    const recordsByFileId = createCalculatedMetricRecordsByFile(
      processedRecords.filesById,
      processedRecords.fileOrder,
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

  test("applies canonical manual metric inputs during metric generation", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
    }]);
    const xValues = Array.from({ length: 21 }, (_value, index) => index / 20);
    const processedRecords = mergeProcessedFileIntoRecords(
      rawRecords.filesById,
      rawRecords.fileOrder,
      {
        fileId: "file-a",
        fileName: "Transfer.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [xValues],
        series: [{
          id: "series-1",
          groupIndex: 0,
          y: xValues.map((x) => 10 ** (-12 + x * 2)),
        }],
      },
      createSnapshot(rawRecords),
    );
    const currentKey = "current:series-1:base" as MetricKey;
    const manualSsKey = "subthreshold:series-1:ss:manual" as MetricKey;
    const filesById = {
      ...processedRecords.filesById,
      "file-a": {
        ...processedRecords.filesById["file-a"],
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
      processedRecords.fileOrder,
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

const createSnapshot = (
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot => ({
  schemaVersion: 1,
  sessionVersion: 0,
  filesById: {},
  fileOrder: [],
  ...overrides,
});
