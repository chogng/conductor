import test from "node:test";
import assert from "node:assert/strict";

import { SessionModel } from "src/cs/workbench/contrib/session/browser/sessionModel";
import {
  startProcessingJob,
  startRuleProcessingJob,
} from "../../browser/templateApplyProcessing.ts";

const createRef = (current) => ({ current });

const resolveNext = (value, previous) =>
  typeof value === "function" ? value(previous) : value;

class TestWorker {
  onmessage = null;
  messages = [];
  terminated = false;

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const withTestWorker = async (callback) => {
  const previousWorker = globalThis.Worker;
  globalThis.Worker = TestWorker;
  try {
    await callback();
  } finally {
    if (previousWorker === undefined) {
      delete globalThis.Worker;
    } else {
      globalThis.Worker = previousWorker;
    }
  }
};

const waitForAsyncJob = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const createProcessingHarness = () => {
  const session = new SessionModel();
  let sessionChangeCount = 0;
  const disposeSession = session.subscribe(() => {
    sessionChangeCount += 1;
  });

  let processingStatus = {
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
      analysisFileService: {
        canReadConvertedCsv: () => false,
        readConvertedCsv: async () => ({ ok: false }),
      },
      batchSessionUpdate: session.batch,
      hasSourceFile: () => true,
      onWorkerErrorPayload: () => undefined,
      processingJobIdRef: createRef(0),
      processingQueueRef: createRef([]),
      processingStopOnErrorRef: createRef(false),
      processingWorkerRef: createRef(null),
      removedQueuedFileIdsRef: createRef(new Set()),
      setAnalysisResults: session.setAnalysisResults,
      setCleanedData: session.setCleanedData,
      setProcessingStatus: (next) => {
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

const createProcessedFile = (fileId) => ({
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
    const entry = {
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
    const entries = [
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
