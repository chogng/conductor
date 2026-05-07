import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { prepareExtraction } from "../shared/lib/extractionValidation";
import {
  parseOlderExtractionError,
  stableStringify,
} from "../shared/lib/utils";
import {
  isPerfEnabled,
  logPerf,
  startPerf,
  summarizeProcessedFile,
} from "../shared/lib/perf";
import {
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  splitFileNameMatchInput,
} from "../shared/lib/fileNameFieldMatching";
import type {
  ProcessedEntry,
  ProcessingStatus,
  RawDataEntry,
} from "../shared/lib/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "../shared/lib/translateTypes";
import { loadConvertedCsvFile } from "./importWorkerClient";

type ExtractionErrorEntry = {
  fileName?: string;
  message: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ProcessingQueueItem = {
  file: unknown;
  fileId: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  sourcePath?: string | null;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
};

type ExtractionMeta = {
  groupSize?: number;
  groupSizeCell?: boolean;
  groupSizePreview?: number;
  groups?: number;
  pointsRawUpper?: string;
  total?: number | null;
};

type ExtractionFeedback = {
  message: string;
  ok: boolean;
  type: "warning" | "success";
};

type PreparedExtractionResult = {
  extractionConfig?: unknown;
  meta?: ExtractionMeta;
  message?: string;
  ok: boolean;
  stopOnError?: boolean;
  type?: string;
  warnings?: string[];
};

type StartExtractionJobOptions = {
  extractionConfig: unknown;
  messageType?: "processFile" | "processFileAuto";
  queue: ProcessingQueueItem[];
  resetProcessedData: boolean;
  stopOnError: boolean;
};

type UseProcessingOptions = {
  activeFileId?: unknown;
  getPreviewRow: (rowIndex: number) => unknown;
  previewFile: unknown;
  processedData?: ProcessedEntry[];
  rawData?: RawDataEntry[];
  rawDataByIdRef: MutableRefObject<Map<string, unknown>>;
  onExtractionError?: (error: ExtractionErrorEntry) => void;
  setActivePage: (page: string) => void;
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  t: TranslateFn;
};

type FileNameTemplateRulePayload = {
  matchMode?: unknown;
  pattern?: unknown;
  templateName?: unknown;
  templateConfig?: unknown;
  caseSensitive?: unknown;
};

type RuleBasedExtractionConfig = {
  fallbackTemplateConfig?: unknown;
  fileNameFieldSeparators?: unknown;
  fileNameTemplateRules?: FileNameTemplateRulePayload[];
  stopOnError?: unknown;
};

const RUST_PROCESSING_CONCURRENCY = 2;
const ANALYSIS_CACHE_SINGLE_FILE_BUDGET_BYTES = 32 * 1024 * 1024;
const ANALYSIS_CACHE_TOTAL_BUDGET_BYTES = 64 * 1024 * 1024;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const resolveRuleCurveFilterInfo = (rule: {
  matchMode?: unknown;
  patternText?: unknown;
  patternTokens?: unknown;
}): { key: string; label: string } | null => {
  if (!rule || typeof rule !== "object") return null;

  if (rule.matchMode === "phrase") {
    const phrase = String(rule.patternText ?? "").trim();
    if (!phrase) return null;
    return {
      key: `rule:${encodeURIComponent(
        stableStringify({ mode: "phrase", pattern: phrase.toLowerCase() }),
      )}`,
      label: phrase,
    };
  }

  const tokens = Array.isArray(rule.patternTokens)
    ? rule.patternTokens
        .map((token) => String(token ?? "").trim())
        .filter(Boolean)
    : [];

  if (!tokens.length) return null;

  const normalizedTokens = tokens.map((token) => token.toLowerCase());
  return {
    key: `rule:${encodeURIComponent(
      stableStringify({ mode: "field", tokens: normalizedTokens }),
    )}`,
    // Keep full selected rule semantics visible in filter label.
    label: tokens.length === 1 ? tokens[0] : tokens.join(" + "),
  };
};

const buildProcessingQueue = (
  rawData: RawDataEntry[],
  processedIds: Set<string> | null = null,
): ProcessingQueueItem[] => {
  const queue: ProcessingQueueItem[] = [];
  const queuedIds = new Set();

  for (const entry of Array.isArray(rawData) ? rawData : []) {
    const fileId = entry?.fileId;
    if (!entry?.file || !fileId) continue;
    if (processedIds?.has(fileId) || queuedIds.has(fileId)) continue;

    queue.push({
      file: entry.file,
      fileId,
      fileName: entry.fileName,
      normalizedCsvPath:
        typeof entry.normalizedCsvPath === "string"
          ? entry.normalizedCsvPath
          : null,
      sourcePath:
        typeof entry.sourcePath === "string" ? entry.sourcePath : null,
    });
    queuedIds.add(fileId);
  }

  return queue;
};

const isRustCapableProcessingEntry = (entry: ProcessingQueueItem): boolean =>
  typeof entry?.sourcePath === "string" && entry.sourcePath.trim().length > 0;

const resolveProcessingFallbackFile = async (
  entry: ProcessingQueueItem,
): Promise<File | unknown> => {
  const loaded = await loadConvertedCsvFile({
    fallbackFile: entry.file,
    fileName: entry.fileName,
    lastModified: entry.file instanceof File ? entry.file.lastModified : null,
    normalizedCsvPath: entry.normalizedCsvPath,
  });
  return loaded ?? entry.file;
};

const buildProcessedFileIds = (processedData: ProcessedEntry[]): Set<string> =>
  new Set(
    (Array.isArray(processedData) ? processedData : [])
      .map((entry) => entry?.fileId)
      .filter((fileId): fileId is string => Boolean(fileId)),
  );

const getEstimatedAnalysisCacheBytes = (file: unknown): number => {
  const summary = summarizeProcessedFile(file);
  const value = Number(summary.analysisCacheEstimatedBytes);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getAnalysisCacheTouchedAt = (file: unknown): number => {
  const value = Number((file as any)?.analysisCacheTouchedAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
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

const pruneAnalysisCacheCurves = (file: ProcessedEntry): ProcessedEntry => {
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
  files: ProcessedEntry[],
  activeFileId: unknown = null,
): ProcessedEntry[] => {
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
      estimatedBytes[index] > ANALYSIS_CACHE_SINGLE_FILE_BUDGET_BYTES &&
      hasPrunableAnalysisCurves(files[index])
    ) {
      pruneIndexes.add(index);
    }
  }

  let projectedTotalBytes = totalBytes;
  for (const index of pruneIndexes) {
    projectedTotalBytes -= estimatedBytes[index] ?? 0;
  }

  if (projectedTotalBytes > ANALYSIS_CACHE_TOTAL_BUDGET_BYTES) {
    for (const { index } of pruneOrder) {
      if (projectedTotalBytes <= ANALYSIS_CACHE_TOTAL_BUDGET_BYTES) break;
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

const buildExtractionStartFeedback = ({
  count,
  messageKey,
  meta = {},
  t,
  warnings = [],
}: {
  count: number;
  messageKey: string;
  meta?: ExtractionMeta;
  t: TranslateFn;
  warnings?: string[];
}): ExtractionFeedback => {
  const groupSizePreview = Number(meta.groupSizePreview);
  const fixedGroupSize = Number(meta.groupSize);
  const fixedGroupCount = Number(meta.groups);
  const groupSizeText = meta.groupSizeCell
    ? t("da_extract_points_from_cell", { cell: meta.pointsRawUpper || "" })
    : Number.isInteger(fixedGroupSize) && fixedGroupSize > 0
      ? t("da_extract_points_fixed", { points: fixedGroupSize })
      : t("da_extract_points_fixed", { points: "-" });
  const groupsText =
    meta.groupSizeCell &&
    Number.isInteger(groupSizePreview) &&
    groupSizePreview > 0
      ? t("da_extract_groups_suffix", {
          groups: Math.max(0, Number(meta.total || 0) / groupSizePreview),
        })
      : !meta.groupSizeCell &&
          Number.isInteger(fixedGroupCount) &&
          fixedGroupCount > 0
        ? t("da_extract_groups_suffix", { groups: fixedGroupCount })
        : "";
  const warningText = warnings.length
    ? t("da_extract_warnings_block", { warnings: warnings.join("\n- ") })
    : "";

  return {
    message: t(messageKey, {
      count,
      detail: groupSizeText,
      groups: groupsText,
      warnings: warningText,
    }),
    ok: true,
    type: warnings.length ? "warning" : "success",
  };
};

const createProcessingWorker = () =>
  new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), {
    type: "module",
  });

const terminateProcessingWorker = (
  workerRef: MutableRefObject<Worker | null>,
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
  setActivePage,
  setProcessingStatus,
  worker,
  workerRef,
}: {
  hasAnyProcessedResult: boolean;
  setActivePage: (page: string) => void;
  setProcessingStatus: Dispatch<SetStateAction<ProcessingStatus>>;
  worker: Worker;
  workerRef: MutableRefObject<Worker | null>;
}) => {
  setProcessingStatus((prev) => ({ ...prev, state: "done" }));
  if (hasAnyProcessedResult) {
    setActivePage("analysis");
  }
  terminateProcessingWorker(workerRef, worker);
};

const failProcessingJob = ({
  setProcessingStatus,
  worker,
  workerRef,
}: {
  setProcessingStatus: Dispatch<SetStateAction<ProcessingStatus>>;
  worker: Worker;
  workerRef: MutableRefObject<Worker | null>;
}) => {
  setProcessingStatus((prev) => ({ ...prev, state: "error" }));
  terminateProcessingWorker(workerRef, worker);
};

const buildWorkerExtractionError = (payload: any): ExtractionErrorEntry => {
  const rawMessage =
    typeof payload?.message === "string" && payload.message.trim()
      ? payload.message
      : "Unknown error";
  const fallbackParsed = parseOlderExtractionError(rawMessage) as {
    fileName?: string;
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
  } | null;

  return {
    fileName: payload?.fileName ?? fallbackParsed?.fileName ?? "Unknown file",
    message: rawMessage,
    messageKey:
      (typeof payload?.messageKey === "string" && payload.messageKey) ||
      fallbackParsed?.messageKey ||
      null,
    messageParams:
      (payload?.messageParams &&
        typeof payload.messageParams === "object" &&
        (payload.messageParams as Record<string, unknown>)) ||
      fallbackParsed?.messageParams ||
      null,
  };
};

export const useProcessing = ({
  activeFileId = null,
  getPreviewRow,
  previewFile,
  processedData = [],
  rawData = [],
  rawDataByIdRef,
  onExtractionError,
  setActivePage,
  setProcessedData,
  t,
}: UseProcessingOptions) => {
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    state: "idle",
    processed: 0,
    total: 0,
  });

  const processingWorkerRef = useRef<Worker | null>(null);
  const processingJobIdRef = useRef(0);
  const processingQueueRef = useRef<ProcessingQueueItem[]>([]);
  const processingStopOnErrorRef = useRef(false);
  const removedQueuedFileIdsRef = useRef<Set<string>>(new Set());
  const lastAppliedTemplateConfigFingerprintRef = useRef<string | null>(null);

  const resetProcessingWorker = useCallback(() => {
    processingJobIdRef.current += 1;
    processingQueueRef.current = [];
    processingStopOnErrorRef.current = false;
    removedQueuedFileIdsRef.current = new Set();

    terminateProcessingWorker(processingWorkerRef);

    setProcessingStatus({
      state: "idle",
      processed: 0,
      total: 0,
    });
  }, []);

  const removeQueuedProcessingFile = useCallback(
    (fileId: string) => {
      if (processingStatus.state !== "processing") return;

      const before = processingQueueRef.current.length;
      processingQueueRef.current = processingQueueRef.current.filter(
        (entry) => entry?.fileId !== fileId,
      );

      const removedCount = before - processingQueueRef.current.length;
      if (removedCount > 0) {
        removedQueuedFileIdsRef.current.add(fileId);
        setProcessingStatus((prev) => ({
          ...prev,
          total: Math.max(prev.processed, prev.total - removedCount),
        }));
      }
    },
    [processingStatus.state],
  );

  useEffect(() => {
    return () => {
      terminateProcessingWorker(processingWorkerRef);
    };
  }, []);

  const prepareExtractionRun = useCallback(
    (config: Record<string, unknown>): PreparedExtractionResult => {
      const prepared = prepareExtraction({
        config,
        getPreviewRow,
        previewFile,
        rawData,
        t,
      }) as PreparedExtractionResult & {
        extractionConfig?: unknown;
        meta?: ExtractionMeta;
        warnings?: unknown;
      };

      if (!prepared.ok) return prepared;

      return {
        extractionConfig: prepared.extractionConfig,
        meta: prepared.meta ?? {},
        ok: true,
        stopOnError: Boolean(config?.stopOnError),
        warnings: Array.isArray(prepared.warnings) ? prepared.warnings : [],
      };
    },
    [getPreviewRow, previewFile, rawData, t],
  );

  const tryProcessFileWithRust = useCallback(
    async ({
      entry,
      extractionConfig,
      messageType,
    }: {
      entry: ProcessingQueueItem;
      extractionConfig: unknown;
      messageType: "processFile" | "processFileAuto";
    }): Promise<ProcessedEntry | null> => {
      const sourcePath =
        typeof entry.sourcePath === "string" ? entry.sourcePath.trim() : "";
      if (!sourcePath) return null;

      const bridge = (globalThis.window as any)?.desktopImport;
      if (!bridge?.processDeviceAnalysisFileWithRust) return null;

      try {
        let finalExtractionConfig = extractionConfig;
        if (messageType === "processFileAuto") {
          const response = await bridge.processDeviceAnalysisFileWithRust({
            auto: true,
            curveFilterField: entry.curveFilterField ?? null,
            curveFilterKey: entry.curveFilterKey ?? null,
            fileId: entry.fileId,
            fileName: entry.fileName ?? "",
            maxPoints: 600,
            path: sourcePath,
          });
          if (!response?.ok || !response?.result) return null;
          return response.result as ProcessedEntry;
        } else if (messageType !== "processFile") {
          return null;
        }

        const response = await bridge.processDeviceAnalysisFileWithRust({
          config: finalExtractionConfig,
          curveFilterField: entry.curveFilterField ?? null,
          curveFilterKey: entry.curveFilterKey ?? null,
          fileId: entry.fileId,
          fileName: entry.fileName ?? "",
          maxPoints: 600,
          path: sourcePath,
        });
        if (!response?.ok || !response?.result) return null;
        return response.result as ProcessedEntry;
      } catch {
        return null;
      }
    },
    [],
  );

  const startExtractionJob = useCallback(
    ({
      extractionConfig,
      messageType = "processFile",
      queue,
      resetProcessedData,
      stopOnError,
    }: StartExtractionJobOptions) => {
      if (!Array.isArray(queue) || queue.length === 0) return;

      const workQueue = [...queue];
      let hasAnyProcessedResult = false;
      const finishBatchPerf = startPerf("processing:batch", {
        fileCount: workQueue.length,
        mode: messageType,
        resetProcessedData,
        stopOnError,
      });
      const filePerfFinishers = new Map<
        string,
        (meta?: Record<string, unknown>) => void
      >();

      if (resetProcessedData) setProcessedData([]);
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
          setActivePage,
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

          if (!nextEntry) {
            break;
          }
          if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) {
            continue;
          }

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
            if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
              filePerfFinishers.get(nextFileId)?.({
                skipped: "removed-before-result",
                ...summarizeProcessedFile(rustProcessed),
                source: "rust-engine",
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
                source: "rust-engine",
              });
              filePerfFinishers.delete(nextFileId);
            }
            setProcessedData((prev) =>
              applyAnalysisCacheBudget([...prev, rustProcessed], activeFileId),
            );
            setProcessingStatus((prev) => ({
              ...prev,
              processed: prev.processed + 1,
            }));
            completedCount += 1;
            activeCount = Math.max(0, activeCount - 1);
            launchNext();
            return;
          }

          const fallbackFile = await resolveProcessingFallbackFile(nextEntry);
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

          if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
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
          setProcessedData((prev) =>
            applyAnalysisCacheBudget(
              [...prev, nextProcessed as ProcessedEntry],
              activeFileId,
            ),
          );
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
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
          onExtractionError?.(buildWorkerExtractionError(payload));
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
    },
    [
      activeFileId,
      onExtractionError,
      rawDataByIdRef,
      setActivePage,
      setProcessedData,
      tryProcessFileWithRust,
    ],
  );

  const handleRuleBasedTemplateApplied = useCallback(
    (
      config: RuleBasedExtractionConfig,
      incremental: boolean,
    ): ExtractionFeedback | { ok: false; message: string; type: "warning" } => {
      if (incremental && processingStatus.state === "processing") {
        return {
          message: t("da_apply_to_new_files_busy"),
          ok: false,
          type: "warning",
        };
      }

      const rawRules = Array.isArray(config?.fileNameTemplateRules)
        ? config.fileNameTemplateRules
        : [];
      const fileNameFieldSeparators = normalizeFileNameFieldSeparators(
        config?.fileNameFieldSeparators,
      );
      const fallbackTemplateConfig = isObjectRecord(config?.fallbackTemplateConfig)
        ? ({
            ...(config.fallbackTemplateConfig as Record<string, unknown>),
            fileNameFieldSeparators,
          } as Record<string, unknown>)
        : null;
      const normalizedRules = rawRules
        .map((rule) => {
          const caseSensitive = Boolean(rule?.caseSensitive);
          const matchMode = rule?.matchMode === "phrase" ? "phrase" : "field";
          const patternText = String(rule?.pattern ?? "").trim();
          const patternTokens = splitFileNameMatchInput(
            rule?.pattern,
            caseSensitive,
          );
          const templateConfig = isObjectRecord(rule?.templateConfig)
            ? ({
                ...(rule.templateConfig as Record<string, unknown>),
                fileNameFieldSeparators,
              } as Record<string, unknown>)
            : null;
          const templateName = String(rule?.templateName ?? "").trim();
          if (!templateConfig) return null;
          if (matchMode === "field" && !patternTokens.length) return null;
          if (matchMode === "phrase" && !patternText) return null;
          return {
            caseSensitive,
            matchMode,
            patternText,
            patternTokens,
            templateConfig,
            templateName,
          };
        })
        .filter(Boolean) as Array<{
        caseSensitive: boolean;
        matchMode: "field" | "phrase";
        patternText: string;
        patternTokens: string[];
        templateConfig: Record<string, unknown>;
        templateName: string;
      }>;

      if (!normalizedRules.length) {
        return {
          message: t("da_template_name"),
          ok: false,
          type: "warning",
        };
      }

      const processedIds = incremental ? buildProcessedFileIds(processedData) : null;
      const candidates = buildProcessingQueue(rawData, processedIds);
      const queueByTemplateName = new Map<string, ProcessingQueueItem[]>();
      const configByTemplateName = new Map<string, Record<string, unknown>>();

      for (const entry of candidates) {
        const fileNameRaw = String(entry.fileName ?? "");
        const matchedRule = normalizedRules.find((rule) =>
          rule.matchMode === "phrase"
            ? matchFileNameAgainstPhrase(fileNameRaw, rule.patternText, {
                caseSensitive: rule.caseSensitive,
              })
            : matchFileNameAgainstPatternTokens(fileNameRaw, rule.patternTokens, {
                caseSensitive: rule.caseSensitive,
                separators: fileNameFieldSeparators,
              }),
        );
        if (!matchedRule) {
          if (!fallbackTemplateConfig) continue;
          const fallbackKey = "__fallback__";
          if (!queueByTemplateName.has(fallbackKey)) {
            queueByTemplateName.set(fallbackKey, []);
          }
          queueByTemplateName.get(fallbackKey)?.push(entry);
          configByTemplateName.set(fallbackKey, fallbackTemplateConfig);
          continue;
        }
        const matchedCurveFilterInfo = resolveRuleCurveFilterInfo(matchedRule);
        const queuedEntry: ProcessingQueueItem = matchedCurveFilterInfo
          ? {
              ...entry,
              curveFilterKey: matchedCurveFilterInfo.key,
              curveFilterField: matchedCurveFilterInfo.label,
            }
          : entry;
        const key = matchedRule.templateName || stableStringify(matchedRule.templateConfig);
        if (!queueByTemplateName.has(key)) queueByTemplateName.set(key, []);
        queueByTemplateName.get(key)?.push(queuedEntry);
        configByTemplateName.set(key, matchedRule.templateConfig);
      }

      const groupedEntries = Array.from(queueByTemplateName.entries());
      if (!groupedEntries.length) {
        return {
          message: t("da_apply_to_new_files_no_new"),
          ok: false,
          type: "warning",
        };
      }

      const finalQueue: ProcessingQueueItem[] = [];
      const groupedPrepared: Array<{
        extractionConfig: unknown;
        queue: ProcessingQueueItem[];
      }> = [];
      const warnings: string[] = [];

      for (const [key, queue] of groupedEntries) {
        const templateConfig = configByTemplateName.get(key);
        if (!templateConfig || !queue.length) continue;
        const prepared = prepareExtractionRun({
          ...templateConfig,
          stopOnError: Boolean(config?.stopOnError),
        });
        if (!prepared.ok) {
          return prepared as {
            ok: false;
            message: string;
            type: "warning";
          };
        }
        groupedPrepared.push({
          extractionConfig: prepared.extractionConfig,
          queue,
        });
        if (Array.isArray(prepared.warnings) && prepared.warnings.length > 0) {
          warnings.push(...prepared.warnings);
        }
        finalQueue.push(...queue);
      }

      if (!groupedPrepared.length || !finalQueue.length) {
        return {
          message: t("da_apply_to_new_files_no_new"),
          ok: false,
          type: "warning",
        };
      }

      lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      const stopOnError = Boolean(config?.stopOnError);
      processingStopOnErrorRef.current = stopOnError;
      processingJobIdRef.current += 1;
      const jobId = processingJobIdRef.current;

      terminateProcessingWorker(processingWorkerRef);

      const worker = createProcessingWorker();
      processingWorkerRef.current = worker;

      if (!incremental) setProcessedData([]);
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

      const finishIfIdle = () => {
        if (finishing || activeCount > 0 || ruleQueue.length > 0) return;
        finishing = true;
          finishBatchPerf({
            completedCount: processedCount,
            hasAnyProcessedResult,
          });
          finishProcessingJob({
            hasAnyProcessedResult,
            setActivePage,
            setProcessingStatus,
            worker,
            workerRef: processingWorkerRef,
          });
          return;
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
          if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) {
            continue;
          }

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
              if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
                filePerfFinishers.get(nextFileId)?.({
                  skipped: "removed-before-result",
                  ...summarizeProcessedFile(rustProcessed),
                  source: "rust-engine",
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
                  source: "rust-engine",
                });
                filePerfFinishers.delete(nextFileId);
              }
              setProcessedData((prev) =>
                applyAnalysisCacheBudget([...prev, rustProcessed], activeFileId),
              );
              processedCount += 1;
              activeCount = Math.max(0, activeCount - 1);
              setProcessingStatus((prev) => ({
                ...prev,
                processed: processedCount,
              }));
              launchNext();
              return;
            }

            const fallbackFile = await resolveProcessingFallbackFile(nextEntry);
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
          if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
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
          setProcessedData((prev) =>
            applyAnalysisCacheBudget(
              [...prev, nextProcessed as ProcessedEntry],
              activeFileId,
            ),
          );
          processedCount += 1;
          activeCount = Math.max(0, activeCount - 1);
          setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));
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
          onExtractionError?.(buildWorkerExtractionError(payload));
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
      return buildExtractionStartFeedback({
        count: finalQueue.length,
        messageKey: incremental
          ? "da_extract_started_incremental"
          : "da_extract_started",
        meta: {},
        t,
        warnings,
      });
    },
    [
      activeFileId,
      onExtractionError,
      prepareExtractionRun,
      processedData,
      processingStatus.state,
      rawData,
      rawDataByIdRef,
      setActivePage,
      setProcessedData,
      t,
      tryProcessFileWithRust,
    ],
  );

  const handleTemplateApplied = useCallback(
    (config: Record<string, unknown>) => {
        if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
          return handleRuleBasedTemplateApplied(
            config as RuleBasedExtractionConfig,
            false,
          );
        }
        if (Boolean(config?.autoExtractionMode)) {
          const queue = buildProcessingQueue(rawData);

          lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
          startExtractionJob({
            extractionConfig: config,
            messageType: "processFileAuto",
            queue,
            resetProcessedData: true,
            stopOnError: Boolean(config?.stopOnError),
          });

          return buildExtractionStartFeedback({
            count: queue.length,
            messageKey: "da_extract_started",
            meta: {},
            t,
            warnings: [],
          });
        }
        const prepared = prepareExtractionRun(config);
        if (!prepared.ok) return prepared;

      const queue = buildProcessingQueue(rawData);

      lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      startExtractionJob({
        extractionConfig: prepared.extractionConfig,
        queue,
        resetProcessedData: true,
        stopOnError: Boolean(prepared.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: queue.length,
        messageKey: "da_extract_started",
        meta: prepared.meta,
        t,
        warnings: prepared.warnings,
      });
    },
    [handleRuleBasedTemplateApplied, prepareExtractionRun, rawData, startExtractionJob, t],
  );

  const handleTemplateAppliedIncremental = useCallback(
    (config: Record<string, unknown>) => {
      if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
        return handleRuleBasedTemplateApplied(
          config as RuleBasedExtractionConfig,
          true,
        );
      }
      if (Boolean(config?.autoExtractionMode)) {
        if (processingStatus.state === "processing") {
          return {
            message: t("da_apply_to_new_files_busy"),
            ok: false,
            type: "warning",
          };
        }

        const lastFingerprint = lastAppliedTemplateConfigFingerprintRef.current;
        if (!lastFingerprint) {
          return {
            message: t("da_apply_to_new_files_requires_full_apply"),
            ok: false,
            type: "warning",
          };
        }

        if (stableStringify(config) !== lastFingerprint) {
          return {
            message: t("da_apply_to_new_files_requires_same_config"),
            ok: false,
            type: "warning",
          };
        }

        const processedIds = buildProcessedFileIds(processedData);
        const queue = buildProcessingQueue(rawData, processedIds);
        if (!queue.length) {
          return {
            message: t("da_apply_to_new_files_no_new"),
            ok: false,
            type: "warning",
          };
        }

        startExtractionJob({
          extractionConfig: config,
          messageType: "processFileAuto",
          queue,
          resetProcessedData: false,
          stopOnError: Boolean(config?.stopOnError),
        });

        return buildExtractionStartFeedback({
          count: queue.length,
          messageKey: "da_apply_to_new_files_started",
          meta: {},
          t,
          warnings: [],
        });
      }
      if (processingStatus.state === "processing") {
        return {
          message: t("da_apply_to_new_files_busy"),
          ok: false,
          type: "warning",
        };
      }

      const lastFingerprint = lastAppliedTemplateConfigFingerprintRef.current;
      if (!lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_requires_full_apply"),
          ok: false,
          type: "warning",
        };
      }

      if (stableStringify(config) !== lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_requires_same_config"),
          ok: false,
          type: "warning",
        };
      }

      const processedIds = buildProcessedFileIds(processedData);
      const queue = buildProcessingQueue(rawData, processedIds);

      if (!queue.length) {
        return {
          message: t("da_apply_to_new_files_no_new"),
          ok: false,
          type: "warning",
        };
      }

      const prepared = prepareExtractionRun(config);
      if (!prepared.ok) return prepared;

      startExtractionJob({
        extractionConfig: prepared.extractionConfig,
        queue,
        resetProcessedData: false,
        stopOnError: Boolean(prepared.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: queue.length,
        messageKey: "da_apply_to_new_files_started",
        meta: prepared.meta,
        t,
        warnings: prepared.warnings,
      });
    },
    [
      prepareExtractionRun,
      processedData,
      processingStatus.state,
      rawData,
      startExtractionJob,
      t,
      handleRuleBasedTemplateApplied,
    ],
  );

  return {
    handleTemplateApplied,
    handleTemplateAppliedIncremental,
    processingStatus,
    removeQueuedProcessingFile,
    resetProcessingWorker,
  };
};
