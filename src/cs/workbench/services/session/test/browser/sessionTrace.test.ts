/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  clearPerfEntries,
  getPerfEntries,
} from "src/cs/workbench/common/perf";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createProcessedFileSessionCommit } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import {
  createSessionSnapshotTraceSummary,
} from "src/cs/workbench/services/session/common/sessionTrace";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";

suite("workbench/services/session/test/browser/sessionTrace", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("records session snapshots across template output commit and read model", () => {
    const restorePerf = enablePerfForTest();
    try {
      const session = store.add(new SessionService());
      session.commitFileImport(createFileImportResultForTest("file-a"));

      const commit = createProcessedFileSessionCommit(
        session.getSnapshot(),
        {
          curveType: "output (vd)",
          fileId: "file-a",
          fileName: "Output.csv",
          series: [{
            groupIndex: 0,
            id: "series-1",
            y: new Float64Array([1e-9, 1e-6]),
          }],
          xAxisRole: "vd",
          xGroups: [new Float64Array([0, 1])],
        },
      );
      assert.ok(commit);

      session.commitTemplateOutput(commit);
      const readModel = createSessionReadModel(session.getSnapshot());

      assert.deepEqual(readModel.processedFileIds, ["file-a"]);

      const traceEntries = getPerfEntries()
        .filter(entry => entry.stage === "session:snapshot");
      const byTraceStage = new Map(
        traceEntries.map(entry => [String(entry.meta.traceStage), entry.meta]),
      );
      const afterCommit = byTraceStage.get("sessionService.commitTemplateOutputs.after");
      const readModelTrace = byTraceStage.get("createSessionReadModel");

      assert.ok(byTraceStage.has("sessionService.replaceSnapshot"));
      assert.equal(afterCommit?.processedFileCount, 1);
      assert.equal(afterCommit?.baseCurveCount, 1);
      assert.equal(afterCommit?.curveCount, 1);
      assert.equal(afterCommit?.pointCount, 2);
      assert.equal(readModelTrace?.processedProjectionCount, 1);
      assert.equal(readModelTrace?.processedFileCount, 1);
      assert.deepEqual(
        (afterCommit?.sampleFiles as Array<{ readonly fileId: string; readonly pointCount: number }> | undefined)
          ?.map(file => ({ fileId: file.fileId, pointCount: file.pointCount })),
        [{ fileId: "file-a", pointCount: 2 }],
      );
    } finally {
      restorePerf();
    }
  });

  test("keeps requested sample files specific to each snapshot trace summary", () => {
    const session = store.add(new SessionService());
    session.commitFileImport(createFileImportResultForTest("file-a"));
    session.commitFileImport(createFileImportResultForTest("file-b"));
    commitProcessedOutputForTest(session, "file-a", [1e-9, 1e-6]);
    commitProcessedOutputForTest(session, "file-b", [2e-9, 2e-6]);

    const snapshot = session.getSnapshot();
    const first = createSessionSnapshotTraceSummary(snapshot, {
      fileIds: ["file-b"],
      sampleSize: 1,
    });
    const second = createSessionSnapshotTraceSummary(snapshot, {
      fileIds: ["file-a"],
      sampleSize: 1,
    });

    assert.equal(first.processedFileCount, 2);
    assert.equal(second.processedFileCount, 2);
    assert.equal(first.pointCount, second.pointCount);
    assert.deepEqual(first.sampleFiles.map(file => file.fileId), ["file-b"]);
    assert.deepEqual(second.sampleFiles.map(file => file.fileId), ["file-a"]);
  });
});

const enablePerfForTest = (): (() => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousConsoleInfo = console.info;
  console.info = () => undefined;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => key === "conductor.perf" ? "1" : null,
    },
  });
  clearPerfEntries();
  return () => {
    clearPerfEntries();
    console.info = previousConsoleInfo;
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  };
};

const createFileImportResultForTest = (fileId: string): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: [{
    id: fileId,
    kind: "csv",
    name: "Output.csv",
    raw: {
      fileId,
      fileName: "Output.csv",
      rawFile: {},
      rawTableOrder: [fileId],
      rawTablesById: {
        [fileId]: {
          columnCount: 3,
          fileId,
          maxCellLengths: [],
          rawTableId: fileId,
          rowCount: 2,
          rows: {
            kind: "inline",
            values: [
              ["Vd", "Id"],
              [0, 1e-9],
              [1, 1e-6],
            ],
          },
          source: {
            kind: "csv",
          },
        },
      },
    },
  }],
});

const commitProcessedOutputForTest = (
  session: SessionService,
  fileId: string,
  y: readonly number[],
): void => {
  const commit = createProcessedFileSessionCommit(
    session.getSnapshot(),
    {
      curveType: "output (vd)",
      fileId,
      fileName: "Output.csv",
      series: [{
        groupIndex: 0,
        id: `${fileId}-series`,
        y: new Float64Array(y),
      }],
      xAxisRole: "vd",
      xGroups: [new Float64Array([0, 1])],
    },
  );
  assert.ok(commit);
  session.commitTemplateOutput(commit);
};
