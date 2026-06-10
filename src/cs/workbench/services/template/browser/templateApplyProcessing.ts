/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  isPerfEnabled,
  startPerf,
  summarizeProcessedFile,
} from "src/cs/workbench/common/perf";
import type { CommitTemplateOutputOptions } from "src/cs/workbench/services/session/common/session";
import type {
  ProcessedEntry,
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  loadConvertedCsvFile,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import type { TemplateProcessingAssessment } from "src/cs/workbench/services/template/common/templateProcessingAssessment";
import type {
  TemplateProcessingBackend,
  TemplateProcessingResultPayload,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";

// Owns asynchronous execution for device-analysis processing jobs.
// This module handles worker lifetime, queue draining, progress updates, cancellation,
// and the final transition back to the analysis page.

export type ProcessingQueueItem = {
  file: unknown;
  fileId: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  sourcePath?: string | null;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  assessment?: TemplateProcessingAssessment | null;
};

export type ProcessingMessageType = "processFile" | "processFileAuto";

export type PreparedRuleProcessingGroup = {
  extractionConfig: unknown;
  queue: ProcessingQueueItem[];
};

export type TryProcessFileWithRust = (input: {
  entry: ProcessingQueueItem;
  extractionConfig: unknown;
  messageType: ProcessingMessageType;
}) => Promise<ProcessedEntry | null>;

export type TemplateWorkerRef<T> = {
  current: T;
};

type ProcessingWorkerMessagePayload = {
  readonly fileId?: string | null;
  readonly fileName?: string | null;
  readonly jobId?: number;
  readonly message?: string | null;
  readonly processed?: ProcessedEntry | null;
};

type ProcessingWorkerMessage = {
  readonly payload?: ProcessingWorkerMessagePayload;
  readonly type?: string;
};

type SchedulerRefs = {
  processingJobIdRef: TemplateWorkerRef<number>;
  processingQueueRef: TemplateWorkerRef<ProcessingQueueItem[]>;
  processingStopOnErrorRef: TemplateWorkerRef<boolean>;
  processingWorkerRef: TemplateWorkerRef<Worker | null>;
  removedQueuedFileIdsRef: TemplateWorkerRef<Set<string>>;
};

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

type SchedulerCallbacks = {
  onWorkerErrorPayload?: (payload: unknown) => void;
  hasSourceFile: (fileId: string | null | undefined) => boolean;
  showResults: () => void;
  commitTemplateOutput: (
    file: ProcessedEntry | null | undefined,
    options?: CommitTemplateOutputOptions,
  ) => void;
  clearTemplateOutput: () => void;
  setProcessingStatus: StateSetter<ProcessingStatus>;
};

export type ProcessingJobOptions = SchedulerRefs &
  SchedulerCallbacks & {
    templateProcessingBackendService: TemplateProcessingBackend;
    extractionConfig: unknown;
    fileTemplateSelectionsByFileId?: Readonly<Record<string, TemplateSelection>>;
    messageType?: ProcessingMessageType;
    queue: ProcessingQueueItem[];
    clearTemplateOutputBeforeRun: boolean;
    stopOnError: boolean;
    templateSelection?: TemplateSelection;
    tryProcessFileWithRust: TryProcessFileWithRust;
  };

export type RuleProcessingJobOptions = SchedulerRefs &
  SchedulerCallbacks & {
    templateProcessingBackendService: TemplateProcessingBackend;
    fileTemplateSelectionsByFileId?: Readonly<Record<string, TemplateSelection>>;
    finalQueue: ProcessingQueueItem[];
    groupedPrepared: PreparedRuleProcessingGroup[];
    incremental: boolean;
    stopOnError: boolean;
    templateSelection?: TemplateSelection;
    tryProcessFileWithRust: TryProcessFileWithRust;
  };

const RUST_PROCESSING_CONCURRENCY = 2;

const resolveAppliedTemplateSelection = (
  fileId: unknown,
  selectionsByFileId: Readonly<Record<string, TemplateSelection>> | undefined,
  currentSelection: TemplateSelection | undefined,
): TemplateSelection => {
  const normalizedFileId = String(fileId ?? "").trim();
  return normalizedFileId
    ? selectionsByFileId?.[normalizedFileId] ?? currentSelection ?? { kind: "auto" }
    : currentSelection ?? { kind: "auto" };
};

const isRustCapableProcessingEntry = (entry: ProcessingQueueItem): boolean =>
  Boolean(
    (typeof entry?.normalizedCsvPath === "string" &&
      entry.normalizedCsvPath.trim()) ||
      (typeof entry?.sourcePath === "string" &&
        entry.sourcePath.trim().toLowerCase().endsWith(".csv")),
  );

const resolveProcessingFallbackFile = async (
  templateProcessingBackendService: TemplateProcessingBackend,
  entry: ProcessingQueueItem,
): Promise<File | unknown> => {
  const loaded = await loadConvertedCsvFile({
    convertedCsvReaderService: templateProcessingBackendService,
    fallbackFile: entry.file,
    fileName: entry.fileName,
    lastModified: entry.file instanceof File ? entry.file.lastModified : null,
    normalizedCsvPath: entry.normalizedCsvPath,
  });
  return loaded ?? entry.file;
};

const createProcessingWorker = () =>
  new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  });

export const terminateProcessingWorker = (
  workerRef: TemplateWorkerRef<Worker | null>,
  worker: Worker | null = workerRef.current,
) => {
  if (!worker) return;
  worker.terminate();
  if (workerRef.current === worker) {
    workerRef.current = null;
  }
};

const finishProcessingJob = ({
  hasAnyProcessedResult,
  showResults,
  setProcessingStatus,
  worker,
  workerRef,
}: {
  hasAnyProcessedResult: boolean;
  showResults: () => void;
  setProcessingStatus: StateSetter<ProcessingStatus>;
  worker: Worker;
  workerRef: TemplateWorkerRef<Worker | null>;
}) => {
  setProcessingStatus((prev) => ({ ...prev, state: "done" }));
  if (hasAnyProcessedResult) {
    showResults();
  }
  terminateProcessingWorker(workerRef, worker);
};

const failProcessingJob = ({
  setProcessingStatus,
  worker,
  workerRef,
}: {
  setProcessingStatus: StateSetter<ProcessingStatus>;
  worker: Worker;
  workerRef: TemplateWorkerRef<Worker | null>;
}) => {
  setProcessingStatus((prev) => ({ ...prev, state: "error" }));
  terminateProcessingWorker(workerRef, worker);
};

// Runs one extraction config across a flat queue of files.
// processingController.ts decides the queue and config; this runner decides when to start,
// how many files to process in parallel, how to commit results, and when to finish.
export const startProcessingJob = ({
  templateProcessingBackendService,
  extractionConfig,
  fileTemplateSelectionsByFileId,
  messageType = "processFile",
  onWorkerErrorPayload,
  processingJobIdRef,
  processingQueueRef,
  processingStopOnErrorRef,
  processingWorkerRef,
  queue,
  hasSourceFile,
  removedQueuedFileIdsRef,
  clearTemplateOutputBeforeRun,
  showResults,
  commitTemplateOutput,
  clearTemplateOutput,
  setProcessingStatus,
  stopOnError,
  templateSelection,
  tryProcessFileWithRust,
}: ProcessingJobOptions) => {
  if (!Array.isArray(queue) || queue.length === 0) return;

  const workQueue = [...queue];
  let hasAnyProcessedResult = false;
  const finishBatchPerf = startPerf("processing:batch", {
    fileCount: workQueue.length,
    mode: messageType,
    clearTemplateOutputBeforeRun,
    stopOnError,
  });
  const filePerfFinishers = new Map<
    string,
    (meta?: Record<string, unknown>) => void
  >();
  let hasShownResults = false;
  const showResultsOnce = () => {
    if (hasShownResults) return;
    hasShownResults = true;
    showResults();
  };

  if (clearTemplateOutputBeforeRun) {
    clearTemplateOutput();
  }
  removedQueuedFileIdsRef.current = new Set();

  processingStopOnErrorRef.current = Boolean(stopOnError);
  processingJobIdRef.current += 1;
  const jobId = processingJobIdRef.current;

  terminateProcessingWorker(processingWorkerRef);

  const worker = createProcessingWorker();
  processingWorkerRef.current = worker;

  processingQueueRef.current = workQueue;
  setProcessingStatus({
    state: "processing",
    processed: 0,
    total: workQueue.length,
  });

  let activeCount = 0;
  let completedCount = 0;
  let finishing = false;

  const finishIfIdle = () => {
    if (finishing || activeCount > 0 || processingQueueRef.current.length > 0) {
      return;
    }
    finishing = true;
    finishBatchPerf({
      completedCount,
      hasAnyProcessedResult,
    });
    finishProcessingJob({
      hasAnyProcessedResult,
      showResults: showResultsOnce,
      setProcessingStatus,
      worker,
      workerRef: processingWorkerRef,
    });
  };

  const launchNext = () => {
    if (finishing || jobId !== processingJobIdRef.current) return;

    while (
      activeCount < RUST_PROCESSING_CONCURRENCY &&
      processingQueueRef.current.length > 0
    ) {
      const candidate = processingQueueRef.current[0];
      if (
        activeCount > 0 &&
        candidate &&
        !isRustCapableProcessingEntry(candidate)
      ) {
        break;
      }
      const nextEntry = processingQueueRef.current.shift();

      if (!nextEntry) break;
      if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) continue;

      activeCount += 1;
      filePerfFinishers.set(
        nextEntry.fileId,
        startPerf("processing:file-roundtrip", {
          fileId: nextEntry.fileId,
          fileName: nextEntry.fileName,
          mode: messageType,
        }),
      );

      void (async () => {
        const rustProcessed = await tryProcessFileWithRust({
          entry: nextEntry,
          extractionConfig,
          messageType,
        });
        if (jobId !== processingJobIdRef.current) return;
        if (rustProcessed) {
          const nextFileId = rustProcessed.fileId;
          if (nextFileId && !hasSourceFile(nextFileId)) {
            filePerfFinishers.get(nextFileId)?.({
              skipped: "removed-before-result",
              ...summarizeProcessedFile(rustProcessed),
              source: "rust",
            });
            filePerfFinishers.delete(nextFileId);
            setProcessingStatus((prev) => ({
              ...prev,
              processed: prev.processed + 1,
            }));
            completedCount += 1;
            activeCount = Math.max(0, activeCount - 1);
            launchNext();
            return;
          }

          hasAnyProcessedResult = true;
          if (nextFileId) {
            filePerfFinishers.get(nextFileId)?.({
              ...summarizeProcessedFile(rustProcessed),
              source: "rust",
            });
            filePerfFinishers.delete(nextFileId);
          }
          commitTemplateOutput(rustProcessed, {
            appliedTemplateConfig: extractionConfig,
            appliedTemplateSelection: resolveAppliedTemplateSelection(
              nextFileId,
              fileTemplateSelectionsByFileId,
              templateSelection,
            ),
          });
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
          showResultsOnce();
          completedCount += 1;
          activeCount = Math.max(0, activeCount - 1);
          launchNext();
          return;
        }

        const fallbackFile = await resolveProcessingFallbackFile(
          templateProcessingBackendService,
          nextEntry,
        );
        worker.postMessage({
          type: messageType,
          payload: {
            assessment: nextEntry.assessment ?? null,
            config: extractionConfig,
            curveFilterKey: nextEntry.curveFilterKey ?? null,
            curveFilterField: nextEntry.curveFilterField ?? null,
            file: fallbackFile,
            fileId: nextEntry.fileId,
            fileName: nextEntry.fileName,
            jobId,
            maxPoints: 600,
          },
        });
      })();
    }

    finishIfIdle();
  };

  worker.onmessage = (event: MessageEvent<ProcessingWorkerMessage>) => {
    const { type, payload } = event.data ?? {};

    if (type === "processResult") {
      if (payload?.jobId !== jobId) return;

      const nextProcessed = payload?.processed;
      const nextFileId = nextProcessed?.fileId;

      if (nextFileId && !hasSourceFile(nextFileId)) {
        filePerfFinishers.get(nextFileId)?.({
          skipped: "removed-before-result",
          ...summarizeProcessedFile(nextProcessed),
        });
        filePerfFinishers.delete(nextFileId);
        setProcessingStatus((prev) => ({
          ...prev,
          processed: prev.processed + 1,
        }));
        completedCount += 1;
        activeCount = Math.max(0, activeCount - 1);
        launchNext();
        return;
      }

      hasAnyProcessedResult = true;
      if (nextFileId) {
        filePerfFinishers.get(nextFileId)?.(
          summarizeProcessedFile(nextProcessed),
        );
        filePerfFinishers.delete(nextFileId);
      }
      commitTemplateOutput(nextProcessed as ProcessedEntry, {
        appliedTemplateConfig: extractionConfig,
        appliedTemplateSelection: resolveAppliedTemplateSelection(
          nextFileId,
          fileTemplateSelectionsByFileId,
          templateSelection,
        ),
      });
      setProcessingStatus((prev) => ({
        ...prev,
        processed: prev.processed + 1,
      }));
      showResultsOnce();
      completedCount += 1;
      activeCount = Math.max(0, activeCount - 1);
      launchNext();
      return;
    }

    if (type === "workerError") {
      if (payload?.jobId !== jobId) return;

      const errorFileId = String(payload?.fileId ?? "").trim();
      if (errorFileId) {
        filePerfFinishers.get(errorFileId)?.({
          failed: true,
          fileName: payload?.fileName ?? null,
          message: payload?.message ?? null,
        });
        filePerfFinishers.delete(errorFileId);
      }
      onWorkerErrorPayload?.(payload);
      setProcessingStatus((prev) => ({
        ...prev,
        processed: prev.processed + 1,
      }));
      completedCount += 1;
      activeCount = Math.max(0, activeCount - 1);

      if (processingStopOnErrorRef.current) {
        processingJobIdRef.current += 1;
        failProcessingJob({
          setProcessingStatus,
          worker,
          workerRef: processingWorkerRef,
        });
        return;
      }

      launchNext();
    }
  };

  launchNext();
};

// Runs rule-based extraction, where different file groups may use different configs.
// The caller supplies already validated groups; this runner keeps progress,
// cancellation, fallback worker processing, and finalization consistent.
export const startRuleProcessingJob = ({
  templateProcessingBackendService,
  fileTemplateSelectionsByFileId,
  finalQueue,
  groupedPrepared,
  incremental,
  onWorkerErrorPayload,
  processingJobIdRef,
  processingQueueRef,
  processingStopOnErrorRef,
  processingWorkerRef,
  hasSourceFile,
  removedQueuedFileIdsRef,
  showResults,
  commitTemplateOutput,
  clearTemplateOutput,
  setProcessingStatus,
  stopOnError,
  templateSelection,
  tryProcessFileWithRust,
}: RuleProcessingJobOptions) => {
  if (!groupedPrepared.length || !finalQueue.length) return;

  processingStopOnErrorRef.current = stopOnError;
  processingJobIdRef.current += 1;
  const jobId = processingJobIdRef.current;

  terminateProcessingWorker(processingWorkerRef);

  const worker = createProcessingWorker();
  processingWorkerRef.current = worker;

  if (!incremental) {
    clearTemplateOutput();
  }
  removedQueuedFileIdsRef.current = new Set();
  processingQueueRef.current = [...finalQueue];
  setProcessingStatus({
    state: "processing",
    processed: 0,
    total: finalQueue.length,
  });

  let hasAnyProcessedResult = false;
  let processedCount = 0;
  let activeCount = 0;
  let finishing = false;
  const ruleQueue = groupedPrepared.flatMap((group, groupIndex) =>
    group.queue.map((entry) => ({
      entry,
      extractionConfig: group.extractionConfig,
      groupIndex,
    })),
  );
  const finishBatchPerf = startPerf("processing:rule-batch", {
    fileCount: finalQueue.length,
    groupCount: groupedPrepared.length,
    incremental,
    stopOnError,
  });
  const filePerfFinishers = new Map<
    string,
    (meta?: Record<string, unknown>) => void
  >();
  const extractionConfigByFileId = new Map<string, unknown>();
  let hasShownResults = false;
  const showResultsOnce = () => {
    if (hasShownResults) return;
    hasShownResults = true;
    showResults();
  };

  const finishIfIdle = () => {
    if (finishing || activeCount > 0 || ruleQueue.length > 0) return;
    finishing = true;
    finishBatchPerf({
      completedCount: processedCount,
      hasAnyProcessedResult,
    });
    finishProcessingJob({
      hasAnyProcessedResult,
      showResults: showResultsOnce,
      setProcessingStatus,
      worker,
      workerRef: processingWorkerRef,
    });
  };

  const launchNext = () => {
    if (finishing || jobId !== processingJobIdRef.current) return;

    while (activeCount < RUST_PROCESSING_CONCURRENCY && ruleQueue.length > 0) {
      const candidate = ruleQueue[0];
      if (
        activeCount > 0 &&
        candidate &&
        !isRustCapableProcessingEntry(candidate.entry)
      ) {
        break;
      }

      const nextTask = ruleQueue.shift();
      if (!nextTask) break;
      const { entry: nextEntry, extractionConfig, groupIndex } = nextTask;
      processingQueueRef.current = processingQueueRef.current.filter(
        (entry) => entry.fileId !== nextEntry.fileId,
      );
      if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) continue;
      extractionConfigByFileId.set(nextEntry.fileId, extractionConfig);

      activeCount += 1;
      filePerfFinishers.set(
        nextEntry.fileId,
        startPerf("processing:file-roundtrip", {
          fileId: nextEntry.fileId,
          fileName: nextEntry.fileName,
          mode: "processFile",
          ruleGroupIndex: groupIndex,
        }),
      );
      void (async () => {
        const rustProcessed = await tryProcessFileWithRust({
          entry: nextEntry,
          extractionConfig,
          messageType: "processFile",
        });
        if (jobId !== processingJobIdRef.current) return;
        if (rustProcessed) {
          const nextFileId = rustProcessed.fileId;
          if (nextFileId && !hasSourceFile(nextFileId)) {
            filePerfFinishers.get(nextFileId)?.({
              skipped: "removed-before-result",
              ...summarizeProcessedFile(rustProcessed),
              source: "rust",
            });
            filePerfFinishers.delete(nextFileId);
            extractionConfigByFileId.delete(nextFileId);
            processedCount += 1;
            activeCount = Math.max(0, activeCount - 1);
            setProcessingStatus((prev) => ({
              ...prev,
              processed: processedCount,
            }));
            launchNext();
            return;
          }
          hasAnyProcessedResult = true;
          if (nextFileId) {
            filePerfFinishers.get(nextFileId)?.({
              ...summarizeProcessedFile(rustProcessed),
              source: "rust",
            });
            filePerfFinishers.delete(nextFileId);
            extractionConfigByFileId.delete(nextFileId);
          }
          commitTemplateOutput(rustProcessed, {
            appliedTemplateConfig: extractionConfig,
            appliedTemplateSelection: resolveAppliedTemplateSelection(
              nextFileId,
              fileTemplateSelectionsByFileId,
              templateSelection,
            ),
          });
          processedCount += 1;
          activeCount = Math.max(0, activeCount - 1);
          setProcessingStatus((prev) => ({
            ...prev,
            processed: processedCount,
          }));
          showResultsOnce();
          launchNext();
          return;
        }

        const fallbackFile = await resolveProcessingFallbackFile(
          templateProcessingBackendService,
          nextEntry,
        );
        worker.postMessage({
          type: "processFile",
          payload: {
            assessment: nextEntry.assessment ?? null,
            config: extractionConfig,
            curveFilterKey: nextEntry.curveFilterKey ?? null,
            curveFilterField: nextEntry.curveFilterField ?? null,
            file: fallbackFile,
            fileId: nextEntry.fileId,
            fileName: nextEntry.fileName,
            jobId,
            maxPoints: 600,
            perfEnabled: isPerfEnabled(),
          },
        });
      })();
    }

    finishIfIdle();
  };

  worker.onmessage = (event: MessageEvent<ProcessingWorkerMessage>) => {
    const { type, payload } = event.data ?? {};
    if (payload?.jobId !== jobId) return;

    if (type === "processResult") {
      const nextProcessed = payload?.processed;
      const nextFileId = nextProcessed?.fileId;
      if (nextFileId && !hasSourceFile(nextFileId)) {
        filePerfFinishers.get(nextFileId)?.({
          skipped: "removed-before-result",
          ...summarizeProcessedFile(nextProcessed),
        });
        filePerfFinishers.delete(nextFileId);
        processedCount += 1;
        activeCount = Math.max(0, activeCount - 1);
        setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));
        launchNext();
        return;
      }
      hasAnyProcessedResult = true;
      if (nextFileId) {
        filePerfFinishers.get(nextFileId)?.(
          summarizeProcessedFile(nextProcessed),
        );
        filePerfFinishers.delete(nextFileId);
      }
      const appliedTemplateConfig = nextFileId
        ? extractionConfigByFileId.get(nextFileId)
        : undefined;
      if (nextFileId) {
        extractionConfigByFileId.delete(nextFileId);
      }
      commitTemplateOutput(nextProcessed as ProcessedEntry, {
        appliedTemplateConfig,
        appliedTemplateSelection: resolveAppliedTemplateSelection(
          nextFileId,
          fileTemplateSelectionsByFileId,
          templateSelection,
        ),
      });
      processedCount += 1;
      activeCount = Math.max(0, activeCount - 1);
      setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));
      showResultsOnce();
      launchNext();
      return;
    }

    if (type === "workerError") {
      const errorFileId = String(payload?.fileId ?? "").trim();
      if (errorFileId) {
        filePerfFinishers.get(errorFileId)?.({
          failed: true,
          fileName: payload?.fileName ?? null,
          message: payload?.message ?? null,
        });
        filePerfFinishers.delete(errorFileId);
        extractionConfigByFileId.delete(errorFileId);
      }
      onWorkerErrorPayload?.(payload);
      processedCount += 1;
      activeCount = Math.max(0, activeCount - 1);
      setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));

      if (processingStopOnErrorRef.current) {
        processingJobIdRef.current += 1;
        finishBatchPerf({
          failed: true,
          fileId: payload?.fileId ?? null,
          fileName: payload?.fileName ?? null,
        });
        failProcessingJob({
          setProcessingStatus,
          worker,
          workerRef: processingWorkerRef,
        });
        return;
      }
      launchNext();
    }
  };

  launchNext();
};

