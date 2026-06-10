import assert from "assert";

import {
  createRawFilesFromRecords,
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
  replaceCalculatedCurvesInRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import { getLatestTemplateRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import {
  getFileRecordAxisProjection,
  getFileRecordCurveType,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";

suite("workbench/services/session/test/common/sessionModelAdapter", () => {
  test("projects canonical raw records back to raw file entries", () => {
    const records = mergeRawFilesIntoRecords({}, [], [
      {
        fileId: "file-a",
        fileName: "Transfer.xlsx",
        sheetId: "sheet-1",
        sheetName: "Forward",
        sourceKey: "file-a:sheet-1",
        rowCount: 10,
        columnCount: 4,
        maxCellLengths: [1, 2, 3, 4],
      },
      {
        fileId: "file-a",
        fileName: "Transfer.xlsx",
        sheetId: "sheet-2",
        sheetName: "Reverse",
        sourceKey: "file-a:sheet-2",
        rowCount: 8,
        columnCount: 4,
        maxCellLengths: [4, 3, 2, 1],
      },
      {
        fileId: "file-b",
        fileName: "Output.csv",
        rowCount: 6,
        columnCount: 2,
      },
    ]);

    assert.deepEqual(records.fileOrder, ["file-a", "file-b"]);
    assert.deepEqual(
      Object.fromEntries(Object.entries(records.filesById).map(([fileId, file]) => [
        fileId,
        { kind: file.kind, name: file.name },
      ])),
      {
        "file-a": { kind: "excel", name: "Transfer.xlsx" },
        "file-b": { kind: "csv", name: "Output.csv" },
      },
    );

    const rawFiles = createRawFilesFromRecords(records.filesById, records.fileOrder);
    assert.deepEqual(
      rawFiles.map((file) => ({
        fileId: file.fileId,
        sheetId: file.sheetId,
        sheetName: file.sheetName,
        sourceKey: file.sourceKey,
        rowCount: file.rowCount,
        columnCount: file.columnCount,
      })),
      [
        {
          fileId: "file-a",
          sheetId: "sheet-1",
          sheetName: "Forward",
          sourceKey: "file-a:sheet-1",
          rowCount: 10,
          columnCount: 4,
        },
        {
          fileId: "file-a",
          sheetId: "sheet-2",
          sheetName: "Reverse",
          sourceKey: "file-a:sheet-2",
          rowCount: 8,
          columnCount: 4,
        },
        {
          fileId: "file-b",
          sheetId: "file-b",
          sheetName: null,
          sourceKey: "file-b",
          rowCount: 6,
          columnCount: 2,
        },
      ],
    );
  });

  test("projects calculated curves and calculation cache into canonical file records", () => {
    const rawRecords = mergeRawFilesIntoRecords({}, [], [{
      fileId: "file-a",
      fileName: "Transfer.csv",
    }]);
    const templateConfig = {
      ...createEmptyTemplateConfig(),
      name: "Transfer Template",
      xDataStart: "12",
      xDataEnd: "48",
      xPointsPerGroup: "2",
      xUnit: "mV",
      yLegendStart: "1",
      yLegendCount: "3",
      yLegendStep: "0.5",
      yUnit: "uA",
      bottomTitle: "Gate Voltage",
      leftTitle: "Drain Current",
      legendPrefix: "Vd=",
      yColumns: [2, 3],
    };
    const snapshot = createSnapshot(rawRecords);
    const processedRecords = mergeProcessedFileIntoRecords(
      rawRecords.filesById,
      rawRecords.fileOrder,
      {
        fileId: "file-a",
        fileName: "Transfer.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xLabel: "Gate Voltage",
        xUnit: "mV",
        yLabel: "Drain Current",
        yUnit: "uA",
        xGroups: [[0, 1]],
        series: [{
          id: "series-1",
          groupIndex: 0,
          y: [1e-9, 1e-6],
        }],
        analysisCache: {
          version: 2,
          series: {
            "series-1": {
              gm: [{ x: 0, y: 20 }],
              ssFitAuto: {
                strict: {
                  ss: 77,
                },
              },
            },
          },
        },
        analysisCacheTouchedAt: 123,
      },
      snapshot,
      {
        appliedTemplateConfig: templateConfig,
        appliedTemplateSelection: { kind: "template", templateId: "template-a" },
      },
    );
    const calculatedRecords = replaceCalculatedCurvesInRecords(
      processedRecords.filesById,
      processedRecords.fileOrder,
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
            inputKind: "processed",
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

    const templateRun = getLatestTemplateRunRecord(record);
    assert.equal(templateRun?.selection.kind, "template");
    assert.equal(
      templateRun?.selection.kind === "template"
        ? templateRun.selection.templateId
        : null,
      "template-a",
    );
    assert.equal(templateRun?.fileId, "file-a");
    assert.equal(record.latestTemplateRunId, templateRun?.id);
    assert.equal(record.templateRunsById[templateRun?.id ?? ""], templateRun);
    assert.equal(templateRun?.config.name, "Transfer Template");
    assert.equal(templateRun?.config.xDataStart, 12);
    assert.equal(templateRun?.config.xDataEnd, 48);
    assert.equal(templateRun?.config.xPointsPerGroup, 2);
    assert.equal(templateRun?.config.yLegendStep, 0.5);
    assert.deepEqual(templateRun?.config.yColumns, [2, 3]);
    const axis = getFileRecordAxisProjection(record);
    assert.equal(axis.xLabel, "Gate Voltage");
    assert.equal(axis.xAxisRole, "vg");
    assert.equal(axis.xUnit, "mV");
    assert.equal(axis.yLabel, "Drain Current");
    assert.equal(axis.yUnit, "uA");
    assert.equal(record.seriesById["series-1"].id, "series-1");
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
    assert.equal(record.calculationCache?.fileId, "file-a");
    assert.equal(record.calculationCache?.touchedAt, 123);
    assert.equal(record.calculationCache?.entriesByKey["gm:series-1"].kind, "gm");
    assert.deepEqual(
      record.calculationCache?.entriesByKey["gm:series-1"].value,
      [{ x: 0, y: 20 }],
    );
    assert.equal(
      record.calculationCache?.entriesByKey["ssFitAuto:series-1"].kind,
      "ssFitAuto",
    );
    assert.deepEqual(
      record.calculationCache?.entriesByKey["ssFitAuto:series-1"].value,
      {
        strict: {
          ss: 77,
        },
      },
    );
    assert.equal(record.metricsByKey["current:series-1:base"].metricFamily, "current");
    assert.equal(record.metricsByKey["derivative:series-1:gm"].metricFamily, "derivative");
    assert.equal(record.metricsByKey["derivative:series-1:gm"].value.kind, "gm");
    assert.equal(
      record.metricsByKey["subthreshold:series-1:ss:auto"].metricFamily,
      "subthreshold",
    );
    assert.deepEqual(record.metricsBySeriesId?.["series-1"], [
      "current:series-1:base",
      "derivative:series-1:gm",
      "subthreshold:series-1:ss:auto",
    ]);
  });

  test("materializes base curves from display curve type labels", () => {
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
        curveType: "transfer (vg)",
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
    const record = processedRecords.filesById["file-a"];

    assert.equal(getFileRecordCurveType(record), "transfer");
    assert.deepEqual(record.curvesByKey["base:iv:transfer:series-1"].points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
  });

  test("infers base curves from x axis role when processed result omits curve type", () => {
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
    const record = processedRecords.filesById["file-a"];

    assert.equal(getFileRecordCurveType(record), "transfer");
    assert.deepEqual(record.curvesByKey["base:iv:transfer:series-1"].points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
  });

  test("records the selected template when processed files have no per-file override", () => {
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
      {
        appliedTemplateSelection: { kind: "template", templateId: "template-a" },
      },
    );
    const templateRun = getLatestTemplateRunRecord(processedRecords.filesById["file-a"]);

    assert.equal(templateRun?.selection.kind, "template");
    assert.equal(
      templateRun?.selection.kind === "template"
        ? templateRun.selection.templateId
        : null,
      "template-a",
    );
    assert.equal(templateRun?.mode, "manual");
  });

  test("records the applied extraction config for processed files", () => {
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
      {
        appliedTemplateConfig: {
          name: "Manual Transfer",
          bottomTitle: "Vg",
          endRow: 2,
          groupSize: 2,
          leftTitle: "Id",
          startRow: 1,
          xSegmentationMode: "points",
          xUnit: "V",
          yCols: [1],
          yLegendTarget: "auto",
          yUnit: "A",
        },
      },
    );
    const config = getLatestTemplateRunRecord(processedRecords.filesById["file-a"])?.config;

    assert.equal(config?.name, "Manual Transfer");
    assert.equal(config?.xDataStart, 1);
    assert.equal(config?.xDataEnd, 2);
    assert.equal(config?.xSegmentationMode, "points");
    assert.equal(config?.xPointsPerGroup, 2);
    assert.deepEqual(config?.yColumns, [1]);
    assert.equal(config?.bottomTitle, "Vg");
    assert.equal(config?.leftTitle, "Id");
    assert.equal(config?.xUnit, "V");
    assert.equal(config?.yUnit, "A");
  });
});

const createSnapshot = (
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot => {
  return {
    schemaVersion: 1,
    sessionVersion: 0,
    filesById: {},
    fileOrder: [],
    ...overrides,
  };
};

