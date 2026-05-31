import type { MutableRef } from "src/cs/base/common/ref";
import type { StateSetter } from "src/cs/workbench/contrib/session/analysis-session-context";
import { prepareExtraction } from "src/cs/workbench/contrib/data/extractionValidation";
import {
  parseOlderExtractionError,
  stableStringify,
} from "src/cs/workbench/common/deviceAnalysis/utils";
import {
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  splitFileNameMatchInput,
} from "src/cs/workbench/common/deviceAnalysis/fileNameFieldMatching";
import type {
  ProcessedEntry,
  ProcessingStatus,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "src/cs/workbench/common/deviceAnalysis/translateTypes";
import {
  type ProcessingQueueItem,
} from "./asyncProcessing";
import { BrowserDataProcessingService } from "src/cs/workbench/contrib/data/browser/dataProcessingService";
import { importService } from "src/cs/workbench/services/import/browser/importService";

// Orchestrates validation and queue building for the device-analysis apply flow.
// The async execution details live in asyncProcessing.ts so this hook stays focused on inputs.

const useCallback = <T extends (...args: any[]) => any>(callback: T, _deps?: unknown[]): T => callback;
const useEffect = (effect: () => void | (() => void), _deps?: unknown[]): void => {
  effect();
};
const useMemo = <T,>(factory: () => T, _deps?: unknown[]): T => factory();
const useRef = <T,>(current: T): MutableRef<T> => ({ current });
const useState = <T,>(initial: T | (() => T)): [T, StateSetter<T>] => {
  let value = typeof initial === "function" ? (initial as () => T)() : initial;
  const setValue: StateSetter<T> = (next) => {
    value = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
  };
  return [value, setValue];
};

type ExtractionErrorEntry = {
  fileName?: string;
  message: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
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
  rawDataByIdRef: MutableRef<Map<string, unknown>>;
  onExtractionError?: (error: ExtractionErrorEntry) => void;
  setActivePage: (page: string) => void;
  setProcessedData: StateSetter<ProcessedEntry[]>;
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
  const dataProcessingService = useMemo(() => new BrowserDataProcessingService(), []);
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

    dataProcessingService.terminateProcessingWorker(processingWorkerRef);

    setProcessingStatus({
      state: "idle",
      processed: 0,
      total: 0,
    });
  }, [dataProcessingService]);

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
      dataProcessingService.terminateProcessingWorker(processingWorkerRef);
    };
  }, [dataProcessingService]);

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
      const inputPath =
        typeof entry.normalizedCsvPath === "string" &&
        entry.normalizedCsvPath.trim()
          ? entry.normalizedCsvPath.trim()
          : typeof entry.sourcePath === "string" &&
              entry.sourcePath.trim().toLowerCase().endsWith(".csv")
            ? entry.sourcePath.trim()
            : null;
      if (!inputPath) return null;

      if (!importService.canProcessFile()) return null;

      try {
        let finalExtractionConfig = extractionConfig;
        if (messageType === "processFileAuto") {
          const response = await importService.processFile({
            auto: true,
            curveFilterField: entry.curveFilterField ?? null,
            curveFilterKey: entry.curveFilterKey ?? null,
            fileId: entry.fileId,
            fileName: entry.fileName ?? "",
            maxPoints: 600,
            path: inputPath,
          });
          if (!response?.ok || !response?.result) return null;
          return response.result as ProcessedEntry;
        } else if (messageType !== "processFile") {
          return null;
        }

        const response = await importService.processFile({
          config: finalExtractionConfig,
          curveFilterField: entry.curveFilterField ?? null,
          curveFilterKey: entry.curveFilterKey ?? null,
          fileId: entry.fileId,
          fileName: entry.fileName ?? "",
          maxPoints: 600,
          path: inputPath,
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
      dataProcessingService.startProcessingJob({
        activeFileId,
        extractionConfig,
        messageType,
        onWorkerErrorPayload: (payload) => {
          onExtractionError?.(buildWorkerExtractionError(payload));
        },
        processingJobIdRef,
        processingQueueRef,
        processingStopOnErrorRef,
        processingWorkerRef,
        queue,
        rawDataByIdRef,
        removedQueuedFileIdsRef,
        resetProcessedData,
        setActivePage,
        setProcessedData,
        setProcessingStatus,
        stopOnError,
        tryProcessFileWithRust,
      });
    },
    [
      activeFileId,
      dataProcessingService,
      onExtractionError,
      processingJobIdRef,
      processingQueueRef,
      processingStopOnErrorRef,
      processingWorkerRef,
      rawDataByIdRef,
      removedQueuedFileIdsRef,
      setActivePage,
      setProcessedData,
      setProcessingStatus,
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
      dataProcessingService.startRuleProcessingJob({
        activeFileId,
        finalQueue,
        groupedPrepared,
        incremental,
        onWorkerErrorPayload: (payload) => {
          onExtractionError?.(buildWorkerExtractionError(payload));
        },
        processingJobIdRef,
        processingQueueRef,
        processingStopOnErrorRef,
        processingWorkerRef,
        rawDataByIdRef,
        removedQueuedFileIdsRef,
        setActivePage,
        setProcessedData,
        setProcessingStatus,
        stopOnError: Boolean(config?.stopOnError),
        tryProcessFileWithRust,
      });

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
      dataProcessingService,
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



