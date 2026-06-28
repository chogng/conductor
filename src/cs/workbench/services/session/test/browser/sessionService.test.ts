/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import {
  createCalculatedCurveRecordsByFile,
} from "src/cs/workbench/services/calculation/common/calculationCurveRecordBuilder";
import {
  commitRawFilesForTest,
  commitTemplateOutputForTest,
  createFileImportResultForTest,
  createSliceCommitForTest,
  replaceImportedFilesForTest,
} from "src/cs/workbench/services/session/test/common/sessionTestRecords";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/session/common/session";
import type {
  CurveRecord,
  MetricRecord,
  MetricKey,
} from "src/cs/workbench/services/session/common/sessionModel";
import { getLatestSliceRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";

suite("workbench/services/session/test/browser/sessionService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("reports typed change events with snapshot versions", () => {
    const session = store.add(new SessionService());
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
    const session = store.add(new SessionService());
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
    const session = store.add(new SessionService());
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
    const session = store.add(new SessionService());
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
    const session = store.add(new SessionService());
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
    const session = store.add(new SessionService());

    assert.deepEqual(session.getSnapshot().filesById, {});
    assert.deepEqual(session.getSnapshot().fileOrder, []);
  });

  test("omits retired buckets from the session snapshot", () => {
    const session = store.add(new SessionService());

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

  test("stores applied template selection in canonical slice run", () => {
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      xGroups: [[0]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1],
      }],
    }, {
      appliedTemplateSelection: { kind: "saved", templateId: "template-a" },
    });

    assert.deepEqual(getLatestSliceRunRecord(session.getSnapshot().filesById["file-a"])?.selection, {
      kind: "saved",
      templateId: "template-a",
    });
  });

  test("stores and clears metric inputs in canonical file records", () => {
    const session = store.add(new SessionService());
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

  test("projects canonical raw and slice fields into file records", () => {
    const session = store.add(new SessionService());

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
      appliedTemplateSelection: { kind: "saved", templateId: "template-a" },
    });

    const snapshot = session.getSnapshot();
    const record = snapshot.filesById["file-a"];
    const curve = record.curvesByKey["base:iv:transfer:series-1"];

    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(record.raw.tablesById["sheet-1"].sheetName, "Sweep");
    assert.equal(record.raw.tablesById["sheet-1"].rowCount, 4);
    const sliceRun = getLatestSliceRunRecord(record);
    assert.equal(sliceRun?.selection.kind, "saved");
    assert.equal(sliceRun?.template.blocks[0]?.x.unit, "V");
    assert.equal(sliceRun?.template.blocks[0]?.y.unit, "A");
    assert.equal(record.seriesById["series-1"].legendValue, "Vd=1");
    assert.equal(curve.curveGeneration, "base");
    assert.equal(curve.curveFamily, "iv");
    assert.equal(curve.ivMode, "transfer");
    assert.deepEqual(curve.points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
    assert.deepEqual(curve.domain?.yLog10Abs, [-9, -6]);
  });

  test("normalizes template units before canonical calculations", () => {
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Transfer.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xUnit: "mV",
      yUnit: "uA",
      xGroups: [[0, 1000]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 1001],
      }],
    });

    const snapshot = session.getSnapshot();
    const curve = snapshot.filesById["file-a"].curvesByKey["base:iv:transfer:series-1"];
    assert.deepEqual(curve.points, [
      { x: 0, y: 1e-6 },
      { x: 1, y: 0.001001 },
    ]);

    const calculated = createCalculatedCurveRecordsByFile(
      snapshot.filesById,
      snapshot.fileOrder,
    );
    const gmCurve = calculated["file-a"].find(curve =>
      curve.curveGeneration === "derived" && curve.curveFamily === "gm"
    );
    assert.deepEqual(gmCurve?.points.map(point => point.y), [0.001, 0.001]);
  });

  test("normalizes capacitance-frequency template units before canonical storage", () => {
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Cf.csv",
      curveType: "cf",
      xUnit: "kHz",
      yUnit: "pF",
      xGroups: [[1, 2]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [3, 4],
      }],
    });

    const curve = session.getSnapshot().filesById["file-a"].curvesByKey["base:cf:default:series-1"];
    assert.deepEqual(curve.points, [
      { x: 1000, y: 3e-12 },
      { x: 2000, y: 4e-12 },
    ]);
  });

  test("commits base curves, derived curves, and metrics through explicit APIs", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw.csv" }]);
    events.length = 0;

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
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      curveType: "transfer",
      xGroups: [[0]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1],
      }],
    });
    session.commitCurves({ fileId: "file-a", curves: [derivedCurve] });
    session.commitCurves({
      fileId: "file-a",
      curves: [],
      replaceGenerations: ["derived"],
    });
    session.commitMetrics({ fileId: "file-a", metrics: [metric] });

    const record = session.getSnapshot().filesById["file-a"];
    assert.equal(getLatestSliceRunRecord(record)?.fileId, "file-a");
    assert.equal(record.curvesByKey["base:iv:transfer:series-1"]?.curveGeneration, "base");
    assert.equal(record.curvesByKey["derived:gm:default:series-1"], undefined);
    assert.equal(record.metricsByKey[metricKey], metric);
    assert.deepEqual(record.metricsBySeriesId?.["series-1"], [metricKey]);
    assert.deepEqual(events.map(event => event.reason), [
      "sliceRunChanged",
      "curvesChanged",
      "curvesChanged",
      "metricsChanged",
    ]);
    dispose.dispose();
  });

  test("commits slice output through one session event", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw.csv" }]);
    events.length = 0;

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Slice Output.csv",
      curveType: "transfer",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });

    assert.deepEqual(events.map(event => event.reason), ["sliceRunChanged"]);
    assert.deepEqual(events[0]?.fileIds, ["file-a"]);
    assert.deepEqual(events[0]?.seriesIds, ["series-1"]);
    assert.ok(events[0]?.curveKeys?.includes("base:iv:transfer:series-1"));
    dispose.dispose();
  });

  test("commits slice run, series, and base curves through one session event", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [{
      fileId: "file-a",
      fileName: "Raw.csv",
      rowCount: 2,
      columnCount: 2,
    }]);
    events.length = 0;

    session.commitSliceRuns([{
      run: {
        id: "slice-run-a",
        fileId: "file-a",
        rawTableId: "file-a",
        mode: "auto",
        selection: { kind: "auto" },
        sourceRawTableVersion: 1,
        sourceContentSignature: "source-content-a",
        template: {
          schemaVersion: 1,
          name: "Detected IV Transfer",
          version: 1,
          blocks: [{
            rowRange: { startRow: 1, endRow: "end" },
            x: { columns: [0], unit: "V" },
            y: { columns: [1], unit: "A" },
            segmentation: { kind: "auto" },
            legend: { target: "auto" },
          }],
          stopOnError: false,
        },
        templateFingerprint: "template:test",
        inputRanges: [{
          fileId: "file-a",
          rawTableId: "file-a",
          range: {
            startRow: 1,
            endRow: 1,
            startCol: 0,
            endCol: 1,
          },
        }],
        outputSeriesIds: ["series-1"],
        outputCurveKeys: ["base:iv:transfer:series-1"],
        warnings: [],
        errors: [],
      },
      series: [{
        fileId: "file-a",
        sheetId: "file-a",
        id: "series-1",
        groupIndex: 0,
        yCol: 1,
        y: [1],
      }],
      curves: [{
        fileId: "file-a",
        seriesId: "series-1",
        curveGeneration: "base",
        curveFamily: "iv",
        ivMode: "transfer",
        lineage: {
          curveGeneration: "base",
          baseFamily: "iv",
          ivMode: "transfer",
          baseSeries: {
            fileId: "file-a",
            seriesId: "series-1",
          },
        },
        points: [{ x: 0, y: 1 }],
        signature: "curve-a",
      }],
    }]);

    const record = session.getSnapshot().filesById["file-a"];
    assert.equal(record.latestSliceRunId, "slice-run-a");
    assert.equal(record.sliceRunsById?.["slice-run-a"]?.templateFingerprint, "template:test");
    assert.equal(record.seriesById["series-1"].yCol, 1);
    assert.equal(record.curvesByKey["base:iv:transfer:series-1"]?.signature, "curve-a");
    assert.deepEqual(events.map(event => event.reason), ["sliceRunChanged"]);
    assert.deepEqual(events[0]?.fileIds, ["file-a"]);
    assert.deepEqual(events[0]?.seriesIds, ["series-1"]);
    assert.deepEqual(events[0]?.curveKeys, ["base:iv:transfer:series-1"]);
    dispose.dispose();
  });

  test("commits multiple slice outputs through one session event", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [
      { fileId: "file-a", fileName: "Raw A.csv" },
      { fileId: "file-b", fileName: "Raw B.csv" },
    ]);
    events.length = 0;

    const first = createSliceCommitForTest(session.getSnapshot(), {
      fileId: "file-a",
      fileName: "Slice Output A.csv",
      curveType: "transfer",
      xGroups: [[0]],
      series: [{ id: "series-a", groupIndex: 0, y: [1] }],
    });
    const second = createSliceCommitForTest(session.getSnapshot(), {
      fileId: "file-b",
      fileName: "Slice Output B.csv",
      curveType: "transfer",
      xGroups: [[0]],
      series: [{ id: "series-b", groupIndex: 0, y: [2] }],
    });
    assert.ok(first);
    assert.ok(second);

    session.commitSliceRuns([first, second]);

    assert.deepEqual(events.map(event => event.reason), ["sliceRunChanged"]);
    assert.deepEqual(events[0]?.fileIds, ["file-a", "file-b"]);
    assert.deepEqual(events[0]?.seriesIds, ["series-a", "series-b"]);
    assert.ok(events[0]?.curveKeys?.includes("base:iv:transfer:series-a"));
    assert.ok(events[0]?.curveKeys?.includes("base:iv:transfer:series-b"));
    dispose.dispose();
  });

  test("commits calculated curves and metrics through one session event", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const dispose = session.onDidChangeSession(event => {
      events.push(event);
    });
    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw.csv" }]);
    commitTemplateOutputForTest(session, {
      curveType: "transfer",
      fileId: "file-a",
      fileName: "Slice Output.csv",
      series: [{
        groupIndex: 0,
        id: "series-1",
        y: [1, 2],
      }],
      xGroups: [[0, 1]],
    });
    events.length = 0;

    const derivedCurve: CurveRecord = {
      curveFamily: "gm",
      curveGeneration: "derived",
      fileId: "file-a",
      lineage: {
        curveGeneration: "derived",
        derivedFamily: "gm",
        inputCurve: {
          curveKey: "base:iv:transfer:series-1",
          fileId: "file-a",
          seriesId: "series-1",
          signature: "base-signature",
        },
      },
      points: [{ x: 0, y: 2 }],
      seriesId: "series-1",
      signature: "derived-signature",
    };
    const metricKey = "current:series-1:base" as MetricKey;
    const metric: MetricRecord = {
      contextKey: "base",
      fileId: "file-a",
      inputCurves: [],
      inputSignatures: [],
      key: metricKey,
      metricFamily: "current",
      seriesId: "series-1",
      value: {
        candidateWindows: [],
        ion: null,
        ionIoff: null,
        ioff: null,
        method: "auto",
        xAtIon: null,
        xAtIoff: null,
      },
    };

    session.commitCalculatedRecordsBatch([{
      curves: [derivedCurve],
      fileId: "file-a",
      metrics: [metric],
      replaceCurveGenerations: ["derived"],
      replaceMetrics: true,
    }]);

    assert.deepEqual(events.map(event => event.reason), ["calculatedRecordsChanged"]);
    assert.deepEqual(events[0]?.fileIds, ["file-a"]);
    assert.ok(events[0]?.curveKeys?.includes("derived:gm:default:series-1"));
    assert.deepEqual(events[0]?.metricKeys, [metricKey]);
    assert.deepEqual(events[0]?.seriesIds, ["series-1"]);
    const record = session.getSnapshot().filesById["file-a"];
    assert.equal(record.curvesByKey["derived:gm:default:series-1"], derivedCurve);
    assert.equal(record.metricsByKey[metricKey], metric);
    dispose.dispose();
  });

  test("adds and replaces raw files through canonical session methods", () => {
    const session = store.add(new SessionService());

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
      fileName: "Slice Output A.csv",
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
    const session = store.add(new SessionService());
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
  });

  test("increments raw table versions when imported files replace an existing source", () => {
    const session = store.add(new SessionService());

    session.commitFileImport(createSingleRawTableImportResult());
    session.commitFileImport(createSingleRawTableImportResult());

    const file = session.getSnapshot().filesById["file-a"];
    assert.deepEqual(file.rawTableVersionsById, { "table-a": 2 });
  });

  test("skips imported files that duplicate an existing raw source identity", () => {
    const session = store.add(new SessionService());

    const first = session.commitFileImport(createRawIdentityKeyedImportResult("file-a", "raw-identity-key"));
    const second = session.commitFileImport(createRawIdentityKeyedImportResult("file-next-id", "raw-identity-key"));

    assert.deepEqual(first, {
      importedFileIds: ["file-a"],
      skippedDuplicateFileIds: [],
    });
    assert.deepEqual(second, {
      importedFileIds: [],
      skippedDuplicateFileIds: ["file-next-id"],
    });
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(session.getSnapshot().filesById["file-next-id"], undefined);
  });

  test("deduplicates raw source identities within one import commit", () => {
    const session = store.add(new SessionService());

    const result = session.commitFileImport({
      createdAt: 123,
      diagnostics: [],
      files: [
        createRawIdentityKeyedImportedFileRecord("file-a", "raw-identity-key"),
        createRawIdentityKeyedImportedFileRecord("file-next-id", "raw-identity-key"),
      ],
    });

    assert.deepEqual(result, {
      importedFileIds: ["file-a"],
      skippedDuplicateFileIds: ["file-next-id"],
    });
    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(session.getSnapshot().filesById["file-next-id"], undefined);
  });

  test("commits file import as raw table data", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const disposable = session.onDidChangeSession(event => {
      events.push(event);
    });

    const result = session.commitFileImport(createSingleRawTableImportResult());

    assert.deepEqual(result, {
      importedFileIds: ["file-a"],
      skippedDuplicateFileIds: [],
    });
    assert.deepEqual(events, [{
      fileIds: ["file-a"],
      rawTableIds: ["table-a"],
      rawTableRefs: [{ fileId: "file-a", rawTableId: "table-a" }],
      reason: "rawTablesChanged",
      sessionVersion: 1,
    }]);
    disposable.dispose();
  });

  test("keeps imported file handles and table keys through raw canonical projection", () => {
    const session = store.add(new SessionService());
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
      tableKey: "transfer.csv::24::123",
      sourcePath: "C:/data/Transfer.csv",
      rowCount: 2,
      columnCount: 2,
      maxCellLengths: [2, 4],
    }]);

    const snapshot = session.getSnapshot();
    const file = snapshot.filesById["file-a"];
    const table = file.raw.tablesById["transfer.csv::24::123"];

    assert.equal(file.raw.file, sourceFile);
    assert.equal(file.raw.rawKey, "transfer.csv::24::123");
    assert.equal(file.raw.normalizedCsvPath, "C:/tmp/transfer.csv");
    assert.equal(file.raw.filePath, "C:/data/Transfer.csv");
    assert.equal(table.rowCount, 2);
    assert.equal(table.columnCount, 2);
    assert.deepEqual(table.maxCellLengths, [2, 4]);
  });

  test("renames imported file display metadata without changing raw provenance", () => {
    const session = store.add(new SessionService());
    const events: SessionChangeEvent[] = [];
    const disposable = session.onDidChangeSession(event => {
      events.push(event);
    });

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);

    assert.equal(session.renameFile("file-a", "Display A.csv"), true);
    assert.equal(session.renameFile("file-a", "Display A.csv"), false);
    assert.equal(session.renameFile("file-a", "   "), false);

    const snapshot = session.getSnapshot();
    const file = snapshot.filesById["file-a"];

    assert.equal(file.name, "Display A.csv");
    assert.equal(file.raw.fileName, "Raw A.csv");
    assert.deepEqual(events.map(event => event.reason), [
      "rawTablesChanged",
      "fileMetadataChanged",
    ]);
    assert.deepEqual(events[1], {
      fileIds: ["file-a"],
      reason: "fileMetadataChanged",
      sessionVersion: 2,
    });
    disposable.dispose();
  });

  test("removes files through one session owner", () => {
    const session = store.add(new SessionService());

    commitRawFilesForTest(session, [
      { fileId: "file-a", fileName: "Raw A.csv" },
      { fileId: "file-b", fileName: "Raw B.csv" },
    ]);
    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Slice Output A.csv",
      curveType: "transfer",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session);
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
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Slice Output A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session);

    const curve = session.getSnapshot()
      .filesById["file-a"]
      .curvesByKey["derived:gm:default:series-1"];
    assert.equal(curve.curveGeneration, "derived");
    assert.equal(curve.curveFamily, "gm");
    assert.equal(curve.fileId, "file-a");
    assert.equal(curve.seriesId, "series-1");
    assert.equal(curve.lineage.curveGeneration, "derived");
  });

  test("replaces calculated curve records instead of accumulating stale derived curves", () => {
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Slice Output A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session);
    clearDerivedCurvesForTest(session);

    const curvesByKey = session.getSnapshot().filesById["file-a"].curvesByKey;
    assert.equal(curvesByKey["derived:gm:default:series-1"], undefined);
    assert.notEqual(curvesByKey["base:iv:transfer:series-1"], undefined);
  });

  test("keeps calculated iv projections out of canonical base curves", () => {
    const session = store.add(new SessionService());

    commitTemplateOutputForTest(session, {
      fileId: "file-a",
      fileName: "Slice Output A.csv",
      curveType: "transfer",
      xAxisRole: "vg",
      xGroups: [[0, 1]],
      series: [{
        id: "series-1",
        groupIndex: 0,
        y: [1, 2],
      }],
    });
    replaceDerivedCurvesForTest(session);

    const curvesByKey = session.getSnapshot().filesById["file-a"].curvesByKey;
    assert.notEqual(curvesByKey["base:iv:transfer:series-1"], undefined);
    assert.equal(curvesByKey["base:iv:default:series-1"], undefined);
  });

  test("clears session data", () => {
    const session = store.add(new SessionService());

    commitRawFilesForTest(session, [{ fileId: "file-a", fileName: "Raw A.csv" }]);
    session.clearSession();

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.filesById, {});
    assert.deepEqual(snapshot.fileOrder, []);
  });

  test("notifies each active subscription", () => {
    const session = store.add(new SessionService());
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

const replaceDerivedCurvesForTest = (
  session: SessionService,
): void => {
  const snapshot = session.getSnapshot();
  const recordsByFileId = createCalculatedCurveRecordsByFile(
    snapshot.filesById,
    snapshot.fileOrder,
  );
  const fileIds = new Set([
    ...Object.keys(snapshot.filesById),
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

const clearDerivedCurvesForTest = (
  session: SessionService,
): void => {
  for (const fileId of Object.keys(session.getSnapshot().filesById)) {
    session.commitCurves({
      fileId,
      curves: [],
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

const createMultiRawTableImportResult = (): FileImportResult => ({
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
        "table-b": {
          columnCount: 2,
          fileId: "file-a",
          maxCellLengths: [2, 4],
          rawTableId: "table-b",
          rowCount: 2,
          rows: {
            kind: "inline",
            values: [["Vg", "Id"], ["1", "2e-9"]],
          },
          source: {
            kind: "csv",
          },
        },
      },
      rawTableOrder: ["table-a", "table-b"],
    },
  }],
});

const createRawIdentityKeyedImportResult = (
  fileId: string,
  rawKey: string,
): FileImportResult => ({
  createdAt: 123,
  diagnostics: [],
  files: [createRawIdentityKeyedImportedFileRecord(fileId, rawKey)],
});

const createRawIdentityKeyedImportedFileRecord = (
  fileId: string,
  rawKey: string,
): ImportedFileRecord => ({
  id: fileId,
  kind: "csv",
  name: "Transfer.csv",
  raw: {
    fileId,
    fileName: "Transfer.csv",
    lastModified: 123,
    rawKey,
    rawTablesById: {
      [fileId]: {
        columnCount: 2,
        fileId,
        maxCellLengths: [2, 4],
        rawTableId: fileId,
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
    rawTableOrder: [fileId],
    size: 24,
  },
});
