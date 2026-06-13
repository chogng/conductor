/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import {
  createCalculatedCurveRecordsByFile,
  createProcessedFileSessionCommit,
  createRawFilesFromRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import type { CalculatedPlotsByKey } from "src/cs/workbench/services/calculation/common/calculationResults";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import type { CommitTemplateOutputOptions } from "src/cs/workbench/services/session/common/session";
import type {
  CurveRecord,
  MetricRecord,
  MetricKey,
  TemplateRunRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { getLatestTemplateRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  getFileRecordAxisProjection,
  getFileRecordCurveType,
  getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";

suite("workbench/services/session/test/browser/sessionService", () => {
  test("reports typed change events with snapshot versions", () => {
    const session = new SessionService();
    const events: SessionChangeEvent[] = [];
    const disposable = session.onDidChangeSession(event => {
      events.push(event);
    });

    assert.equal(session.getSnapshot().schemaVersion, 1);
    assert.equal(session.getSnapshot().sessionVersion, 0);

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);

    assert.deepEqual(events, [{
      fileIds: ["file-a"],
      rawTableIds: ["file-a"],
      rawTableRefs: [{ fileId: "file-a", rawTableId: "file-a" }],
      reason: "rawTablesChanged",
      sessionVersion: 1,
    }]);
    assert.equal(session.getSnapshot().sessionVersion, 1);
    disposable.dispose();
  });

  test("subscription dispose stops future notifications", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = subscribeForTest(session, () => {
      changeCount += 1;
    });

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    dispose();
    commitRawFilesForTest(session, [{ fileId: "file-b", fileName: "Raw B.csv" }]);

    assert.equal(changeCount, 1);
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a", "file-b"]);
  });

  test("skips notifications when the value is unchanged", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = subscribeForTest(session, () => {
      changeCount += 1;
    });

    session.removeFiles([]);
    session.removeFiles(["missing-file"]);

    assert.equal(changeCount, 0);
    assert.equal(session.getSnapshot().sessionVersion, 0);
    dispose();
  });

  test("reports raw table refs on import change events", () => {
    const session = new SessionService();
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });

    commitRawFilesForTest(session, [
      { fileId: "file-a", fileName: "Raw A.csv", sheetId: "data" },
      { fileId: "file-b", fileName: "Raw B.csv", sheetId: "data" },
    ]);

    assert.deepEqual(events[0]?.rawTableRefs, [
      { fileId: "file-a", rawTableId: "data" },
      { fileId: "file-b", rawTableId: "data" },
    ]);
    assert.deepEqual(events[0]?.rawTableIds, ["data", "data"]);
    dispose.dispose();
  });

  test("ignores removal requests for unknown file ids", () => {
    const session = new SessionService();
    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    let changeCount = 0;
    const dispose = session.onDidChangeSession(() => {
      changeCount += 1;
    });

    session.removeFiles(["missing-file"]);

    assert.equal(changeCount, 0);
    assert.equal(session.getSnapshot().sessionVersion, 1);
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    dispose.dispose();
  });

  test("initializes canonical session records", () => {
    const session = new SessionService();

    assert.deepEqual(session.getSnapshot().filesById, {});
    assert.deepEqual(session.getSnapshot().fileOrder, []);
  });

  test("omits legacy buckets from the session snapshot", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    const context = session.getSnapshot() as Record<string, unknown>;

    assert.equal("filesById" in context, true);
    assert.equal("fileOrder" in context, true);
    assert.equal("resetProcessedData" in context, false);
    assert.equal("sourceFiles" in context, false);
    assert.equal("cleanedData" in context, false);
    assert.equal("calculatedDataByKey" in context, false);
    assert.equal("analysisResults" in context, false);
    assert.equal("compat" in context, false);
    assert.equal("ionIoffManualTargetsByFileId" in context, false);
    assert.equal("ssManualRanges" in context, false);
    assert.equal("templateMode" in context, false);
    assert.equal("selectedTemplateId" in context, false);
    assert.equal("fileTemplateSelectionsByFileId" in context, false);
    assert.equal("templateFormState" in context, false);
    assert.equal("ionIoffMethod" in context, false);
    assert.equal("ssMethod" in context, false);
    assert.equal("ssShowFitLine" in context, false);
    assert.equal("viewState" in context, false);
    assert.equal("setViewState" in context, false);
  });

  test("stores applied template selection in canonical template run", () => {
    const session = new SessionService();

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      xGroups: [[0]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1],
      }],
    }, {
      appliedTemplateSelection: { kind: "template", templateId: "template-a" },
    });

    assert.deepEqual(getLatestTemplateRunRecord(session.getSnapshot().filesById["file-a"])?.selection, {
      kind: "template",
      templateId: "template-a",
    });
  });

  test("stores and clears metric inputs in canonical file records", () => {
    const session = new SessionService();
    const metricKey = "current:series-1:base" as MetricKey;

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      xGroups: [[0]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1],
      }],
    });
    session.setMetricInput({
      fileId: " file-a ",
      metricKey,
      seriesId: " series-1 ",
      source: "manual",
      targets: {
        ionX: 1,
        ioffX: null,
      },
    });

    assert.deepEqual(
      session.getSnapshot().filesById["file-a"].metricInputsByKey?.[metricKey]?.targets,
      {
        ionX: 1,
        ioffX: null,
      },
    );

    session.clearMetricInput(" file-a ", metricKey);

    assert.equal(
      session.getSnapshot().filesById["file-a"].metricInputsByKey,
      undefined,
    );
  });

  test("projects raw and processed fields into canonical file records", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [{
      fileId: "file-a",
      fileName: "Transfer.csv",
      sheetId: "sheet-1",
      sheetName: "Sweep",
      rowCount: 4,
      columnCount: 2,
      maxCellLengths: [3, 4],
      curveType: "transfer",
      curveTypeConfidence: "high",
      curveTypeReasons: ["metadata"],
    }]);
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Transfer.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xUnit: "V",
      yUnit: "A",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        legendValue: "Vd=1",
        groupIndex: 0,
        y: [1e-9, 1e-6],
      }],
      domain: {
        x: [0, 1],
        y: [1e-9, 1e-6],
      },
    }, {
      appliedTemplateSelection: { kind: "template", templateId: "template-a" },
    });

    const snapshot = session.getSnapshot();
    const record = snapshot.filesById["file-a"];
    const curve = record.curvesByKey["base:iv:transfer:series-1"];

    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(record.raw.tablesById["sheet-1"].sheetName, "Sweep");
    assert.equal(record.raw.tablesById["sheet-1"].rowCount, 4);
    assert.equal(getFileRecordCurveType(record), "transfer");
    assert.equal(getLatestTemplateRunRecord(record)?.selection.kind, "template");
    assert.equal(record.seriesById["series-1"].legendValue, "Vd=1");
    const axis = getFileRecordAxisProjection(record);
    assert.equal(axis.xUnit, "V");
    assert.equal(axis.yUnit, "A");
    assert.equal(curve.curveGeneration, "base");
    assert.equal(curve.curveFamily, "iv");
    assert.equal(curve.ivMode, "transfer");
    assert.deepEqual(curve.points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
    assert.deepEqual(curve.domain?.yLog10Abs, [-9, -6]);
  });

  test("commits template runs, curves, and metrics through explicit APIs", () => {
    const session = new SessionService();
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw.csv" }]);
    events.length = 0;

    const curve: CurveRecord = {
      fileId: "file-a",
      seriesId: "series-1",
      curveGeneration: "base",
      curveFamily: "iv",
      ivMode: "transfer",
      lineage: {
        curveGeneration: "base",
        baseFamily: "iv",
        ivMode: "transfer",
        baseSeries: { fileId: "file-a", seriesId: "series-1" },
      },
      points: [{ x: 0, y: 1 }],
      signature: "curve-signature",
    };
    const derivedCurve: CurveRecord = {
      fileId: "file-a",
      seriesId: "series-1",
      curveGeneration: "derived",
      curveFamily: "gm",
      lineage: {
        curveGeneration: "derived",
        derivedFamily: "gm",
        inputCurve: {
          fileId: "file-a",
          seriesId: "series-1",
          curveKey: "base:iv:transfer:series-1",
          signature: "curve-signature",
        },
      },
      points: [{ x: 0, y: 2 }],
      signature: "derived-signature",
    };
    const metricKey = "current:series-1:base" as MetricKey;
    const metric: MetricRecord = {
      key: metricKey,
      fileId: "file-a",
      seriesId: "series-1",
      metricFamily: "current",
      contextKey: "base",
      inputCurves: [],
      inputSignatures: [],
      value: {
        method: "auto",
        ion: null,
        xAtIon: null,
        ioff: null,
        xAtIoff: null,
        ionIoff: null,
        candidateWindows: [],
      },
    };
    const templateRun: TemplateRunRecord = {
      id: "run-a",
      fileId: "file-a",
      selection: { kind: "auto" },
      config: {
        xDataStart: 0,
        xDataEnd: 1,
        xSegmentationMode: "auto",
        yLegendTarget: "auto",
        stopOnError: false,
        yColumns: [1],
      },
      sourceBlockIds: ["block-a"],
      outputSeriesIds: ["series-1"],
      outputCurveKeys: ["base:iv:transfer:series-1"],
      configFingerprint: "config-a",
      mode: "auto",
      appliedAt: 1,
      warnings: [],
      errors: [],
    };

    session.commitTemplateRun(templateRun);
    session.commitCurves({ fileId: "file-a", curves: [curve, derivedCurve] });
    session.commitCurves({
      fileId: "file-a",
      curves: [],
      replaceGenerations: ["derived"],
    });
    session.commitMetrics({ fileId: "file-a", metrics: [metric] });

    const record = session.getSnapshot().filesById["file-a"];
    assert.deepEqual(getLatestTemplateRunRecord(record), templateRun);
    assert.equal(record.curvesByKey["base:iv:transfer:series-1"], curve);
    assert.equal(record.curvesByKey["derived:gm:default:series-1"], undefined);
    assert.equal(record.metricsByKey[metricKey], metric);
    assert.deepEqual(record.metricsBySeriesId?.["series-1"], [metricKey]);
    assert.deepEqual(events.map(event => event.reason), [
      "templateRunChanged",
      "curvesChanged",
      "curvesChanged",
      "metricsChanged",
    ]);
    dispose.dispose();
  });

  test("clears template output through the template commit API", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw.csv" }]);
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed.csv",
      curveType: "transfer",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });

    session.commitTemplateRun({ kind: "clearTemplateOutput" });

    const record = session.getSnapshot().filesById["file-a"];
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.deepEqual(Object.keys(record.raw.tablesById), ["file-a"]);
    assert.equal(getLatestTemplateRunRecord(record), undefined);
    assert.deepEqual(getFileRecordXGroups(record), []);
    assert.deepEqual(record.seriesOrder, []);
    assert.equal(record.curvesByKey["base:iv:transfer:series-1"], undefined);
    assert.deepEqual(record.metricsByKey, {});
    assert.equal(record.calculationCache, undefined);
  });

  test("adds and replaces raw files through canonical session methods", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [
      {
        fileId: "file-a",
        fileName: "Raw A.csv",
        rowCount: 3,
        columnCount: 2,
      },
    ]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(session.getSnapshot().filesById["file-a"].name, "Raw A.csv");
    assert.equal(session.getSnapshot().filesById["file-a"].kind, "csv");
    assert.equal(session.getSnapshot().filesById["file-a"].raw.fileName, "Raw A.csv");

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed A.csv",
      curveType: "transfer",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });

    replaceImportedFilesForTest(session, [
      {
        fileId: "file-b",
        fileName: "Raw B.csv",
        rowCount: 4,
        columnCount: 3,
      },
    ]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-b"]);
    assert.equal(snapshot.filesById["file-b"].name, "Raw B.csv");
    assert.equal(snapshot.filesById["file-b"].kind, "csv");
    assert.equal(snapshot.filesById["file-b"].raw.fileName, "Raw B.csv");
    assert.deepEqual(snapshot.filesById["file-b"].seriesOrder, []);
    assert.equal(snapshot.filesById["file-a"], undefined);
  });

  test("commits file import results as canonical raw table records", () => {
    const session = new SessionService();
    const result: FileImportResult = {
      createdAt: 123,
      diagnostics: [],
      files: [{
        id: "file-a",
        kind: "excel",
        name: "Transfer.xlsx",
        raw: {
          fileId: "file-a",
          fileName: "Transfer.xlsx",
          lastModified: 456,
          rawTablesById: {
            "sheet-1": {
              columnCount: 2,
              fileId: "file-a",
              maxCellLengths: [2, 4],
              rawTableId: "sheet-1",
              rowCount: 2,
              rows: {
                kind: "inline",
                values: [["Vg", "Id"], ["0", "1e-9"]],
              },
              source: {
                kind: "excelSheet",
                sheetIndex: 0,
                sheetName: "Sweep",
              },
            },
          },
          rawTableOrder: ["sheet-1"],
          size: 789,
        },
      }],
    };

    session.commitFileImport(result);

    const file = session.getSnapshot().filesById["file-a"];
    const table = file.raw.tablesById["sheet-1"];
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(file.name, "Transfer.xlsx");
    assert.equal(file.kind, "excel");
    assert.equal(file.raw.fileName, "Transfer.xlsx");
    assert.equal(file.raw.size, 789);
    assert.equal(table.sheetName, "Sweep");
    assert.equal(table.rowCount, 2);
    assert.deepEqual(table.maxCellLengths, [2, 4]);
    assert.deepEqual(table.rowStore, {
      kind: "memory",
      rows: [["Vg", "Id"], ["0", "1e-9"]],
    });
    assert.deepEqual(file.rawTableVersionsById, { "sheet-1": 1 });
    assert.deepEqual(file.assessmentsByRawTableId, {});
  });

  test("increments raw table versions when imported files replace an existing source", () => {
    const session = new SessionService();

    session.commitFileImport(createSingleRawTableImportResult());
    session.commitFileImport(createSingleRawTableImportResult());

    const file = session.getSnapshot().filesById["file-a"];
    const rawFiles = createRawFilesFromRecords(
      session.getSnapshot().filesById,
      session.getSnapshot().fileOrder,
    );
    assert.deepEqual(file.rawTableVersionsById, { "table-a": 2 });
    assert.equal(rawFiles[0]?.sourceVersion, 2);
  });

  test("commits raw table assessment when source version matches", () => {
    const session = new SessionService();
    session.commitFileImport(createSingleRawTableImportResult());
    const assessment = createRawTableAssessment(1);

    session.commitRawTableAssessment(assessment);

    const file = session.getSnapshot().filesById["file-a"];
    assert.equal(file.assessmentsByRawTableId["table-a"].sourceRawTableVersion, 1);
    assert.deepEqual(file.measurementBlockOrder, ["block-a"]);
    assert.equal(file.measurementBlocksById["block-a"].family, "iv");
  });

  test("ignores stale raw table assessment versions", () => {
    const session = new SessionService();
    session.commitFileImport(createSingleRawTableImportResult());

    session.commitRawTableAssessment(createRawTableAssessment(0));

    const file = session.getSnapshot().filesById["file-a"];
    assert.deepEqual(file.assessmentsByRawTableId, {});
    assert.deepEqual(file.measurementBlockOrder, []);
  });

  test("keeps imported file handles and source keys through raw canonical projection", () => {
    const session = new SessionService();
    const sourceFile = {
      lastModified: 123,
      name: "Transfer.csv",
      size: 24,
    };

    replaceImportedFilesForTest(session, [{
      file: sourceFile,
      fileId: "file-a",
      fileName: "Transfer.csv",
      normalizedCsvPath: "C:/tmp/transfer.csv",
      sourceKey: "transfer.csv::24::123",
      sourcePath: "C:/data/Transfer.csv",
      rowCount: 2,
      columnCount: 2,
      maxCellLengths: [2, 4],
    }]);

    const snapshot = session.getSnapshot();
    const rawFiles = createRawFilesFromRecords(snapshot.filesById, snapshot.fileOrder);

    assert.equal(rawFiles.length, 1);
    assert.equal(rawFiles[0].file, sourceFile);
    assert.equal(rawFiles[0].sourceKey, "transfer.csv::24::123");
    assert.equal(rawFiles[0].normalizedCsvPath, "C:/tmp/transfer.csv");
    assert.equal(rawFiles[0].sourcePath, "C:/data/Transfer.csv");
    assert.equal(rawFiles[0].rowCount, 2);
    assert.equal(rawFiles[0].columnCount, 2);
    assert.deepEqual(rawFiles[0].maxCellLengths, [2, 4]);
  });

  test("removes files through one session owner", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [
      { fileId: "file-a", fileName: "Raw A.csv" },
      { fileId: "file-b", fileName: "Raw B.csv" },
    ]);
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed A.csv",
      curveType: "transfer",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
      analysisCache: {
        version: 2,
        series: {
          "series-1": {
            gm: [{ x: 0, y: 1 }],
          },
        },
      },
    });
    replaceDerivedCurvesForTest(session, {
      "iv:file-a": {
        activeFile: { fileId: "file-a" },
        kind: "iv",
        pointsCount: 0,
        seriesList: [],
        signature: "iv:file-a",
        source: {
          fileId: "file-a",
          inputKind: "record",
        },
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [0, 1],
        yUnitLabel: "A",
      },
    });
    const currentMetricKey = "current:series-1:base" as MetricKey;
    const subthresholdMetricKey = "subthreshold:series-1:ss:manual" as MetricKey;
    session.setMetricInput({
      fileId: "file-a",
      metricKey: currentMetricKey,
      seriesId: "series-1",
      source: "manual",
      targets: {
        ionX: 1,
        ioffX: 0,
      },
    });
    session.setMetricInput({
      fileId: "file-a",
      metricKey: subthresholdMetricKey,
      seriesId: "series-1",
      source: "manual",
      range: {
        x1: 0,
        x2: 1,
      },
    });
    assert.deepEqual(
      session.getSnapshot().filesById["file-a"].metricInputsByKey?.[currentMetricKey]?.targets,
      {
        ionX: 1,
        ioffX: 0,
      },
    );
    assert.deepEqual(
      session.getSnapshot().filesById["file-a"].metricInputsByKey?.[subthresholdMetricKey]?.range,
      {
        x1: 0,
        x2: 1,
      },
    );
    session.removeFiles(["file-a"]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-b"]);
    assert.equal(snapshot.filesById["file-b"].raw.fileName, "Raw B.csv");
    assert.equal(snapshot.filesById["file-a"], undefined);
  });

  test("replaces calculated curves through the session owner", () => {
    const session = new SessionService();

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session, {
      "gm:file-a": {
        activeFile: null,
        kind: "gm",
        pointsCount: 2,
        seriesList: [{
          kind: "gm",
          id: "series-1",
          name: "gm",
          data: [
            { x: 0, y: 3, yPositive: 3, yAbsPositive: 3 },
            { x: 1, y: 4, yPositive: 4, yAbsPositive: 4 },
          ],
        }],
        signature: "gm:file-a",
        source: {
          fileId: "file-a",
          inputKind: "record",
        },
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [3, 4],
        yUnitLabel: "S",
      },
    });

    const curve = session.getSnapshot()
      .filesById["file-a"]
      .curvesByKey["derived:gm:default:series-1"];
    assert.equal(curve.curveGeneration, "derived");
    assert.equal(curve.curveFamily, "gm");
    assert.deepEqual(curve.points, [
      { x: 0, y: 3 },
      { x: 1, y: 4 },
    ]);
  });

  test("replaces calculated curve records instead of accumulating stale derived curves", () => {
    const session = new SessionService();

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session, {
      "gm:file-a": {
        activeFile: null,
        kind: "gm",
        pointsCount: 2,
        seriesList: [{
          kind: "gm",
          id: "series-1",
          name: "gm",
          data: [
            { x: 0, y: 3, yPositive: 3, yAbsPositive: 3 },
            { x: 1, y: 4, yPositive: 4, yAbsPositive: 4 },
          ],
        }],
        signature: "gm:file-a",
        source: {
          fileId: "file-a",
          inputKind: "record",
        },
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [3, 4],
        yUnitLabel: "S",
      },
    });
    replaceDerivedCurvesForTest(session, {});

    const curvesByKey = session.getSnapshot().filesById["file-a"].curvesByKey;
    assert.equal(curvesByKey["derived:gm:default:series-1"], undefined);
    assert.notEqual(curvesByKey["base:iv:transfer:series-1"], undefined);
  });

  test("keeps calculated iv read models out of canonical base curves", () => {
    const session = new SessionService();

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Processed A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session, {
      "iv:file-a": {
        activeFile: null,
        kind: "iv",
        pointsCount: 2,
        seriesList: [{
          kind: "iv",
          id: "series-1",
          name: "iv",
          data: [
            { x: 0, y: 1, yPositive: 1, yAbsPositive: 1 },
            { x: 1, y: 2, yPositive: 2, yAbsPositive: 2 },
          ],
        }],
        signature: "iv:file-a",
        source: {
          fileId: "file-a",
          inputKind: "record",
        },
        xDomain: [0, 1],
        xUnitLabel: "V",
        yDomain: [1, 2],
        yUnitLabel: "A",
      },
    });

    const curvesByKey = session.getSnapshot().filesById["file-a"].curvesByKey;
    assert.notEqual(curvesByKey["base:iv:transfer:series-1"], undefined);
    assert.equal(curvesByKey["base:iv:default:series-1"], undefined);
  });

  test("clears session data", () => {
    const session = new SessionService();

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    session.clearSession();

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.filesById, {});
    assert.deepEqual(snapshot.fileOrder, []);
  });

  test("notifies each active subscription", () => {
    const session = new SessionService();
    let firstChangeCount = 0;
    let secondChangeCount = 0;
    const disposeFirst = subscribeForTest(session, () => {
      firstChangeCount += 1;
    });
    const disposeSecond = subscribeForTest(session, () => {
      secondChangeCount += 1;
    });

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    disposeFirst();
    session.removeFiles(["file-a"]);

    assert.equal(firstChangeCount, 1);
    assert.equal(secondChangeCount, 2);
    disposeSecond();
  });

});

const subscribeForTest = (
  session: SessionService,
  listener: (event: SessionChangeEvent) => void,
): (() => void) => {
  const disposable = session.onDidChangeSession(listener);
  return () => disposable.dispose();
};

const commitRawFilesForTest = (
  session: SessionService,
  files: readonly SessionFile[],
): void => {
  session.commitFileImport(createFileImportResultForTest(files));
};

const replaceImportedFilesForTest = (
  session: SessionService,
  files: readonly SessionFile[],
): void => {
  session.clearSession();
  commitRawFilesForTest(session, files);
};

const createFileImportResultForTest = (
  files: readonly SessionFile[],
): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: files
    .map(createImportedFileRecordForTest)
    .filter((file): file is ImportedFileRecord => Boolean(file)),
});

const createImportedFileRecordForTest = (
  file: SessionFile,
): ImportedFileRecord | null => {
  const fileId = String(file.fileId ?? "").trim();
  if (!fileId) {
    return null;
  }

  const fileName = String(file.fileName ?? fileId).trim() || fileId;
  const rawTableId = normalizeOptionalTestText(file.sheetId) ??
    normalizeOptionalTestText(file.sourceKey) ??
    fileId;
  const sheetName = normalizeOptionalTestText(file.sheetName) ??
    normalizeOptionalTestText(file.worksheetName);
  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(file.columnCount) || 0));
  return {
    id: fileId,
    kind: /\.xlsx?$/i.test(fileName) ? "excel" : "csv",
    name: fileName,
    raw: {
      fileId,
      fileName,
      filePath: typeof file.sourcePath === "string" ? file.sourcePath : null,
      lastModified: readRecordNumber(file.file, "lastModified") ?? undefined,
      rawFile: file.file,
      rawTablesById: {
        [rawTableId]: {
          columnCount,
          fileId,
          maxCellLengths: Array.isArray(file.maxCellLengths) ? file.maxCellLengths : [],
          rawTableId,
          rowCount,
          rows: file.normalizedCsvPath
            ? {
                formatVersion: 1,
                kind: "normalizedCsv",
                normalizedCsvPath: file.normalizedCsvPath,
              }
            : {
                kind: "inline",
                values: [],
              },
          source: sheetName || /\.xlsx?$/i.test(fileName)
            ? {
                kind: "excelSheet",
                sheetIndex: 0,
                sheetName,
              }
            : {
                kind: "csv",
              },
        },
      },
      rawTableOrder: [rawTableId],
      relativePath: file.relativePath ?? null,
      size: readRecordNumber(file.file, "size") ?? undefined,
    },
  };
};

const commitTemplateOutputForTest = (
  session: SessionService,
  file: ProcessedEntry | null | undefined,
  options: CommitTemplateOutputOptions = {},
): void => {
  if (!file || typeof file !== "object") {
    return;
  }

  const fileId = String(file.fileId ?? "").trim();
  if (!fileId) {
    return;
  }

  if (!session.getSnapshot().filesById[fileId]) {
    commitRawFilesForTest(session, [{
      fileId,
      fileName: String(file.fileName ?? fileId),
    }]);
  }

  const commit = createProcessedFileSessionCommit(
    session.getSnapshot(),
    file,
    options,
  );
  if (!commit) {
    return;
  }

  session.commitTemplateRun(commit.templateRun);
  session.commitCurves(commit.curves);
};

const replaceDerivedCurvesForTest = (
  session: SessionService,
  plotsByKey: CalculatedPlotsByKey,
): void => {
  const recordsByFileId = createCalculatedCurveRecordsByFile(plotsByKey);
  const fileIds = new Set([
    ...Object.keys(session.getSnapshot().filesById),
    ...Object.keys(recordsByFileId),
  ]);
  for (const fileId of fileIds) {
    session.commitCurves({
      fileId,
      curves: recordsByFileId[fileId] ?? [],
      replaceGenerations: ["derived", "secondDerived"],
    });
  }
};

const createSingleRawTableImportResult = (): FileImportResult => ({
  createdAt: 123,
  diagnostics: [],
  files: [{
    id: "file-a",
    kind: "csv",
    name: "Transfer.csv",
    raw: {
      fileId: "file-a",
      fileName: "Transfer.csv",
      rawTablesById: {
        "table-a": {
          columnCount: 2,
          fileId: "file-a",
          maxCellLengths: [2, 4],
          rawTableId: "table-a",
          rowCount: 2,
          rows: {
            kind: "inline",
            values: [["Vg", "Id"], ["0", "1e-9"]],
          },
          source: {
            kind: "csv",
          },
        },
      },
      rawTableOrder: ["table-a"],
    },
  }],
});

const createRawTableAssessment = (
  sourceRawTableVersion: number,
): RawTableAssessmentRecord => ({
  blocks: [{
    columnCount: 2,
    columns: {
      columns: [],
    },
    diagnosticCodes: [],
    family: "iv",
    fileId: "file-a",
    id: "block-a",
    label: "Block A",
    rawTableId: "table-a",
    rowCount: 1,
    source: {
      fullRange: {
        endCol: 1,
        endRow: 1,
        startCol: 0,
        startRow: 0,
      },
    },
  }],
  createdAt: 456,
  diagnostics: [],
  fileId: "file-a",
  groups: [],
  rawTableId: "table-a",
  sourceRawTableVersion,
});

const readRecordNumber = (
  record: unknown,
  key: string,
): number | undefined => {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  const value = (record as Record<string, unknown>)[key];
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const normalizeOptionalTestText = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text || null;
};
