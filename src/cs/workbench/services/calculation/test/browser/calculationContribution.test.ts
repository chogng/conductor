/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, type Event } from "src/cs/base/common/event";
import {
  CalculationService,
  shouldUpdateCalculationForSessionChange,
} from "src/cs/workbench/services/calculation/browser/calculation.contribution";
import type { CalculationRecordsWorkerRequest } from "src/cs/workbench/services/calculation/browser/calculationWorker";
import type {
  CommitCurvesBatchInput,
  CommitCurvesInput,
  CommitMetricsBatchInput,
  CommitMetricsInput,
  CommitCalculatedRecordsBatchInput,
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  BaseCurveKey,
  CurveKey,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/calculation/test/browser/calculationContribution", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("ignores session changes that do not affect calculated curve inputs", () => {
    for (const reason of [
      "rawTablesChanged",
      "assessmentChanged",
      "calculatedRecordsChanged",
      "metricsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
  });

  test("updates for slice, removal, clear, and metric input changes", () => {
    for (const reason of [
      "sliceRunChanged",
      "filesRemoved",
      "sessionCleared",
      "metricInputsChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldUpdateCalculationForSessionChange(createSessionChangeEvent(reason, 1)),
        true,
        reason,
      );
    }
  });

  test("updates only for base curve changes", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["base:iv:transfer:series-a" as CurveKey],
      })),
      true,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["derived:gm:default:series-a" as CurveKey],
      })),
      false,
    );
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["secondDerived:secondDerivative:default:series-a" as CurveKey],
      })),
      false,
    );
  });

  test("updates for curve replacement events without committed curve keys", () => {
    assert.equal(
      shouldUpdateCalculationForSessionChange(createSessionChangeEvent("curvesChanged", 1)),
      true,
    );
  });

  test("recalculates only files affected by a base curve session change", async () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const curveCommits: CommitCurvesInput[] = [];
    const metricCommits: CommitMetricsInput[] = [];
    let snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: input => curveCommits.push(...input),
      commitCalculatedRecordsBatch: input => {
        curveCommits.push(...input.map(commit => ({
          curves: commit.curves,
          fileId: commit.fileId,
          replaceGenerations: commit.replaceCurveGenerations,
        })));
        metricCommits.push(...input.map(commit => ({
          fileId: commit.fileId,
          metrics: commit.metrics,
          replace: commit.replaceMetrics,
        })));
      },
      commitMetricsBatch: input => metricCommits.push(...input),
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    curveCommits.length = 0;
    metricCommits.length = 0;

    snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b-next"),
    });
    sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2, {
      curveKeys: ["base:iv:transfer:series-b" as CurveKey],
      fileIds: ["file-b"],
    }));

    assert.deepEqual(curveCommits.map(commit => commit.fileId), []);
    assert.deepEqual(metricCommits.map(commit => commit.fileId), []);

    await waitForPendingCalculation();

    assert.deepEqual(curveCommits.map(commit => commit.fileId), ["file-b"]);
    assert.deepEqual(metricCommits.map(commit => commit.fileId), ["file-b"]);
    contribution.dispose();
    sessionEvents.dispose();
  });

  test("queues non-interactive calculation files and flushes them in background chunks", async () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    const snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: () => undefined,
      commitCalculatedRecordsBatch: input => {
        calculatedCommitFileIds.push(input.map(commit => commit.fileId));
      },
      commitMetricsBatch: () => undefined,
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));

    assert.deepEqual(calculatedCommitFileIds, []);
    await waitForPendingCalculation(3);
    assert.deepEqual(calculatedCommitFileIds, [["file-a"], ["file-b"], ["file-c"]]);

    contribution.dispose();
    sessionEvents.dispose();
  });

  test("runs one calculation worker at a time and gives queued interactive work the next slot", async () => {
    const originalWorker = globalThis.Worker;
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    const workerRecords: Array<{
      readonly message: CalculationRecordsWorkerRequest;
      readonly worker: TestWorker;
    }> = [];
    let activeWorkerCount = 0;
    let maxActiveWorkerCount = 0;
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      constructor() {
        activeWorkerCount += 1;
        maxActiveWorkerCount = Math.max(maxActiveWorkerCount, activeWorkerCount);
      }

      public postMessage(message: CalculationRecordsWorkerRequest): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        activeWorkerCount = Math.max(0, activeWorkerCount - 1);
      }
    }

    let contribution: CalculationService | undefined;
    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "base-a"),
        "file-b": createFileRecord("file-b", "series-b", "base-b"),
        "file-c": createFileRecord("file-c", "series-c", "base-c"),
      });
      contribution = new CalculationService(createSessionServiceStub({
        commitCurvesBatch: () => undefined,
        commitCalculatedRecordsBatch: input => {
          calculatedCommitFileIds.push(input.map(commit => commit.fileId));
        },
        commitMetricsBatch: () => undefined,
        getSnapshot: () => snapshot,
        onDidChangeSession: sessionEvents.event,
      }));

      await waitForPendingCalculation();

      assert.equal(workerRecords.length, 1);
      assert.equal(workerRecords[0].message.payload?.fileId, "file-a");
      assert.deepEqual(calculatedCommitFileIds, []);

      contribution.prioritizeCalculationFile("file-c");
      assert.equal(workerRecords.length, 1);
      assert.deepEqual(calculatedCommitFileIds, []);

      completeCalculationWorker(workerRecords[0]);
      await waitForCalculationWorkerResult();

      assert.equal(workerRecords.length, 2);
      assert.equal(workerRecords[1].message.payload?.fileId, "file-c");
      assert.deepEqual(calculatedCommitFileIds, [["file-a"]]);
      assert.equal(maxActiveWorkerCount, 1);

      completeCalculationWorker(workerRecords[1]);
      await waitForCalculationWorkerResult();

      assert.deepEqual(calculatedCommitFileIds, [["file-a"], ["file-c"]]);

      await waitForPendingCalculation();
      assert.equal(workerRecords.length, 3);
      assert.equal(workerRecords[2].message.payload?.fileId, "file-b");
      assert.equal(maxActiveWorkerCount, 1);
    } finally {
      contribution?.dispose();
      sessionEvents.dispose();
      globalThis.Worker = originalWorker;
    }
  });

  test("ignores stale background worker calculation results after input changes", async () => {
    const originalWorker = globalThis.Worker;
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    const workerRecords: Array<{
      readonly message: CalculationRecordsWorkerRequest;
      readonly worker: TestWorker;
    }> = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: CalculationRecordsWorkerRequest): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    let contribution: CalculationService | undefined;
    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      let snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "base-a"),
      });
      contribution = new CalculationService(createSessionServiceStub({
        commitCurvesBatch: () => undefined,
        commitCalculatedRecordsBatch: input => {
          calculatedCommitFileIds.push(input.map(commit => commit.fileId));
        },
        commitMetricsBatch: () => undefined,
        getSnapshot: () => snapshot,
        onDidChangeSession: sessionEvents.event,
      }));

      await waitForPendingCalculation();
      assert.equal(workerRecords.length, 1);

      snapshot = {
        ...createSnapshot({
          "file-a": createFileRecord("file-a", "series-a", "base-a-next"),
        }),
        sessionVersion: 2,
      };
      sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2, {
        curveKeys: ["base:iv:transfer:series-a" as CurveKey],
        fileIds: ["file-a"],
      }));

      completeCalculationWorker(workerRecords[0]);
      await waitForCalculationWorkerResult();

      assert.deepEqual(calculatedCommitFileIds, []);

      await waitForPendingCalculation();
      assert.equal(workerRecords.length, 2);
      completeCalculationWorker(workerRecords[1]);
      await waitForCalculationWorkerResult();

      assert.deepEqual(calculatedCommitFileIds, [["file-a"]]);
    } finally {
      contribution?.dispose();
      sessionEvents.dispose();
      globalThis.Worker = originalWorker;
    }
  });

  test("prioritizes newly affected files ahead of older background calculation", async () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    let snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: () => undefined,
      commitCalculatedRecordsBatch: input => {
        calculatedCommitFileIds.push(input.map(commit => commit.fileId));
      },
      commitMetricsBatch: () => undefined,
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    calculatedCommitFileIds.length = 0;

    snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c-next"),
    });
    sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2, {
      curveKeys: ["base:iv:transfer:series-c" as CurveKey],
      fileIds: ["file-c"],
    }));

    assert.deepEqual(calculatedCommitFileIds, []);
    await waitForPendingCalculation(2);
    assert.deepEqual(calculatedCommitFileIds[0], ["file-c"]);

    contribution.dispose();
    sessionEvents.dispose();
  });

  test("prioritizes requested pending calculation files ahead of background backlog", async () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    const snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: () => undefined,
      commitCalculatedRecordsBatch: input => {
        calculatedCommitFileIds.push(input.map(commit => commit.fileId));
      },
      commitMetricsBatch: () => undefined,
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    calculatedCommitFileIds.length = 0;

    contribution.prioritizeCalculationFile("file-c");
    assert.deepEqual(calculatedCommitFileIds, [["file-c"]]);

    await waitForPendingCalculation(2);

    assert.deepEqual(calculatedCommitFileIds, [["file-c"], ["file-a"], ["file-b"]]);

    contribution.dispose();
    sessionEvents.dispose();
  });

  test("keeps requested calculation files prioritized when they enter pending later", () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    let snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: () => undefined,
      commitCalculatedRecordsBatch: input => {
        calculatedCommitFileIds.push(input.map(commit => commit.fileId));
      },
      commitMetricsBatch: () => undefined,
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    calculatedCommitFileIds.length = 0;

    contribution.prioritizeCalculationFile("file-c");
    snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c"),
      "file-d": createFileRecord("file-d", "series-d", "base-d"),
    });
    sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2));

    assert.deepEqual(calculatedCommitFileIds, [["file-c"]]);

    contribution.dispose();
    sessionEvents.dispose();
  });

  test("uses the most recent calculation priority when pending files arrive later", () => {
    const sessionEvents = new Emitter<SessionChangeEvent>();
    const calculatedCommitFileIds: string[][] = [];
    let snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
    });
    const contribution = new CalculationService(createSessionServiceStub({
      commitCurvesBatch: () => undefined,
      commitCalculatedRecordsBatch: input => {
        calculatedCommitFileIds.push(input.map(commit => commit.fileId));
      },
      commitMetricsBatch: () => undefined,
      getSnapshot: () => snapshot,
      onDidChangeSession: sessionEvents.event,
    }));
    calculatedCommitFileIds.length = 0;

    contribution.prioritizeCalculationFile("file-c");
    contribution.prioritizeCalculationFile("file-b");
    snapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "base-a"),
      "file-b": createFileRecord("file-b", "series-b", "base-b"),
      "file-c": createFileRecord("file-c", "series-c", "base-c"),
      "file-d": createFileRecord("file-d", "series-d", "base-d"),
    });
    sessionEvents.fire(createSessionChangeEvent("curvesChanged", 2));

    assert.deepEqual(calculatedCommitFileIds, [["file-b"]]);

    contribution.dispose();
    sessionEvents.dispose();
  });
});

const createSessionServiceStub = ({
  commitCalculatedRecordsBatch,
  commitCurvesBatch,
  commitMetricsBatch,
  getSnapshot,
  onDidChangeSession,
}: {
  readonly commitCurvesBatch: (input: CommitCurvesBatchInput) => void;
  readonly commitCalculatedRecordsBatch: (input: CommitCalculatedRecordsBatchInput) => void;
  readonly commitMetricsBatch: (input: CommitMetricsBatchInput) => void;
  readonly getSnapshot: () => SessionSnapshot;
  readonly onDidChangeSession: Event<SessionChangeEvent>;
}): ISessionService => ({
  _serviceBrand: undefined,
  clearMetricInput: () => undefined,
  clearSession: () => undefined,
  commitFileImport: () => ({
    importedFileIds: [],
    skippedDuplicateFileIds: [],
  }),
  commitCurves: () => undefined,
  commitCalculatedRecordsBatch,
  commitCurvesBatch,
  commitMetrics: () => undefined,
  commitMetricsBatch,
  commitRawTableAssessment: () => undefined,
  commitRawTableAssessments: () => undefined,
  commitRawTableReviews: () => undefined,
  commitSliceRuns: () => undefined,
  getSnapshot,
  onDidChangeSession,
  renameFile: () => false,
  removeFiles: () => undefined,
  setMetricInput: () => undefined,
});

const createSnapshot = (
  filesById: Record<string, FileRecord>,
): SessionSnapshot => ({
  fileOrder: Object.keys(filesById),
  filesById,
  schemaVersion: 1,
  sessionVersion: 1,
});

const createFileRecord = (
  fileId: string,
  seriesId: string,
  signature: string,
): FileRecord => {
  const curveKey = `base:iv:transfer:${seriesId}` as BaseCurveKey;
  return {
    assessmentsByRawTableId: {},
    curvesByKey: {
      [curveKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 4 },
        ],
        seriesId,
        signature,
      },
    },
    id: fileId,
    kind: "unknown",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: `${fileId}.csv`,
    raw: {
      fileId,
      fileName: `${fileId}.csv`,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {
      [seriesId]: {
        fileId,
        groupIndex: 0,
        id: seriesId,
        name: seriesId,
        y: [1, 2, 4],
      },
    },
    seriesOrder: [seriesId],
    latestSliceRunId: "run-a",
    sliceRunsById: {
      "run-a": {
        fileId,
        id: "run-a",
        mode: "auto",
        rawTableId: fileId,
        selection: { kind: "auto" },
        sourceRawTableVersion: 0,
        template: {
          schemaVersion: 1,
          name: "Template",
          version: 1,
          stopOnError: false,
          blocks: [{
            rowRange: { startRow: 0, endRow: 2 },
            x: { columns: [0], unit: "V" },
            y: { columns: [1], unit: "A" },
            segmentation: { kind: "auto" },
            legend: { target: "auto" },
            titles: {
              bottom: "Gate Voltage",
              left: "Drain Current",
            },
          }],
        },
        templateFingerprint: "config-a",
        inputRanges: [],
        outputCurveKeys: [curveKey],
        outputSeriesIds: [seriesId],
        warnings: [],
        errors: [],
      },
    },
  };
};

const completeCalculationWorker = (record: {
  readonly message: CalculationRecordsWorkerRequest;
  readonly worker: {
    readonly onmessage: ((event: MessageEvent) => void) | null;
  };
}): void => {
  const payload = record.message.payload;
  record.worker.onmessage?.({
    data: {
      payload: {
        curves: [],
        fileId: payload?.fileId ?? "",
        metrics: [],
        requestId: payload?.requestId ?? 0,
        sessionVersion: payload?.sessionVersion ?? 0,
      },
      type: "calculateRecordsResult",
    },
  } as MessageEvent);
};

const waitForPendingCalculation = async (flushCount = 1): Promise<void> => {
  for (let index = 0; index < flushCount; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const waitForCalculationWorkerResult = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
