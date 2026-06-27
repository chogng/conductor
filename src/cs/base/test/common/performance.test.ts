import assert from "assert";

import {
  clearMarks,
  createPerformanceStageRecorder,
  getPerformanceNow,
  getMarks,
  mark,
  type PerformanceStageRecord,
} from "src/cs/base/common/performance";

suite("base/common/performance", () => {
  teardown(() => {
    clearMarks();
  });

  test("uses a monotonic performance clock when available", () => {
    assert.equal(typeof getPerformanceNow(), "number");
  });

  test("records invisible performance marks", () => {
    mark("table/willResolve", { startTime: 42 });
    mark("table/didResolve", { startTime: 45 });

    assert.deepEqual(getMarks().map(entry => entry.name), [
      "table/willResolve",
      "table/didResolve",
    ]);
    assert.deepEqual(getMarks().map(entry => entry.startTime), [42, 45]);

    clearMarks("table/willResolve");

    assert.deepEqual(getMarks().map(entry => entry.name), ["table/didResolve"]);
  });

  test("does not read context while disabled", () => {
    let contextReadCount = 0;
    const records: PerformanceStageRecord[] = [];
    const recorder = createPerformanceStageRecorder({
      readContext: () => {
        contextReadCount += 1;
        return {
          measurement: { visibleRows: 4 },
          trace: { selectedFileId: "dirty-file-id" },
        };
      },
      readState: () => ({ measure: false, trace: false }),
      record: record => records.push(record),
    });

    const end = recorder.start("table.render");
    end({ touchedCellCount: 1 });

    assert.equal(contextReadCount, 0);
    assert.deepEqual(records, []);
  });

  test("records merged start and end context", () => {
    let now = 10;
    let contextReadCount = 0;
    const records: PerformanceStageRecord[] = [];
    const recorder = createPerformanceStageRecorder({
      now: () => now,
      readContext: () => {
        contextReadCount += 1;
        return contextReadCount === 1
          ? {
            measurement: { visibleRows: 4 },
            trace: { rowCount: 100 },
          }
          : {
            measurement: { visibleRows: 8 },
            trace: { rowCount: 200 },
          };
      },
      readState: () => ({ measure: true, trace: true }),
      record: record => records.push(record),
    });

    const end = recorder.start("table.render", {
      bodyCellRenderCount: 2,
    });
    now = 17;
    end({ touchedCellCount: 3 });

    assert.equal(records.length, 1);
    assert.equal(records[0].stage, "table.render");
    assert.equal(records[0].durationMs, 7);
    assert.deepEqual(records[0].state, { measure: true, trace: true });
    assert.deepEqual(records[0].measurementMeta, {
      bodyCellRenderCount: 2,
      durationMs: 7,
      touchedCellCount: 3,
      visibleRows: 8,
    });
    assert.deepEqual(records[0].traceMeta, {
      bodyCellRenderCount: 2,
      durationMs: 7,
      rowCount: 200,
      touchedCellCount: 3,
    });
  });

  test("passes recorder state to context readers", () => {
    const states: Array<{ measure: boolean; trace: boolean }> = [];
    const records: PerformanceStageRecord[] = [];
    const recorder = createPerformanceStageRecorder({
      now: () => 1,
      readContext: state => {
        states.push(state);
        const measurement = { visibleRows: 4 };
        if (!state.trace) {
          return { measurement };
        }
        return {
          measurement,
          trace: { selectedFileId: "dirty-file-id" },
        };
      },
      readState: () => ({ measure: true, trace: false }),
      record: record => records.push(record),
    });

    const end = recorder.start("table.render");
    end();

    assert.deepEqual(states, [
      { measure: true, trace: false },
      { measure: true, trace: false },
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].traceMeta, {
      durationMs: 0,
    });
  });

  test("records each stage end at most once", () => {
    let now = 1;
    const records: PerformanceStageRecord[] = [];
    const recorder = createPerformanceStageRecorder({
      now: () => now,
      readContext: () => ({}),
      readState: () => ({ measure: true, trace: false }),
      record: record => records.push(record),
    });

    const end = recorder.start("table.render");
    now = 2;
    end();
    now = 3;
    end();

    assert.equal(records.length, 1);
    assert.equal(records[0].durationMs, 1);
  });
});
