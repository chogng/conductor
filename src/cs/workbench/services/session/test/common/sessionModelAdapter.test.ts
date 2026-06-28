import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { replaceCalculatedCurvesInRecords } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  addSliceOutputToRecordsForTest,
  createFileRecordsForTest,
} from "src/cs/workbench/services/session/test/common/sessionTestRecords";

suite("workbench/services/session/test/common/sessionModelAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("replaces calculated curves while preserving canonical base curves", () => {
    const recordsWithBaseCurves = addSliceOutputToRecordsForTest(
      createFileRecordsForTest([{
        fileId: "file-a",
        fileName: "Transfer.csv",
      }]),
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
    );

    const calculatedRecords = replaceCalculatedCurvesInRecords(
      recordsWithBaseCurves.filesById,
      recordsWithBaseCurves.fileOrder,
      {
        "gm:file-a": {
          activeFile: null,
          kind: "gm",
          pointsCount: 2,
          seriesList: [{
            kind: "gm",
            id: "series-1",
            name: "gm",
            data: [
              { x: 0, y: 10, yPositive: 10, yAbsPositive: 10 },
              { x: 1, y: 20, yPositive: 20, yAbsPositive: 20 },
            ],
          }],
          signature: "gm-signature",
          source: {
            fileId: "file-a",
            inputKind: "canonical",
          },
          xDomain: [0, 1],
          xUnitLabel: "V",
          yDomain: [10, 20],
          yUnitLabel: "gm",
        },
        "secondDerivative:file-a": {
          activeFile: null,
          kind: "secondDerivative",
          pointsCount: 2,
          seriesList: [{
            kind: "secondDerivative",
            id: "series-1",
            name: "second",
            data: [
              { x: 0, y: -1, yPositive: null, yAbsPositive: 1 },
              { x: 1, y: 2, yPositive: 2, yAbsPositive: 2 },
            ],
          }],
          signature: "second-signature",
          source: {
            fileId: "file-a",
            inputKind: "gm",
          },
          xDomain: [0, 1],
          xUnitLabel: "V",
          yDomain: [-1, 2],
          yUnitLabel: "second",
        },
      },
    );

    const record = calculatedRecords.filesById["file-a"];

    assert.deepEqual(record.curvesByKey["base:iv:transfer:series-1"].points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
    assert.equal(record.curvesByKey["derived:gm:default:series-1"].curveFamily, "gm");
    assert.deepEqual(record.curvesByKey["derived:gm:default:series-1"].points, [
      { x: 0, y: 10 },
      { x: 1, y: 20 },
    ]);
    assert.equal(
      record.curvesByKey["secondDerived:secondDerivative:default:series-1"].curveGeneration,
      "secondDerived",
    );
  });
});
