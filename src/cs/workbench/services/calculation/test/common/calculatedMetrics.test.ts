/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculatedMetrics";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
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
