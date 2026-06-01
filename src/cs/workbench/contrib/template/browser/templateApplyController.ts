import type { MutableState, StateSetter } from "src/cs/workbench/contrib/session/analysis-session-context";
import { prepareExtraction } from "src/cs/workbench/contrib/template/common/extractionValidation";
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
import type { ProcessingQueueItem } from "src/cs/workbench/contrib/template/browser/templateApplyProcessing";
import { TemplateApplyService } from "src/cs/workbench/contrib/template/browser/templateApplyService";
import { importService } from "src/cs/workbench/services/import/browser/importService";

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

export type TemplateApplyControllerInput = {
  activeFileId?: unknown;
  getPreviewRow: (rowIndex: number) => unknown;
  previewFile: unknown;
  processedData?: ProcessedEntry[];
  rawData?: RawDataEntry[];
  rawDataByIdRef: MutableState<Map<string, unknown>>;
  t: TranslateFn;
};

type TemplateApplyControllerOptions = {
  onExtractionError?: (error: ExtractionErrorEntry) => void;
  setActivePage: (page: string) => void;
  setProcessedData: StateSetter<ProcessedEntry[]>;
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

const createMutableState = <T,>(current: T): MutableState<T> => ({ current });

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

const buildWorkerExtractionError = (payload: unknown): ExtractionErrorEntry => {
  const rawPayload = payload as Record<string, unknown> | null;
  const rawMessage =
    typeof rawPayload?.message === "string" && rawPayload.message.trim()
      ? rawPayload.message
      : "Unknown error";
  const fallbackParsed = parseOlderExtractionError(rawMessage) as {
    fileName?: string;
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
  } | null;

  return {
    fileName:
      (typeof rawPayload?.fileName === "string" && rawPayload.fileName) ||
      fallbackParsed?.fileName ||
      "Unknown file",
    message: rawMessage,
    messageKey:
      (typeof rawPayload?.messageKey === "string" && rawPayload.messageKey) ||
      fallbackParsed?.messageKey ||
      null,
    messageParams:
      (rawPayload?.messageParams &&
        typeof rawPayload.messageParams === "object" &&
        (rawPayload.messageParams as Record<string, unknown>)) ||
      fallbackParsed?.messageParams ||
      null,
  };
};

export class TemplateApplyController {
  private readonly templateApplyService = new TemplateApplyService();
  private readonly processingWorkerRef = createMutableState<Worker | null>(null);
  private readonly processingJobIdRef = createMutableState(0);
  private readonly processingQueueRef = createMutableState<ProcessingQueueItem[]>([]);
  private readonly processingStopOnErrorRef = createMutableState(false);
  private readonly removedQueuedFileIdsRef = createMutableState<Set<string>>(new Set());
  private readonly lastAppliedTemplateConfigFingerprintRef = createMutableState<string | null>(null);
  private input: TemplateApplyControllerInput;
  private _processingStatus: ProcessingStatus = {
    state: "idle",
    processed: 0,
    total: 0,
  };

  constructor(
    private readonly options: TemplateApplyControllerOptions,
  ) {
    this.input = {
      getPreviewRow: () => null,
      previewFile: null,
      processedData: [],
      rawData: [],
      rawDataByIdRef: createMutableState(new Map<string, unknown>()),
      t: ((key: string) => key) as TranslateFn,
    };
  }

  public get processingStatus(): ProcessingStatus {
    return this._processingStatus;
  }

  public update(input: TemplateApplyControllerInput): void {
    this.input = input;
  }

  public dispose(): void {
    this.templateApplyService.terminateProcessingWorker(this.processingWorkerRef);
  }

  public readonly resetProcessingWorker = (): void => {
    this.processingJobIdRef.current += 1;
    this.processingQueueRef.current = [];
    this.processingStopOnErrorRef.current = false;
    this.removedQueuedFileIdsRef.current = new Set();
    this.templateApplyService.terminateProcessingWorker(this.processingWorkerRef);
    this.setProcessingStatus({
      state: "idle",
      processed: 0,
      total: 0,
    });
  };

  public readonly removeQueuedProcessingFile = (fileId: string): void => {
    if (this._processingStatus.state !== "processing") {
      return;
    }

    const before = this.processingQueueRef.current.length;
    this.processingQueueRef.current = this.processingQueueRef.current.filter(
      (entry) => entry?.fileId !== fileId,
    );

    const removedCount = before - this.processingQueueRef.current.length;
    if (removedCount <= 0) {
      return;
    }

    this.removedQueuedFileIdsRef.current.add(fileId);
    this.setProcessingStatus((previous) => ({
      ...previous,
      total: Math.max(previous.processed, previous.total - removedCount),
    }));
  };

  public readonly handleTemplateApplied = (config: Record<string, unknown>) => {
    const { rawData = [], t } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        false,
      );
    }

    if (Boolean(config?.autoExtractionMode)) {
      const queue = buildProcessingQueue(rawData);
      this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      this.startExtractionJob({
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

    const prepared = this.prepareExtractionRun(config);
    if (!prepared.ok) {
      return prepared;
    }

    const queue = buildProcessingQueue(rawData);
    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.startExtractionJob({
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
  };

  public readonly handleTemplateAppliedIncremental = (config: Record<string, unknown>) => {
    const { processedData = [], rawData = [], t } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        true,
      );
    }

    if (Boolean(config?.autoExtractionMode)) {
      if (this._processingStatus.state === "processing") {
        return {
          message: t("da_apply_to_new_files_busy"),
          ok: false,
          type: "warning" as const,
        };
      }

      const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
      if (!lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_requires_full_apply"),
          ok: false,
          type: "warning" as const,
        };
      }

      if (stableStringify(config) !== lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_requires_same_config"),
          ok: false,
          type: "warning" as const,
        };
      }

      const processedIds = buildProcessedFileIds(processedData);
      const queue = buildProcessingQueue(rawData, processedIds);
      if (!queue.length) {
        return {
          message: t("da_apply_to_new_files_no_new"),
          ok: false,
          type: "warning" as const,
        };
      }

      this.startExtractionJob({
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

    if (this._processingStatus.state === "processing") {
      return {
        message: t("da_apply_to_new_files_busy"),
        ok: false,
        type: "warning" as const,
      };
    }

    const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
    if (!lastFingerprint) {
      return {
        message: t("da_apply_to_new_files_requires_full_apply"),
        ok: false,
        type: "warning" as const,
      };
    }

    if (stableStringify(config) !== lastFingerprint) {
      return {
        message: t("da_apply_to_new_files_requires_same_config"),
        ok: false,
        type: "warning" as const,
      };
    }

    const processedIds = buildProcessedFileIds(processedData);
    const queue = buildProcessingQueue(rawData, processedIds);
    if (!queue.length) {
      return {
        message: t("da_apply_to_new_files_no_new"),
        ok: false,
        type: "warning" as const,
      };
    }

    const prepared = this.prepareExtractionRun(config);
    if (!prepared.ok) {
      return prepared;
    }

    this.startExtractionJob({
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
  };

  private readonly setProcessingStatus: StateSetter<ProcessingStatus> = (next) => {
    this._processingStatus =
      typeof next === "function"
        ? (next as (previous: ProcessingStatus) => ProcessingStatus)(this._processingStatus)
        : next;
  };

  private readonly prepareExtractionRun = (
    config: Record<string, unknown>,
  ): PreparedExtractionResult => {
    const { getPreviewRow, previewFile, rawData = [], t } = this.input;
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

    if (!prepared.ok) {
      return prepared;
    }

    return {
      extractionConfig: prepared.extractionConfig,
      meta: prepared.meta ?? {},
      ok: true,
      stopOnError: Boolean(config?.stopOnError),
      warnings: Array.isArray(prepared.warnings) ? prepared.warnings : [],
    };
  };

  private readonly tryProcessFileWithRust = async ({
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
    if (!inputPath || !importService.canProcessFile()) {
      return null;
    }

    try {
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
        return response?.ok && response.result
          ? (response.result as ProcessedEntry)
          : null;
      }

      if (messageType !== "processFile") {
        return null;
      }

      const response = await importService.processFile({
        config: extractionConfig,
        curveFilterField: entry.curveFilterField ?? null,
        curveFilterKey: entry.curveFilterKey ?? null,
        fileId: entry.fileId,
        fileName: entry.fileName ?? "",
        maxPoints: 600,
        path: inputPath,
      });
      return response?.ok && response.result
        ? (response.result as ProcessedEntry)
        : null;
    } catch {
      return null;
    }
  };

  private readonly startExtractionJob = ({
    extractionConfig,
    messageType = "processFile",
    queue,
    resetProcessedData,
    stopOnError,
  }: StartExtractionJobOptions): void => {
    const { activeFileId, rawDataByIdRef } = this.input;
    this.templateApplyService.startProcessingJob({
      activeFileId,
      extractionConfig,
      messageType,
      onWorkerErrorPayload: (payload) => {
        this.options.onExtractionError?.(buildWorkerExtractionError(payload));
      },
      processingJobIdRef: this.processingJobIdRef,
      processingQueueRef: this.processingQueueRef,
      processingStopOnErrorRef: this.processingStopOnErrorRef,
      processingWorkerRef: this.processingWorkerRef,
      queue,
      rawDataByIdRef,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      resetProcessedData,
      setActivePage: this.options.setActivePage,
      setProcessedData: this.options.setProcessedData,
      setProcessingStatus: this.setProcessingStatus,
      stopOnError,
      tryProcessFileWithRust: this.tryProcessFileWithRust,
    });
  };

  private readonly handleRuleBasedTemplateApplied = (
    config: RuleBasedExtractionConfig,
    incremental: boolean,
  ): ExtractionFeedback | { ok: false; message: string; type: "warning" } => {
    const {
      activeFileId,
      processedData = [],
      rawData = [],
      rawDataByIdRef,
      t,
    } = this.input;

    if (incremental && this._processingStatus.state === "processing") {
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
        const patternTokens = splitFileNameMatchInput(rule?.pattern, caseSensitive);
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
      if (!queueByTemplateName.has(key)) {
        queueByTemplateName.set(key, []);
      }
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
      const prepared = this.prepareExtractionRun({
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

    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.templateApplyService.startRuleProcessingJob({
      activeFileId,
      finalQueue,
      groupedPrepared,
      incremental,
      onWorkerErrorPayload: (payload) => {
        this.options.onExtractionError?.(buildWorkerExtractionError(payload));
      },
      processingJobIdRef: this.processingJobIdRef,
      processingQueueRef: this.processingQueueRef,
      processingStopOnErrorRef: this.processingStopOnErrorRef,
      processingWorkerRef: this.processingWorkerRef,
      rawDataByIdRef,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      setActivePage: this.options.setActivePage,
      setProcessedData: this.options.setProcessedData,
      setProcessingStatus: this.setProcessingStatus,
      stopOnError: Boolean(config?.stopOnError),
      tryProcessFileWithRust: this.tryProcessFileWithRust,
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
  };
}
