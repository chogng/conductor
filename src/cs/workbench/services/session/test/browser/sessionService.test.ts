import assert from "assert";

import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createRawFilesFromRecords } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  getSelectedTemplateIdFromViewState,
  getTemplateFormStateFromViewState,
  getTemplateModeFromViewState,
  getTemplateSelectionsFromViewState,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  FileRecord,
  MetricKey,
} from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/session/test/browser/sessionService", () => {
  test("batches multiple state writes into one notification", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.batch(() => {
      session.addRawFiles([{ fileId: "file-a", fileName: "Raw A.csv" }]);
      session.setTemplateMode("save");
    });

    assert.equal(changeCount, 1);
    dispose();
  });

  test("keeps nested writes in the same batch notification", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.batch(() => {
      session.setTemplateMode("save");
      session.batch(() => {
        session.setSelectedTemplateId("template-a");
        session.setTemplateFormState((previous) => ({
          ...previous,
          name: "Template A",
        }));
      });
    });

    const snapshot = session.getSnapshot();
    assert.equal(changeCount, 1);
    assert.equal(getTemplateModeFromViewState(snapshot.viewState), "save");
    assert.equal(getSelectedTemplateIdFromViewState(snapshot.viewState), "template-a");
    assert.equal(getTemplateFormStateFromViewState(snapshot.viewState).name, "Template A");
    dispose();
  });

  test("subscription dispose stops future notifications", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.setTemplateMode("save");
    dispose();
    session.setTemplateMode("select");

    assert.equal(changeCount, 1);
    assert.equal(getTemplateModeFromViewState(session.getSnapshot().viewState), "select");
  });

  test("skips notifications when the value is unchanged", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.setTemplateMode("select");
    session.setSelectedTemplateId(null);

    assert.equal(changeCount, 0);
    dispose();
  });

  test("initializes canonical target and view state", () => {
    const session = new SessionService();

    assert.deepEqual(session.getSnapshot().activeTarget, { kind: "none" });
    assert.deepEqual(session.getSnapshot().viewState, {});
  });

  test("omits legacy buckets from the view context", () => {
    const session = new SessionService();

    session.addRawFiles([{ fileId: "file-a", fileName: "Raw A.csv" }]);
    const context = session.createContextValue(session.getSnapshot()) as Record<string, unknown>;

    assert.equal("filesById" in context, true);
    assert.equal("fileOrder" in context, true);
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
  });

  test("normalizes and stores active target", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.setActiveTarget({
      kind: "sheet",
      fileId: " file-a ",
      sheetId: " sheet-1 ",
    });

    assert.equal(changeCount, 1);
    assert.deepEqual(session.getSnapshot().activeTarget, {
      kind: "sheet",
      fileId: "file-a",
      sheetId: "sheet-1",
    });

    session.setActiveTarget((previous) => previous);

    assert.equal(changeCount, 1);
    dispose();
  });

  test("stores view-local state separately from active target", () => {
    const session = new SessionService();

    session.setActiveTarget({ kind: "file", fileId: "file-a" });
    session.setTableSelection({
      kind: "range",
      fileId: "file-a",
      sheetId: "sheet-1",
      range: {
        startRow: 1,
        endRow: 2,
        startCol: 3,
        endCol: 4,
      },
    });

    assert.deepEqual(session.getSnapshot().activeTarget, {
      kind: "file",
      fileId: "file-a",
    });
    assert.deepEqual(session.getSnapshot().viewState.table?.selection, {
      kind: "range",
      fileId: "file-a",
      sheetId: "sheet-1",
      range: {
        startRow: 1,
        endRow: 2,
        startCol: 3,
        endCol: 4,
      },
    });

    session.setTableSelection(undefined);

    assert.deepEqual(session.getSnapshot().activeTarget, {
      kind: "file",
      fileId: "file-a",
    });
    assert.deepEqual(session.getSnapshot().viewState, {
      table: {},
    });
  });

  test("stores arbitrary view state without changing active target", () => {
    const session = new SessionService();

    session.setActiveTarget({ kind: "file", fileId: "file-a" });
    session.setViewState({
      table: {
        loading: true,
      },
      chart: {
        selectedCurveKeys: [
          "base:iv:transfer:series-1",
        ],
      },
      curves: {
        "base:iv:transfer:series-1": {
          hidden: true,
        },
      },
    });

    assert.deepEqual(session.getSnapshot().activeTarget, {
      kind: "file",
      fileId: "file-a",
    });
    assert.deepEqual(session.getSnapshot().viewState, {
      table: {
        loading: true,
      },
      chart: {
        selectedCurveKeys: [
          "base:iv:transfer:series-1",
        ],
      },
      curves: {
        "base:iv:transfer:series-1": {
          hidden: true,
        },
      },
    });
  });

  test("stores file template selections", () => {
    const session = new SessionService();

    session.setFileTemplateSelectionsByFileId({
      "file-a": { kind: "template", templateId: "template-a" },
      "file-b": { kind: "auto" },
    });

    assert.deepEqual(getTemplateSelectionsFromViewState(session.getSnapshot().viewState), {
      "file-a": { kind: "template", templateId: "template-a" },
      "file-b": { kind: "auto" },
    });
  });

  test("stores and clears metric inputs in canonical file records", () => {
    const session = new SessionService();
    const metricKey = "current:series-1:base" as MetricKey;

    session.commitProcessedFile({
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

    session.addRawFiles([{
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
    session.setFileTemplateSelectionsByFileId({
      "file-a": { kind: "template", templateId: "template-a" },
    });
    session.commitProcessedFile({
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
    });

    const snapshot = session.getSnapshot();
    const record = snapshot.filesById["file-a"];
    const curve = record.curvesByKey["base:iv:transfer:series-1"];

    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(record.raw.tablesById["sheet-1"].sheetName, "Sweep");
    assert.equal(record.raw.tablesById["sheet-1"].rowCount, 4);
    assert.equal(record.assessment.baseFamily, "iv");
    assert.equal(record.assessment.baseFamilyConfidence, "high");
    assert.equal(record.templateRun?.selection.kind, "template");
    assert.equal(record.seriesById["series-1"].legendValue, "Vd=1");
    assert.equal(record.axis?.x.unit, "V");
    assert.equal(record.axis?.y.unit, "A");
    assert.equal(curve.curveGeneration, "base");
    assert.equal(curve.curveFamily, "iv");
    assert.equal(curve.ivMode, "transfer");
    assert.deepEqual(curve.points, [
      { x: 0, y: 1e-9 },
      { x: 1, y: 1e-6 },
    ]);
    assert.deepEqual(curve.domain?.yLog10Abs, [-9, -6]);
  });

  test("adds and replaces raw files through canonical session methods", () => {
    const session = new SessionService();

    session.addRawFiles([
      {
        fileId: "file-a",
        fileName: "Raw A.csv",
        rowCount: 3,
        columnCount: 2,
      },
    ]);

    assert.deepEqual(session.getSnapshot().fileOrder, ["file-a"]);
    assert.equal(session.getSnapshot().filesById["file-a"].raw.fileName, "Raw A.csv");

    session.commitProcessedFile({
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
    session.setFileTemplateSelectionsByFileId({
      "file-a": { kind: "auto" },
    });

    session.replaceRawFiles([
      {
        fileId: "file-b",
        fileName: "Raw B.csv",
        rowCount: 4,
        columnCount: 3,
      },
    ]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-b"]);
    assert.equal(snapshot.filesById["file-b"].raw.fileName, "Raw B.csv");
    assert.deepEqual(snapshot.filesById["file-b"].seriesOrder, []);
    assert.deepEqual(getTemplateSelectionsFromViewState(snapshot.viewState), {});
    assert.equal(snapshot.filesById["file-a"], undefined);
  });

  test("keeps imported file handles and source keys through raw canonical projection", () => {
    const session = new SessionService();
    const sourceFile = {
      lastModified: 123,
      name: "Transfer.csv",
      size: 24,
    };

    session.replaceRawFiles([{
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

  test("does not prune raw-only imported files before preview metadata loads", () => {
    const session = new SessionService();
    const sourceFile = {
      lastModified: 123,
      name: "Transfer.csv",
      size: 24,
    };

    session.replaceRawFiles([{
      file: sourceFile,
      fileId: "file-a",
      fileName: "Transfer.csv",
      sourceKey: "transfer.csv::24::123",
    }]);

    session.pruneFileSemantics([], []);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-a"]);
    assert.equal(snapshot.filesById["file-a"].raw.file, sourceFile);
  });

  test("removes files through one session owner", () => {
    const session = new SessionService();

    session.addRawFiles([
      { fileId: "file-a", fileName: "Raw A.csv" },
      { fileId: "file-b", fileName: "Raw B.csv" },
    ]);
    session.commitProcessedFile({
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
    session.replaceCalculatedCurves({
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
    session.setFileSemantics({
      fileId: "file-a",
      kind: "iv",
      x: { unit: "V" },
      y: { scale: "linear", unit: "A" },
    });
    session.setSeriesLabel("file-a", "series-1", "Edited");
    session.setFileTemplateSelectionsByFileId({
      "file-a": { kind: "auto" },
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
    session.setActiveTarget({ kind: "file", fileId: "file-a" });

    session.removeFiles(["file-a"]);

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.fileOrder, ["file-b"]);
    assert.equal(snapshot.filesById["file-b"].raw.fileName, "Raw B.csv");
    assert.equal(snapshot.filesById["file-a"], undefined);
    assert.deepEqual(getTemplateSelectionsFromViewState(snapshot.viewState), {});
    assert.deepEqual(snapshot.activeTarget, { kind: "none" });
  });

  test("replaces calculated curves through the session owner", () => {
    const session = new SessionService();

    session.commitProcessedFile({
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
    session.replaceCalculatedCurves({
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

    session.commitProcessedFile({
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
    session.replaceCalculatedCurves({
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
    session.replaceCalculatedCurves({});

    const curvesByKey = session.getSnapshot().filesById["file-a"].curvesByKey;
    assert.equal(curvesByKey["derived:gm:default:series-1"], undefined);
    assert.notEqual(curvesByKey["base:iv:transfer:series-1"], undefined);
  });

  test("keeps calculated iv read models out of canonical base curves", () => {
    const session = new SessionService();

    session.commitProcessedFile({
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
    session.replaceCalculatedCurves({
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

  test("clears session data without resetting global template form state", () => {
    const session = new SessionService();

    session.addRawFiles([{ fileId: "file-a", fileName: "Raw A.csv" }]);
    session.setTemplateFormState((previous) => ({
      ...previous,
      name: "Keep Template Draft",
    }));
    session.setPreviewFile({
      fileId: "file-a",
      fileName: "Raw A.csv",
      rowCount: 1,
      columnCount: 1,
      maxCellLengths: [1],
    });
    assert.equal(session.getSnapshot().viewState.table?.previewFile?.fileId, "file-a");
    session.setActiveTarget({ kind: "file", fileId: "file-a" });
    session.setViewState((previous) => ({
      ...previous,
      table: {
        loading: true,
      },
    }));

    session.clearSessionData();

    const snapshot = session.getSnapshot();
    assert.deepEqual(snapshot.filesById, {});
    assert.deepEqual(snapshot.fileOrder, []);
    assert.deepEqual(snapshot.activeTarget, { kind: "none" });
    assert.equal(snapshot.viewState.table, undefined);
    assert.equal(getTemplateFormStateFromViewState(snapshot.viewState).name, "Keep Template Draft");
  });

  test("notifies each active subscription", () => {
    const session = new SessionService();
    let firstChangeCount = 0;
    let secondChangeCount = 0;
    const disposeFirst = session.subscribe(() => {
      firstChangeCount += 1;
    });
    const disposeSecond = session.subscribe(() => {
      secondChangeCount += 1;
    });

    session.setTemplateMode("save");
    disposeFirst();
    session.setTemplateMode("select");

    assert.equal(firstChangeCount, 1);
    assert.equal(secondChangeCount, 2);
    disposeSecond();
  });

  test("restores notification state after thrown batch callback", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    assert.throws(
      () => {
        session.batch(() => {
          session.setTemplateMode("save");
          throw new Error("fail batch");
        });
      },
      /fail batch/,
    );

    assert.equal(changeCount, 1);
    assert.equal(getTemplateModeFromViewState(session.getSnapshot().viewState), "save");

    session.setSelectedTemplateId("template-a");

    assert.equal(changeCount, 2);
    assert.equal(getSelectedTemplateIdFromViewState(session.getSnapshot().viewState), "template-a");
    dispose();
  });

  test("stores file semantics and curve data in canonical records", () => {
    const session = new SessionService();
    let changes = 0;
    session.subscribe(() => changes++);

    session.batch(() => {
      session.setFileSemantics({
        fileId: " file-a ",
        kind: "iv",
        sourceFileName: "Output.csv",
        x: {
          label: "Vd",
          unit: "V",
        },
        y: {
          label: "Id",
          scale: "log",
          unit: "A",
        },
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-a",
        seriesId: "series-1",
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
        signature: "sig:series-1",
      });
    });

    const semantics = session.getFileSemantics("file-a");
    const curve = session.getCurveData({
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    });

    assert.equal(changes, 1);
    assert.equal(semantics?.fileId, "file-a");
    assert.equal(semantics?.x.unit, "V");
    assert.equal(semantics?.y.scale, "log");
    assert.equal(curve?.points.length, 2);
    assert.equal(session.getSnapshot().filesById["file-a"].axis?.x.unit, "V");
  });

  test("updates file semantics without duplicating curve-level axis state", () => {
    const session = new SessionService();
    session.setFileSemantics({
      fileId: "file-a",
      kind: "iv",
      x: {
        label: "Vd",
        unit: "V",
      },
      y: {
        label: "Id",
        scale: "linear",
        unit: "A",
      },
    });

    session.updateFileSemantics("file-a", {
      x: { unit: "mV" },
      y: { scale: "log" },
    });

    const semantics = session.getFileSemantics("file-a");
    assert.equal(semantics?.x.label, "Vd");
    assert.equal(semantics?.x.unit, "mV");
    assert.equal(semantics?.y.label, "Id");
    assert.equal(semantics?.y.scale, "log");
  });

  test("prunes stale file semantics by file id and curve key", () => {
    const session = new SessionService();
    session.batch(() => {
      session.setFileSemantics({
        fileId: "file-a",
        kind: "iv",
        x: { unit: "V" },
        y: { scale: "linear", unit: "A" },
      });
      session.setFileSemantics({
        fileId: "file-b",
        kind: "iv",
        x: { unit: "V" },
        y: { scale: "linear", unit: "A" },
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-a",
        seriesId: "series-1",
        points: [{ x: 0, y: 1 }],
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-b",
        seriesId: "series-2",
        points: [{ x: 0, y: 2 }],
      });
    });

    session.pruneFileSemantics([
      "file-a",
    ], [{
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    }]);

    assert.ok(session.getFileSemantics("file-a"));
    assert.equal(session.getFileSemantics("file-b"), undefined);
    assert.ok(session.getCurveData({
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    }));
    assert.equal(session.getCurveData({
      curveKind: "iv",
      fileId: "file-b",
      seriesId: "series-2",
    }), undefined);
  });

  test("stores series labels and resolves overrides before source labels", () => {
    const session = new SessionService();

    session.commitProcessedFile({
      fileId: "file-a",
      xGroups: [[0]],
      series: [{ id: "series-a", groupIndex: 0, y: [1] }],
    });
    session.setSeriesLabel("file-a", "series-a", "Edited Label");

    assert.equal(session.getSeriesLabel("file-a", "series-a"), "Edited Label");
    assert.deepEqual(session.getSeriesLabels("file-a"), {
      "series-a": "Edited Label",
    });
    assert.equal(
      session.resolveSeriesLabel(
        { fileId: "file-a" },
        { id: "series-a", legendValue: "Vg=0", name: "Source Label" },
        0,
      ),
      "Edited Label",
    );
  });

  test("resolves series label fallback from legend value, name, and series index", () => {
    const session = new SessionService();

    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a", legendValue: "Vg=0" }, 0),
      "Vg=0",
    );
    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a", name: "Source Label" }, 0),
      "Source Label",
    );
    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a" }, 2),
      "Series 3",
    );
  });

  test("prunes stale series labels", () => {
    const session = new SessionService();

    session.commitProcessedFile({
      fileId: "file-a",
      xGroups: [[0]],
      series: [
        { id: "series-a", groupIndex: 0, y: [1] },
        { id: "series-b", groupIndex: 0, y: [2] },
      ],
    });
    session.commitProcessedFile({
      fileId: "file-b",
      xGroups: [[0]],
      series: [{ id: "series-c", groupIndex: 0, y: [3] }],
    });
    session.setSeriesLabel("file-a", "series-a", "Edited A");
    session.setSeriesLabel("file-a", "series-b", "Edited B");
    session.setSeriesLabel("file-b", "series-c", "Edited C");
    session.pruneSeriesLabels([
      {
        fileId: "file-a",
        series: [{ id: "series-a" }],
      },
    ]);

    assert.deepEqual(session.getSeriesLabels("file-a"), {
      "series-a": "Edited A",
    });
    assert.deepEqual(session.getSeriesLabels("file-b"), {});
    assert.equal(
      session.getSnapshot().filesById["file-a"].seriesById["series-a"].labelOverride,
      "Edited A",
    );
  });

  test("prunes stale series labels from canonical file records", () => {
    const session = new SessionService();

    session.commitProcessedFile({
      fileId: "file-a",
      xGroups: [[0]],
      series: [
        { id: "series-a", groupIndex: 0, y: [1] },
        { id: "series-b", groupIndex: 0, y: [2] },
      ],
    });
    session.commitProcessedFile({
      fileId: "file-b",
      xGroups: [[0]],
      series: [{ id: "series-c", groupIndex: 0, y: [3] }],
    });
    session.setSeriesLabel("file-a", "series-a", "Edited A");
    session.setSeriesLabel("file-a", "series-b", "Edited B");
    session.setSeriesLabel("file-b", "series-c", "Edited C");
    session.pruneSeriesLabelsByRecords(
      {
        "file-a": createFileRecord("file-a", ["series-a"]),
      },
      ["file-a"],
    );

    assert.deepEqual(session.getSeriesLabels("file-a"), {
      "series-a": "Edited A",
    });
    assert.deepEqual(session.getSeriesLabels("file-b"), {});
  });
});

const createFileRecord = (
  fileId: string,
  seriesOrder: readonly string[],
): FileRecord => ({
  assessment: {
    baseFamily: "iv",
  },
  baseCandidateOrder: [],
  baseCandidatesById: {},
  curvesByKey: {},
  id: fileId,
  metricsByKey: {},
  raw: {
    fileId,
    fileName: `${fileId}.csv`,
    tableOrder: [],
    tablesById: {},
  },
  seriesById: Object.fromEntries(seriesOrder.map((seriesId) => [
    seriesId,
    {
      fileId,
      groupIndex: 0,
      id: seriesId,
      y: [],
    },
  ])),
  seriesOrder: [...seriesOrder],
  xGroups: [],
});



