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

suite("workbench/services/session/test/common/sessionReadModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("projects raw imports", () => {
    const records = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Raw Transfer.csv",
      sheetId: "sheet-1",
      sheetName: "Data",
      sourceKey: "file-a:sheet-1",
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
        sourceKey: file.sourceKey,
      })),
      [{
        fileId: "file-a",
        sheetId: "sheet-1",
        sourceKey: "file-a:sheet-1",
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
