import assert from "assert";

import {
  getCalculatedData,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  createSessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";

suite("workbench/services/session/test/common/sessionReadModel", () => {
  test("projects raw imports with active target and preview state", () => {
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
      activeTarget: { kind: "file", fileId: "file-a" },
      viewState: {
        table: {
          previewFile: {
            fileId: "file-a",
            fileName: "Raw Transfer.csv",
            sheetId: "sheet-1",
            sheetName: "Data",
            sourceKey: "file-a:sheet-1",
            rowCount: 20,
            columnCount: 4,
            maxCellLengths: [1, 2, 3, 4],
          },
          previewStatus: {
            state: "ready",
            message: "",
          },
        },
      },
    });

    const readModel = createSessionReadModel(snapshot);

    assert.equal(readModel.activeTargetFileId, "file-a");
    assert.equal(readModel.activeTargetSheetId, null);
    assert.equal(readModel.activeAnalysisFileId, null);
    assert.equal(readModel.hasSessionData, true);
    assert.equal(readModel.hasAnalysisData, false);
    assert.equal(readModel.previewFile?.sourceKey, "file-a:sheet-1");
    assert.equal(readModel.previewStatus.state, "ready");
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

  test("projects processed curves and calculated plots from the same target", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
    }]);
    const rawSnapshot = createSnapshot({
      ...rawRecords,
      activeTarget: { kind: "file", fileId: "file-a" },
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
      activeTarget: { kind: "file", fileId: "file-a" },
    });

    const readModel = createSessionReadModel(snapshot);
    const ivData = getCalculatedData(
      readModel.calculatedPlotsByKey,
      "iv",
      "file-a",
    );

    assert.equal(readModel.activeTargetFileId, "file-a");
    assert.equal(readModel.activeAnalysisFileId, "file-a");
    assert.deepEqual(readModel.processedFileIds, ["file-a"]);
    assert.equal(readModel.hasAnalysisData, true);
    assert.equal(readModel.activeAnalysisFileRecord?.id, "file-a");
    assert.equal(readModel.activeProcessedFile?.fileId, "file-a");
    assert.equal(readModel.activeProcessedFile?.supportsSs, true);
    assert.equal(readModel.activeProcessedFile?.series?.[0]?.id, "series-1");
    assert.deepEqual(readModel.activeProcessedFile?.xGroups, [[0, 1, 2]]);
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
  version: 1,
  filesById: {},
  fileOrder: [],
  activeTarget: { kind: "none" },
  viewState: {},
  ...overrides,
});
