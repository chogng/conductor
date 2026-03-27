import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { prepareDeviceAnalysisExtraction } from "../shared/lib/deviceAnalysisExtractionValidation";
import {
  parseLegacyExtractionError,
  stableStringify,
} from "../shared/lib/deviceAnalysisUtils";
import type {
  ProcessedEntry,
  ProcessingStatus,
  RawDataEntry,
} from "../shared/lib/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "../shared/lib/translateTypes";

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
  queue: ProcessingQueueItem[];
  resetProcessedData: boolean;
  stopOnError: boolean;
};

type UseDeviceAnalysisProcessingOptions = {
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
  pattern?: unknown;
  templateName?: unknown;
  templateConfig?: unknown;
};

type RuleBasedExtractionConfig = {
  fileNameTemplateRules?: FileNameTemplateRulePayload[];
  stopOnError?: unknown;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeRulePatternTokens = (value: unknown): string[] =>
  String(value ?? "")
    .split(/[,;\n]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

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
    });
    queuedIds.add(fileId);
  }

  return queue;
};

const buildProcessedFileIds = (processedData: ProcessedEntry[]): Set<string> =>
  new Set(
    (Array.isArray(processedData) ? processedData : [])
      .map((entry) => entry?.fileId)
      .filter((fileId): fileId is string => Boolean(fileId)),
  );

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

export const useDeviceAnalysisProcessing = ({
  getPreviewRow,
  previewFile,
  processedData = [],
  rawData = [],
  rawDataByIdRef,
  onExtractionError,
  setActivePage,
  setProcessedData,
  t,
}: UseDeviceAnalysisProcessingOptions) => {
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

    if (processingWorkerRef.current) {
      processingWorkerRef.current.terminate();
      processingWorkerRef.current = null;
    }

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
      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }
    };
  }, []);

  const prepareExtractionRun = useCallback(
    (config: Record<string, unknown>): PreparedExtractionResult => {
      const prepared = prepareDeviceAnalysisExtraction({
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

  const startExtractionJob = useCallback(
    ({
      extractionConfig,
      queue,
      resetProcessedData,
      stopOnError,
    }: StartExtractionJobOptions) => {
      if (!Array.isArray(queue) || queue.length === 0) return;

      const workQueue = [...queue];
      let hasAnyProcessedResult = false;

      if (resetProcessedData) setProcessedData([]);
      removedQueuedFileIdsRef.current = new Set();

      processingStopOnErrorRef.current = Boolean(stopOnError);
      processingJobIdRef.current += 1;
      const jobId = processingJobIdRef.current;

      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }

      const worker = new Worker(
        new URL("../workers/deviceAnalysis.worker.ts", import.meta.url),
        { type: "module" },
      );
      processingWorkerRef.current = worker;

      processingQueueRef.current = workQueue;
      setProcessingStatus({
        state: "processing",
        processed: 0,
        total: workQueue.length,
      });

      const processNext = () => {
        const nextEntry = processingQueueRef.current.shift();

        if (!nextEntry) {
          setProcessingStatus((prev) => ({ ...prev, state: "done" }));
          if (hasAnyProcessedResult) {
            setActivePage("analysis");
          }

          worker.terminate();
          if (processingWorkerRef.current === worker) {
            processingWorkerRef.current = null;
          }
          return;
        }
        if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) {
          processNext();
          return;
        }

        worker.postMessage({
          type: "processFile",
          payload: {
            config: extractionConfig,
            file: nextEntry.file,
            fileId: nextEntry.fileId,
            fileName: nextEntry.fileName,
            jobId,
            maxPoints: 600,
          },
        });
      };

      worker.onmessage = (event: MessageEvent<{ payload?: any; type?: string }>) => {
        const { type, payload } = event.data ?? {};

        if (type === "processResult") {
          if (payload?.jobId !== jobId) return;

          const nextProcessed = payload?.processed;
          const nextFileId = nextProcessed?.fileId;

          if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
            setProcessingStatus((prev) => ({
              ...prev,
              processed: prev.processed + 1,
            }));
            processNext();
            return;
          }

          hasAnyProcessedResult = true;
          setProcessedData((prev) => [...prev, nextProcessed as ProcessedEntry]);
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
          processNext();
          return;
        }

        if (type === "workerError") {
          if (payload?.jobId !== jobId) return;

          const rawMessage =
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message
              : "Unknown error";
          const legacyParsed = parseLegacyExtractionError(rawMessage) as {
            fileName?: string;
            messageKey?: string | null;
            messageParams?: Record<string, unknown> | null;
          } | null;
          const errFileName =
            payload?.fileName ?? legacyParsed?.fileName ?? "Unknown file";
          const errMessageKey =
            typeof payload?.messageKey === "string" && payload.messageKey
              ? payload.messageKey
              : legacyParsed?.messageKey ?? null;
          const errMessageParams =
            payload?.messageParams && typeof payload.messageParams === "object"
              ? (payload.messageParams as Record<string, unknown>)
              : legacyParsed?.messageParams ?? null;

          onExtractionError?.({
            fileName: errFileName,
            message: rawMessage,
            messageKey: errMessageKey,
            messageParams: errMessageParams,
          });
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));

          if (processingStopOnErrorRef.current) {
            setProcessingStatus((prev) => ({ ...prev, state: "error" }));
            worker.terminate();
            if (processingWorkerRef.current === worker) {
              processingWorkerRef.current = null;
            }
            return;
          }

          processNext();
        }
      };

      processNext();
    },
    [
      onExtractionError,
      rawDataByIdRef,
      setActivePage,
      setProcessedData,
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
      const normalizedRules = rawRules
        .map((rule) => {
          const patternTokens = normalizeRulePatternTokens(rule?.pattern);
          const templateConfig = isObjectRecord(rule?.templateConfig)
            ? (rule.templateConfig as Record<string, unknown>)
            : null;
          const templateName = String(rule?.templateName ?? "").trim();
          if (!patternTokens.length || !templateConfig) return null;
          return {
            patternTokens,
            templateConfig,
            templateName,
          };
        })
        .filter(Boolean) as Array<{
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
        const fileNameLower = String(entry.fileName ?? "").toLowerCase();
        const matchedRule = normalizedRules.find((rule) =>
          rule.patternTokens.some((token) => fileNameLower.includes(token)),
        );
        if (!matchedRule) continue;
        const key = matchedRule.templateName || stableStringify(matchedRule.templateConfig);
        if (!queueByTemplateName.has(key)) queueByTemplateName.set(key, []);
        queueByTemplateName.get(key)?.push(entry);
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

      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }

      const worker = new Worker(
        new URL("../workers/deviceAnalysis.worker.ts", import.meta.url),
        { type: "module" },
      );
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
      let currentGroupIndex = 0;
      let currentGroupQueue = [...groupedPrepared[0].queue];

      const processNext = () => {
        while (currentGroupIndex < groupedPrepared.length) {
          if (currentGroupQueue.length > 0) break;
          currentGroupIndex += 1;
          if (currentGroupIndex < groupedPrepared.length) {
            currentGroupQueue = [...groupedPrepared[currentGroupIndex].queue];
          }
        }

        if (currentGroupIndex >= groupedPrepared.length) {
          setProcessingStatus((prev) => ({ ...prev, state: "done" }));
          if (hasAnyProcessedResult) setActivePage("analysis");
          worker.terminate();
          if (processingWorkerRef.current === worker) {
            processingWorkerRef.current = null;
          }
          return;
        }

        const nextEntry = currentGroupQueue.shift();
        if (!nextEntry) {
          processNext();
          return;
        }
        processingQueueRef.current = processingQueueRef.current.filter(
          (entry) => entry.fileId !== nextEntry.fileId,
        );
        if (removedQueuedFileIdsRef.current.has(nextEntry.fileId)) {
          processNext();
          return;
        }
        const group = groupedPrepared[currentGroupIndex];
        worker.postMessage({
          type: "processFile",
          payload: {
            config: group.extractionConfig,
            file: nextEntry.file,
            fileId: nextEntry.fileId,
            fileName: nextEntry.fileName,
            jobId,
            maxPoints: 600,
          },
        });
      };

      worker.onmessage = (event: MessageEvent<{ payload?: any; type?: string }>) => {
        const { type, payload } = event.data ?? {};
        if (payload?.jobId !== jobId) return;

        if (type === "processResult") {
          const nextProcessed = payload?.processed;
          const nextFileId = nextProcessed?.fileId;
          if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
            processedCount += 1;
            setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));
            processNext();
            return;
          }
          hasAnyProcessedResult = true;
          setProcessedData((prev) => [...prev, nextProcessed as ProcessedEntry]);
          processedCount += 1;
          setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));
          processNext();
          return;
        }

        if (type === "workerError") {
          const rawMessage =
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message
              : "Unknown error";
          const legacyParsed = parseLegacyExtractionError(rawMessage) as {
            fileName?: string;
            messageKey?: string | null;
            messageParams?: Record<string, unknown> | null;
          } | null;
          onExtractionError?.({
            fileName:
              payload?.fileName ?? legacyParsed?.fileName ?? "Unknown file",
            message: rawMessage,
            messageKey:
              (typeof payload?.messageKey === "string" && payload.messageKey) ||
              legacyParsed?.messageKey ||
              null,
            messageParams:
              (payload?.messageParams &&
                typeof payload.messageParams === "object" &&
                (payload.messageParams as Record<string, unknown>)) ||
              legacyParsed?.messageParams ||
              null,
          });
          processedCount += 1;
          setProcessingStatus((prev) => ({ ...prev, processed: processedCount }));

          if (processingStopOnErrorRef.current) {
            setProcessingStatus((prev) => ({ ...prev, state: "error" }));
            worker.terminate();
            if (processingWorkerRef.current === worker) {
              processingWorkerRef.current = null;
            }
            return;
          }
          processNext();
        }
      };

      processNext();
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
      onExtractionError,
      prepareExtractionRun,
      processedData,
      processingStatus.state,
      rawData,
      rawDataByIdRef,
      setActivePage,
      setProcessedData,
      t,
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
