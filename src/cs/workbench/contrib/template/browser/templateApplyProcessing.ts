import type { MutableState } from "src/cs/workbench/services/session/common/session";
import {
  isPerfEnabled,
  logPerf,
  startPerf,
  summarizeProcessedFile,
} from "src/cs/workbench/common/perf";
import type {
  AnalysisFileResults,
  AnalysisResultsByFileId,
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import { loadConvertedCsvFile } from "src/cs/workbench/services/analysisFile/browser/fileConversion";

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
}) => Promise<CleanedEntry | null>;

type SchedulerRefs = {
  processingJobIdRef: MutableState<number>;
  processingQueueRef: MutableState<ProcessingQueueItem[]>;
  processingStopOnErrorRef: MutableState<boolean>;
  processingWorkerRef: MutableState<Worker | null>;
  removedQueuedFileIdsRef: MutableState<Set<string>>;
};

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

type SchedulerCallbacks = {
  batchSessionUpdate?: (callback: () => void) => void;
  onWorkerErrorPayload?: (payload: unknown) => void;
  hasSourceFile: (fileId: string | null | undefined) => boolean;
  showResults: () => void;
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
  setCleanedData: StateSetter<CleanedEntry[]>;
  setProcessingStatus: StateSetter<ProcessingStatus>;
};

export type ProcessingJobOptions = SchedulerRefs &
  SchedulerCallbacks & {
    analysisFileService: IAnalysisFileService;
    activeFileId?: unknown;
    extractionConfig: unknown;
    messageType?: ProcessingMessageType;
    queue: ProcessingQueueItem[];
    resetCleanedData: boolean;
    stopOnError: boolean;
    tryProcessFileWithRust: TryProcessFileWithRust;
  };

export type RuleProcessingJobOptions = SchedulerRefs &
  SchedulerCallbacks & {
    analysisFileService: IAnalysisFileService;
    activeFileId?: unknown;
    finalQueue: ProcessingQueueItem[];
    groupedPrepared: PreparedRuleProcessingGroup[];
    incremental: boolean;
    stopOnError: boolean;
    tryProcessFileWithRust: TryProcessFileWithRust;
  };

const RUST_PROCESSING_CONCURRENCY = 2;
const CACHE_SINGLE_FILE_BUDGET_BYTES = 32 * 1024 * 1024;
const CACHE_TOTAL_BUDGET_BYTES = 64 * 1024 * 1024;

const isRustCapableProcessingEntry = (entry: ProcessingQueueItem): boolean =>
  Boolean(
    (typeof entry?.normalizedCsvPath === "string" &&
      entry.normalizedCsvPath.trim()) ||
      (typeof entry?.sourcePath === "string" &&
        entry.sourcePath.trim().toLowerCase().endsWith(".csv")),
  );

const resolveProcessingFallbackFile = async (
  analysisFileService: IAnalysisFileService,
  entry: ProcessingQueueItem,
): Promise<File | unknown> => {
  const loaded = await loadConvertedCsvFile({
    analysisFileService,
    fallbackFile: entry.file,
    fileName: entry.fileName,
    lastModified: entry.file instanceof File ? entry.file.lastModified : null,
    normalizedCsvPath: entry.normalizedCsvPath,
  });
  return loaded ?? entry.file;
};

const getEstimatedAnalysisCacheBytes = (file: unknown): number => {
  const summary = summarizeProcessedFile(file);
  const value = Number(summary.analysisCacheEstimatedBytes);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getAnalysisCacheTouchedAt = (file: unknown): number => {
  const value = Number((file as any)?.analysisCacheTouchedAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getAnalysisFileResults = (
  file: CleanedEntry | null | undefined,
): AnalysisFileResults | null => {
  const fileId = String(file?.fileId ?? "").trim();
  if (!fileId || !file || typeof file !== "object") return null;

  const record = file as Record<string, unknown>;
  if (record.analysisCache === undefined) return null;

  const touchedAt = Number(record.analysisCacheTouchedAt);
  return {
    fileId,
    analysisCache: record.analysisCache,
    touchedAt: Number.isFinite(touchedAt) && touchedAt > 0 ? touchedAt : undefined,
  };
};

const commitAnalysisResults = (
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>,
  file: CleanedEntry | null | undefined,
): void => {
  const results = getAnalysisFileResults(file);
  if (!results) return;

  setAnalysisResults((previous) => ({
    ...(previous || {}),
    [results.fileId]: results,
  }));
};

const hasPrunableAnalysisCurves = (file: unknown): boolean => {
  const rawSeries = (file as any)?.analysisCache?.series;
  if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) {
    return false;
  }
  return Object.values(rawSeries).some((entry: any) => {
    return Array.isArray(entry?.gm) || Array.isArray(entry?.ss);
  });
};

const pruneAnalysisCacheCurves = (file: CleanedEntry): CleanedEntry => {
  const analysisCache = (file as any)?.analysisCache;
  const rawSeries = analysisCache?.series;
  if (!rawSeries || typeof rawSeries !== "object" || Array.isArray(rawSeries)) {
    return file;
  }

  const nextSeries: Record<string, unknown> = {};
  for (const [seriesId, entry] of Object.entries(rawSeries)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      nextSeries[seriesId] = entry;
      continue;
    }
    const { gm: _gm, ss: _ss, ...rest } = entry as Record<string, unknown>;
    nextSeries[seriesId] = rest;
  }

  return {
    ...file,
    analysisCache: {
      ...analysisCache,
      curvesPruned: true,
      series: nextSeries,
    },
  };
};

const applyAnalysisCacheBudget = (
  files: CleanedEntry[],
  activeFileId: unknown = null,
): CleanedEntry[] => {
  if (!Array.isArray(files) || files.length === 0) return files;

  let totalBytes = 0;
  const estimatedBytes = files.map((file) => {
    const bytes = getEstimatedAnalysisCacheBytes(file);
    totalBytes += bytes;
    return bytes;
  });

  const activeFileKey = String(activeFileId ?? "").trim();
  const pruneOrder = files
    .map((file, index) => ({
      index,
      isActive:
        activeFileKey.length > 0 &&
        String((file as any)?.fileId ?? "") === activeFileKey,
      touchedAt: getAnalysisCacheTouchedAt(file),
    }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? 1 : -1;
      if (a.touchedAt !== b.touchedAt) return a.touchedAt - b.touchedAt;
      return a.index - b.index;
    });

  const pruneIndexes = new Set<number>();
  for (const { index } of pruneOrder) {
    if (
      estimatedBytes[index] > CACHE_SINGLE_FILE_BUDGET_BYTES &&
      hasPrunableAnalysisCurves(files[index])
    ) {
      pruneIndexes.add(index);
    }
  }

  let projectedTotalBytes = totalBytes;
  for (const index of pruneIndexes) {
    projectedTotalBytes -= estimatedBytes[index] ?? 0;
  }

  if (projectedTotalBytes > CACHE_TOTAL_BUDGET_BYTES) {
    for (const { index } of pruneOrder) {
      if (projectedTotalBytes <= CACHE_TOTAL_BUDGET_BYTES) break;
      if (pruneIndexes.has(index)) continue;
      if (!hasPrunableAnalysisCurves(files[index])) continue;
      pruneIndexes.add(index);
      projectedTotalBytes -= estimatedBytes[index] ?? 0;
    }
  }

  if (pruneIndexes.size === 0) return files;

  let prunedBytes = 0;
  let prunedFiles = 0;
  const nextFiles = files.map((file, index) => {
    if (!pruneIndexes.has(index)) return file;
    prunedBytes += estimatedBytes[index] ?? 0;
    prunedFiles += 1;
    return pruneAnalysisCacheCurves(file);
  });

  const prunedFileIds = nextFiles
    .map((file, index) =>
      pruneIndexes.has(index) ? String((file as any)?.fileId ?? "") : "",
    )
    .filter(Boolean);

  logPerf("processing:analysis-cache-prune", {
    activeFileId: activeFileKey || null,
    prunedBytes,
    prunedFileIds,
    prunedFiles,
    totalBeforeBytes: totalBytes,
    totalAfterBytes: nextFiles.reduce(
      (sum, file) => sum + getEstimatedAnalysisCacheBytes(file),
      0,
    ),
  });

  return nextFiles;
};

const createProcessingWorker = () =>
  new Worker(new URL("../../workers/analysis.worker.ts", import.meta.url), {
    type: "module",
  });

export const terminateProcessingWorker = (
  workerRef: MutableState<Worker | null>,
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
  workerRef: MutableState<Worker | null>;
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
  workerRef: MutableState<Worker | null>;
}) => {
  setProcessingStatus((prev) => ({ ...prev, state: "error" }));
  terminateProcessingWorker(workerRef, worker);
};

// Runs one extraction config across a flat queue of files.
// processingController.ts decides the queue and config; this runner decides when to start,
// how many files to process in parallel, how to commit results, and when to finish.
export const startProcessingJob = ({
  analysisFileService,
  activeFileId = null,
  extractionConfig,
  messageType = "processFile",
  onWorkerErrorPayload,
  batchSessionUpdate,
  processingJobIdRef,
  processingQueueRef,
  processingStopOnErrorRef,
  processingWorkerRef,
  queue,
  hasSourceFile,
  removedQueuedFileIdsRef,
  resetCleanedData,
  showResults,
  setAnalysisResults,
  setCleanedData,
  setProcessingStatus,
  stopOnError,
  tryProcessFileWithRust,
}: ProcessingJobOptions) => {
  if (!Array.isArray(queue) || queue.length === 0) return;

  const workQueue = [...queue];
  const updateSession = (callback: () => void): void => {
    if (batchSessionUpdate) {
      batchSessionUpdate(callback);
      return;
    }
    callback();
  };
  let hasAnyProcessedResult = false;
  const finishBatchPerf = startPerf("processing:batch", {
    fileCount: workQueue.length,
    mode: messageType,
    resetCleanedData,
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

  if (resetCleanedData) {
    updateSession(() => {
      setCleanedData([]);
      setAnalysisResults({});
    });
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
          updateSession(() => {
            commitAnalysisResults(setAnalysisResults, rustProcessed);
            setCleanedData((prev) =>
              applyAnalysisCacheBudget([...prev, rustProcessed], activeFileId),
            );
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
          analysisFileService,
          nextEntry,
        );
        worker.postMessage({
          type: messageType,
          payload: {
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

  worker.onmessage = (event: MessageEvent<{ payload?: any; type?: string }>) => {
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
      updateSession(() => {
        commitAnalysisResults(setAnalysisResults, nextProcessed as CleanedEntry);
        setCleanedData((prev) =>
          applyAnalysisCacheBudget(
            [...prev, nextProcessed as CleanedEntry],
            activeFileId,
          ),
        );
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
  analysisFileService,
  activeFileId = null,
  finalQueue,
  groupedPrepared,
  incremental,
  onWorkerErrorPayload,
  batchSessionUpdate,
  processingJobIdRef,
  processingQueueRef,
  processingStopOnErrorRef,
  processingWorkerRef,
  hasSourceFile,
  removedQueuedFileIdsRef,
  showResults,
  setAnalysisResults,
  setCleanedData,
  setProcessingStatus,
  stopOnError,
  tryProcessFileWithRust,
}: RuleProcessingJobOptions) => {
  if (!groupedPrepared.length || !finalQueue.length) return;

  const updateSession = (callback: () => void): void => {
    if (batchSessionUpdate) {
      batchSessionUpdate(callback);
      return;
    }
    callback();
  };
  processingStopOnErrorRef.current = stopOnError;
  processingJobIdRef.current += 1;
  const jobId = processingJobIdRef.current;

  terminateProcessingWorker(processingWorkerRef);

  const worker = createProcessingWorker();
  processingWorkerRef.current = worker;

  if (!incremental) {
    updateSession(() => {
      setCleanedData([]);
      setAnalysisResults({});
    });
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
          }
          updateSession(() => {
            commitAnalysisResults(setAnalysisResults, rustProcessed);
            setCleanedData((prev) =>
              applyAnalysisCacheBudget([...prev, rustProcessed], activeFileId),
            );
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
          analysisFileService,
          nextEntry,
        );
        worker.postMessage({
          type: "processFile",
          payload: {
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

  worker.onmessage = (event: MessageEvent<{ payload?: any; type?: string }>) => {
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
      updateSession(() => {
        commitAnalysisResults(setAnalysisResults, nextProcessed as CleanedEntry);
        setCleanedData((prev) =>
          applyAnalysisCacheBudget(
            [...prev, nextProcessed as CleanedEntry],
            activeFileId,
          ),
        );
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
