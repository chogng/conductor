import assert from "assert";

import {
  getCalculatedDataFromRecords,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  createSessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";

suite("workbench/services/session/test/common/sessionReadModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("projects raw imports", () => {
    const records = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Raw Transfer.csv",
      sheetId: "sheet-1",
      sheetName: "Data",
      tableKey: "file-a:sheet-1",
      rowCount: 20,
      columnCount: 4,
      maxCellLengths: [1, 2, 3, 4],
    }]);
    const snapshot = createSnapshot({
      ...records,
    });

    const readModel = createSessionReadModel(snapshot);

    assert.equal(readModel.hasSessionData, true);
    assert.equal(readModel.hasChartData, false);
    assert.deepEqual(
      readModel.rawFiles.map((file) => ({
        fileId: file.fileId,
        sheetId: file.sheetId,
        tableKey: file.tableKey,
      })),
      [{
        fileId: "file-a",
        sheetId: "sheet-1",
        tableKey: "file-a:sheet-1",
      }],
    );
    assert.deepEqual(readModel.processedFileIds, []);
  });

  test("projects processed curves without building calculated plots", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
    }]);
    const rawSnapshot = createSnapshot({
      ...rawRecords,
    });
    const processedRecords = mergeProcessedFileIntoRecords(
      rawRecords.filesById,
      rawRecords.fileOrder,
      {
        fileId: "file-a",
        fileName: "Transfer.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xUnit: "V",
        yUnit: "A",
        xGroups: [[0, 1, 2]],
        series: [{
          id: "series-1",
          groupIndex: 0,
          legendValue: "0.1",
          y: [1e-12, 1e-9, 1e-6],
          yCol: 2,
        }],
      },
      rawSnapshot,
    );
    const snapshot = createSnapshot({
      ...processedRecords,
    });

    const readModel = createSessionReadModel(snapshot);
    const ivData = getCalculatedDataFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
      "iv",
      "file-a",
    );

    assert.deepEqual(readModel.processedFileIds, ["file-a"]);
    assert.equal(readModel.hasChartData, true);
    assert.equal(readModel.processedFiles[0]?.fileId, "file-a");
    assert.equal(readModel.processedFiles[0]?.supportsSs, true);
    assert.equal(readModel.processedFiles[0]?.series?.[0]?.id, "series-1");
    assert.deepEqual(readModel.processedFiles[0]?.xGroups, [[0, 1, 2]]);
    assert.equal(ivData?.source.fileId, "file-a");
    assert.equal(ivData?.seriesList[0]?.id, "series-1");
    assert.deepEqual(
      ivData?.seriesList[0]?.data.map((point) => point.y),
      [1e-12, 1e-9, 1e-6],
    );
  });

  test("uses latest slice run template axes for projections", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
      sheetId: "sheet-1",
    }]);
    const processedRecords = mergeProcessedFileIntoRecords(
      rawRecords.filesById,
      rawRecords.fileOrder,
      {
        bottomTitle: "Gate Voltage",
        fileId: "file-a",
        fileName: "Transfer.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xUnit: "V",
        yUnit: "A",
        leftTitle: "Drain Current",
        xGroups: [[0, 1, 2]],
        series: [{
          id: "series-1",
          groupIndex: 0,
          y: [1e-12, 1e-9, 1e-6],
          yCol: 1,
        }],
      },
      createSnapshot({
        ...rawRecords,
      }),
    );
    const sliceRun: SliceRun = {
      id: "slice-run-a",
      fileId: "file-a",
      rawTableId: "sheet-1",
      mode: "auto",
      selection: { kind: "auto" },
      sourceRawTableVersion: 0,
      template: {
        schemaVersion: 1,
        name: "Slice Transfer",
        version: 1,
        blocks: [{
          rowRange: {
            startRow: 1,
            endRow: "end",
          },
          x: {
            columns: [0],
            unit: "mV",
          },
          y: {
            columns: [1],
            unit: "uA",
          },
          segmentation: {
            kind: "auto",
          },
          legend: {
            target: "auto",
          },
          titles: {
            bottom: "Slice Gate",
            left: "Slice Current",
          },
        }],
        stopOnError: false,
      },
      templateFingerprint: "template:fingerprint",
      inputRanges: [],
      outputSeriesIds: ["series-1"],
      outputCurveKeys: ["base:iv:transfer:series-1"],
      warnings: [],
      errors: [],
    };
    const file = processedRecords.filesById["file-a"]!;
    const snapshot = createSnapshot({
      ...processedRecords,
      filesById: {
        ...processedRecords.filesById,
        "file-a": {
          ...file,
          latestSliceRunId: sliceRun.id,
          sliceRunsById: {
            [sliceRun.id]: sliceRun,
          },
        },
      },
    });

    const readModel = createSessionReadModel(snapshot);

    assert.equal(readModel.processedFiles[0]?.xLabel, "Slice Gate");
    assert.equal(readModel.processedFiles[0]?.xUnit, "mV");
    assert.equal(readModel.processedFiles[0]?.yLabel, "Slice Current");
    assert.equal(readModel.processedFiles[0]?.yUnit, "uA");
  });

  test("reuses the read model for the same immutable snapshot", () => {
    const records = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Raw Transfer.csv",
      sheetId: "sheet-1",
      sheetName: "Data",
      tableKey: "file-a:sheet-1",
      rowCount: 20,
      columnCount: 4,
      maxCellLengths: [1, 2, 3, 4],
    }]);
    const snapshot = createSnapshot({
      ...records,
    });

    const first = createSessionReadModel(snapshot);
    const second = createSessionReadModel(snapshot);
    const next = createSessionReadModel({
      ...snapshot,
      sessionVersion: snapshot.sessionVersion + 1,
    });

    assert.equal(second, first);
    assert.notEqual(next, first);
    assert.deepEqual(next.rawFiles.map(file => file.fileId), ["file-a"]);
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
