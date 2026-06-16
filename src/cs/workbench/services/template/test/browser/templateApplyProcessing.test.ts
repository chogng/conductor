/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { getLatestTemplateRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import { createProcessedFileSessionCommit } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import type {
  ProcessedEntry,
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  startProcessingJob,
  startRuleProcessingJob,
  type ProcessingQueueItem,
} from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import type {
  TemplateProcessingBackend,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

suite("workbench/services/template/test/browser/templateApplyProcessing", () => {
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

  const templateProcessingBackendService = {
    canProcessFile: () => false,
    canReadConvertedCsv: () => false,
    processFile: async () => ({}),
    readConvertedCsv: async () => ({ ok: false }),
  } satisfies TemplateProcessingBackend;

  const createProcessingHarness = (rawFiles: readonly SessionFile[] = []) => {
    const session = new SessionService();
    if (rawFiles.length) {
      commitRawFilesForTest(session, rawFiles);
    }
    let sessionChangeCount = 0;
    const disposeSession = subscribeForTest(session, () => {
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
        templateProcessingBackendService,
        hasSourceFile: () => true,
        onWorkerErrorPayload: () => undefined,
        processingJobIdRef: createRef(0),
        processingQueueRef: createRef<ProcessingQueueItem[]>([]),
        processingStopOnErrorRef: createRef(false),
        processingWorkerRef: createRef<Worker | null>(null),
        removedQueuedFileIdsRef: createRef<Set<string>>(new Set()),
        commitTemplateOutput: (file: ProcessedEntry | null | undefined, options: Parameters<typeof createProcessedFileSessionCommit>[2]) => {
          const commit = createProcessedFileSessionCommit(
            session.getSnapshot(),
            file,
            options,
          );
          if (!commit) {
            return;
          }

          session.commitTemplateOutput(commit);
        },
        clearTemplateOutput: () => {
          session.commitTemplateRun({ kind: "clearTemplateOutput" });
        },
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

  const createProcessedFile = (fileId: string): ProcessedEntry => ({
    analysisCache: {
      version: 2,
      series: {
        "series-1": {
          gm: [{ x: 0, y: 1 }],
        },
      },
    },
    analysisCacheTouchedAt: 1,
    fileId,
    fileName: `${fileId}.csv`,
  });

  const createRawSessionFile = (fileId: string): SessionFile => ({
    file: {},
    fileId,
    fileName: `${fileId}.csv`,
    normalizedCsvPath: `${fileId}.csv`,
  });

  const subscribeForTest = (
    session: SessionService,
    listener: () => void,
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
    return {
      id: fileId,
      kind: "csv",
      name: fileName,
      raw: {
        fileId,
        fileName,
        rawFile: file.file,
        rawTableOrder: [fileId],
        rawTablesById: {
          [fileId]: {
            columnCount: 0,
            fileId,
            maxCellLengths: [],
            rawTableId: fileId,
            rowCount: 0,
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
            source: {
              kind: "csv",
            },
          },
        },
      },
    };
  };

  test("startProcessingJob clears template output before committing first result", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness([createRawSessionFile("file-a")]);
      const processed = createProcessedFile("file-a");
      const extractionConfig = {
        endRow: 2,
        groupSize: 2,
        startRow: 1,
        xSegmentationMode: "points",
        yCols: [1],
      };

      startProcessingJob({
        ...harness.options,
        extractionConfig,
        queue: [{
          file: {},
          fileId: "file-a",
          fileName: "file-a.csv",
          normalizedCsvPath: "file-a.csv",
        }],
        clearTemplateOutputBeforeRun: true,
        tryProcessFileWithBackend: async () => processed,
      });

      assert.equal(harness.sessionChangeCount, 0);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.sessionChangeCount, 1);
      assert.equal(harness.showResultsCount, 1);
      assert.equal(harness.processingStatus.state, "done");
      assert.deepEqual(snapshot.fileOrder, ["file-a"]);
      assert.equal(snapshot.filesById["file-a"].raw.fileName, "file-a.csv");
      const templateRun = getLatestTemplateRunRecord(snapshot.filesById["file-a"]);
      assert.equal(templateRun?.config.xDataStart, 1);
      assert.equal(templateRun?.config.xDataEnd, 2);
      assert.deepEqual(templateRun?.config.yColumns, [1]);
      assert.equal(
        snapshot.filesById["file-a"].calculationCache?.entriesByKey["gm:series-1"]?.kind,
        "gm",
      );
      assert.deepEqual(
        snapshot.filesById["file-a"].calculationCache?.entriesByKey["gm:series-1"]?.value,
        [{ x: 0, y: 1 }],
      );
      harness.dispose();
    });
  });

  test("startRuleProcessingJob clears template output before committing first result", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness([createRawSessionFile("file-b")]);
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
        tryProcessFileWithBackend: async () => processed,
      });

      assert.equal(harness.sessionChangeCount, 0);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.sessionChangeCount, 1);
      assert.equal(harness.showResultsCount, 1);
      assert.equal(harness.processingStatus.state, "done");
      assert.deepEqual(snapshot.fileOrder, ["file-b"]);
      assert.equal(snapshot.filesById["file-b"].raw.fileName, "file-b.csv");
      assert.equal(
        snapshot.filesById["file-b"].calculationCache?.entriesByKey["gm:series-1"]?.kind,
        "gm",
      );
      assert.deepEqual(
        snapshot.filesById["file-b"].calculationCache?.entriesByKey["gm:series-1"]?.value,
        [{ x: 0, y: 1 }],
      );
      harness.dispose();
    });
  });

  test("startRuleProcessingJob commits multiple Rust results into the session", async () => {
    await withTestWorker(async () => {
      const harness = createProcessingHarness([
        createRawSessionFile("file-a"),
        createRawSessionFile("file-b"),
      ]);
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
        finalQueue: entries,
        groupedPrepared: [{
          extractionConfig: { group: "transfer" },
          queue: entries,
        }],
        incremental: false,
        tryProcessFileWithBackend: async ({ entry }) => createProcessedFile(entry.fileId),
      });

      assert.equal(harness.sessionChangeCount, 0);

      await waitForAsyncJob();

      const snapshot = harness.session.getSnapshot();
      assert.equal(harness.processingStatus.state, "done");
      assert.equal(harness.processingStatus.processed, 2);
      assert.equal(harness.showResultsCount, 1);
      assert.deepEqual(snapshot.fileOrder, ["file-a", "file-b"]);
      assert.equal(snapshot.filesById["file-a"].raw.fileName, "file-a.csv");
      assert.equal(snapshot.filesById["file-b"].raw.fileName, "file-b.csv");
      assert.equal(
        snapshot.filesById["file-a"].calculationCache?.entriesByKey["gm:series-1"]?.kind,
        "gm",
      );
      assert.equal(
        snapshot.filesById["file-b"].calculationCache?.entriesByKey["gm:series-1"]?.kind,
        "gm",
      );
      harness.dispose();
    });
  });
});
