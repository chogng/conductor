import assert from "assert";

import {
  createPerformanceStageRecorder,
  getAndClearPerformanceMeasurements,
  setPerformanceMeasurementEnabled,
  startPerformanceMeasurement,
} from "src/cs/workbench/contrib/performance/browser/performanceMeasurements";
import {
  createTablePerformanceDiagnosticsReportText,
  resetTablePerformanceDiagnosticsReports,
} from "src/cs/workbench/contrib/performance/browser/tablePerformanceDiagnostics";

suite("workbench/contrib/performance/browser/performanceMeasurements", () => {
  teardown(() => {
    setPerformanceMeasurementEnabled(false);
    resetTablePerformanceDiagnosticsReports();
  });

  test("does not collect measurements while disabled", () => {
    setPerformanceMeasurementEnabled(false);
    const endTrace = startPerformanceMeasurement("table.renderTable", {}, {
      visibleColumns: 4,
      visibleRows: 12,
    });

    endTrace({}, { bodyCellRenderCount: 3 });

    assert.equal(getAndClearPerformanceMeasurements(), undefined);
  });

  test("does not read stage context while instrumentation is disabled", () => {
    let contextReadCount = 0;
    const performance = createPerformanceStageRecorder(() => {
      contextReadCount += 1;
      return {
        measurement: { visibleColumns: 4, visibleRows: 12 },
        trace: { selectedFileId: "dirty-file-id" },
      };
    });

    const endTrace = performance.start("table.renderTable", {
      bodyCellRenderCount: 2,
    });
    endTrace({ touchedCellCount: 3 });

    assert.equal(contextReadCount, 0);
    assert.equal(getAndClearPerformanceMeasurements(), undefined);
  });

  test("stage recorder separates trace context from measurements", () => {
    setPerformanceMeasurementEnabled(true);
    const states: Array<{ measure: boolean; trace: boolean }> = [];
    const performance = createPerformanceStageRecorder(state => {
      states.push(state);
      const measurement = {
        visibleColumns: 4,
        visibleRows: 12,
      };
      if (!state.trace) {
        return { measurement };
      }
      return {
        measurement,
        trace: {
          selectedFileId: "dirty-file-id",
          sourceKey: "dirty-source-key",
        },
      };
    });

    const endTrace = performance.start("table.renderTable", {
      bodyCellRenderCount: 3,
      selectedFileId: "dirty-start",
    });
    endTrace({
      gridChanged: true,
      selectedFileId: "dirty-end",
      touchedCellCount: 5,
    });

    const measurements = getAndClearPerformanceMeasurements();
    assert.ok(measurements);
    assert.equal(measurements.sampleCount, 1);
    assert.equal(JSON.stringify(measurements).includes("dirty"), false);
    assert.deepEqual(states, [
      { measure: true, trace: false },
      { measure: true, trace: false },
    ]);

    const stage = measurements.stages["table.renderTable"];
    assert.ok(stage);
    assert.equal(stage.bodyCellRenderCount, 3);
    assert.equal(stage.gridChangedCount, 1);
    assert.equal(stage.maxVisibleColumns, 4);
    assert.equal(stage.maxVisibleRows, 12);
    assert.equal(stage.touchedCellCount, 5);
  });

  test("aggregates only sanitized measurement fields", () => {
    setPerformanceMeasurementEnabled(true);
    const endTrace = startPerformanceMeasurement("table.renderTable", {
      selectedFileId: "dirty-file-id",
      sourceKey: "dirty-source-key",
    }, {
      visibleColumns: 4,
      visibleRows: 12,
    });

    endTrace({
      selectedFileId: "dirty-file-id",
    }, {
      bodyCellRenderCount: 3,
      gridChanged: true,
      headerCellRenderCount: 1,
      patchResult: "patched",
      touchedCellCount: 5,
    });

    const measurements = getAndClearPerformanceMeasurements();
    assert.ok(measurements);
    assert.equal(measurements.sampleCount, 1);
    assert.equal(JSON.stringify(measurements).includes("dirty"), false);

    const stage = measurements.stages["table.renderTable"];
    assert.ok(stage);
    assert.equal(stage.bodyCellRenderCount, 3);
    assert.equal(stage.gridChangedCount, 1);
    assert.equal(stage.headerCellRenderCount, 1);
    assert.equal(stage.maxVisibleColumns, 4);
    assert.equal(stage.maxVisibleRows, 12);
    assert.equal(stage.patchedRowsSyncCount, 1);
    assert.equal(stage.touchedCellCount, 5);
  });

  test("formats a local diagnostics report for manual issue submission", () => {
    setPerformanceMeasurementEnabled(true);
    const endTrace = startPerformanceMeasurement("table.scroll", {
      selectedFileId: "dirty-file-id",
      sourceKey: "dirty-source-key",
    }, {
      visibleColumns: 6,
      visibleRows: 20,
    });

    endTrace({
      selectedFileId: "dirty-file-id",
    }, {
      bodyCellRenderCount: 120,
      renderedTable: true,
    });

    const { report, text } = createTablePerformanceDiagnosticsReportText();
    assert.equal(report.kind, "tablePerformanceDiagnostics");
    assert.equal(report.localOnly, true);
    assert.equal(report.sampleCount, 1);
    assert.equal(text.includes("```json"), true);
    assert.equal(text.includes("GitHub issue"), true);
    assert.equal(text.includes("dirty"), false);
  });
});
