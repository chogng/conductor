import assert from "assert";

import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { StateSetter } from "src/cs/workbench/services/session/common/session";
import {
  startProcessingJob,
  startRuleProcessingJob,
  type ProcessingQueueItem,
} from "../../browser/templateApplyProcessing.ts";

suite("workbench/contrib/template/test/browser/templateApplyProcessing", () => {
  const createRef = <T,>(current: T) => ({ current });

  const resolveNext = <T,>(value: T | ((previous: T) => T), previous: T): T =>
    typeof value === "function"
      ? (value as (previous: T) => T)(previous)
      : value;

  class TestWorker {
    onmessage = null;
    messages: unknown[] = [];
    terminated = false;

    postMessage(message: unknown): void {
      this.messages.push(message);
    }

    terminate(): void {
      this.terminated = true;
    }
  }

  const withTestWorker = async (callback: () => Promise<void>): Promise<void> => {
    const previousWorker = globalThis.Worker;
    (globalThis as { Worker?: typeof Worker }).Worker =
      TestWorker as unknown as typeof Worker;
    try {
      await callback();
    } finally {
      if (previousWorker === undefined) {
        delete (globalThis as { Worker?: typeof Worker }).Worker;
      } else {
        globalThis.Worker = previousWorker;
      }
    }
  };

  const waitForAsyncJob = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

  const analysisFileService = {
    canReadConvertedCsv: () => false,
    readConvertedCsv: async () => ({ ok: false }),
  } as unknown as IAnalysisFileService;

  const createProcessingHarness = () => {
    const session = new SessionService();
    let sessionChangeCount = 0;
    const disposeSession = session.subscribe(() => {
      sessionChangeCount += 1;
    });

    let processingStatus: ProcessingStatus = {
      processed: 0,
      state: "idle",
      total: 0,
    };
    let showResultsCount = 0;

    return {
      dispose: disposeSession,
      get processingStatus() {
        return processingStatus;
      },
      get sessionChangeCount() {
        return sessionChangeCount;
      },
      get showResultsCount() {
        return showResultsCount;
      },
      options: {
        activeFileId: null,
        analysisFileService,
        batchSessionUpdate: session.batch,
        hasSourceFile: () => true,
        onWorkerErrorPayload: () => undefined,
        processingJobIdRef: createRef(0),
        processingQueueRef: createRef<ProcessingQueueItem[]>([]),
        processingStopOnErrorRef: createRef(false),
        processingWorkerRef: createRef<Worker | null>(null),
        removedQueuedFileIdsRef: createRef<Set<string>>(new Set()),
        setAnalysisResults: session.setAnalysisResults,
        setCleanedData: session.setCleanedData,
        setProcessingStatus: (next: Parameters<StateSetter<ProcessingStatus>>[0]) => {
          processingStatus = resolveNext(next, processingStatus);
        },
        showResults: () => {
          showResultsCount += 1;
        },
        stopOnError: false,
      },
      session,
    };
  };

  const createProcessedFile = (fileId: string): CleanedEntry => ({
    analysisCache: {
      series: {},
    },
    analysisCacheTouchedAt: 1,
    fileId,
    fileName: `${fileId}.csv`,
  });

  test("startProcessingJob batches reset and first result session writes before showing results", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness();
      const processed = createProcessedFile("file-a");

      startProcessingJob({
        ...harness.options,
        extractionConfig: {},
        queue: [{
          file: {},
          fileId: "file-a",
          fileName: "file-a.csv",
          normalizedCsvPath: "file-a.csv",
        }],
        resetCleanedData: true,
        tryProcessFileWithRust: async () => processed,
      });

      assert.equal(harness.sessionChangeCount, 1);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.sessionChangeCount, 2);
      assert.equal(harness.showResultsCount, 1);
      assert.equal(harness.processingStatus.state, "done");
      assert.equal(snapshot.cleanedData.length, 1);
      assert.equal(snapshot.cleanedData[0], processed);
      assert.equal(snapshot.analysisResults["file-a"]?.fileId, "file-a");
      harness.dispose();
    });
  });

  test("startRuleProcessingJob batches reset and first result session writes before showing results", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness();
      const processed = createProcessedFile("file-b");
      const entry: ProcessingQueueItem = {
        file: {},
        fileId: "file-b",
        fileName: "file-b.csv",
        normalizedCsvPath: "file-b.csv",
      };

      startRuleProcessingJob({
        ...harness.options,
        finalQueue: [entry],
        groupedPrepared: [{
          extractionConfig: {},
          queue: [entry],
        }],
        incremental: false,
        tryProcessFileWithRust: async () => processed,
      });

      assert.equal(harness.sessionChangeCount, 1);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.sessionChangeCount, 2);
      assert.equal(harness.showResultsCount, 1);
      assert.equal(harness.processingStatus.state, "done");
      assert.equal(snapshot.cleanedData.length, 1);
      assert.equal(snapshot.cleanedData[0], processed);
      assert.equal(snapshot.analysisResults["file-b"]?.fileId, "file-b");
      harness.dispose();
    });
  });

  test("startRuleProcessingJob commits multiple Rust results into the session", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness();
      const entries: ProcessingQueueItem[] = [
        {
          file: {},
          fileId: "file-a",
          fileName: "file-a.csv",
          normalizedCsvPath: "file-a.csv",
        },
        {
          file: {},
          fileId: "file-b",
          fileName: "file-b.csv",
          normalizedCsvPath: "file-b.csv",
        },
      ];

      startRuleProcessingJob({
        ...harness.options,
        activeFileId: "file-a",
        finalQueue: entries,
        groupedPrepared: [{
          extractionConfig: { group: "transfer" },
          queue: entries,
        }],
        incremental: false,
        tryProcessFileWithRust: async ({ entry }) => createProcessedFile(entry.fileId),
      });

      assert.equal(harness.sessionChangeCount, 1);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.processingStatus.state, "done");
      assert.equal(harness.processingStatus.processed, 2);
      assert.equal(harness.showResultsCount, 1);
      assert.deepEqual(
        snapshot.cleanedData.map((file) => file.fileId),
        ["file-a", "file-b"],
      );
      assert.equal(snapshot.analysisResults["file-a"]?.fileId, "file-a");
      assert.equal(snapshot.analysisResults["file-b"]?.fileId, "file-b");
      harness.dispose();
    });
  });
});
