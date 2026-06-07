import { localize, type NLSVars } from "src/cs/nls";
import type {
  MutableState,
  StateSetter,
} from "src/cs/workbench/services/session/common/session";
import { prepareExtraction } from "src/cs/workbench/contrib/template/common/extractionValidation";
import { isAutoTemplateConfig } from "src/cs/workbench/contrib/template/common/autoTemplate";
import { normalizeExtractionErrorDetails } from "src/cs/workbench/contrib/template/common/extractionErrors";
import { stableStringify } from "src/cs/workbench/contrib/template/common/templateStableKey";
import {
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  splitFileNameMatchInput,
} from "src/cs/workbench/contrib/template/common/fileNameMatching";
import type {
  AnalysisResultsByFileId,
  CleanedEntry,
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  ProcessingJobOptions,
  ProcessingQueueItem,
  RuleProcessingJobOptions,
} from "src/cs/workbench/contrib/template/browser/templateApplyProcessing";
import type { ITemplateApplyService } from "src/cs/workbench/contrib/template/common/template";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";

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
  resetCleanedData: boolean;
  stopOnError: boolean;
};

export type TemplateApplyControllerInput = {
  activeFileId?: unknown;
  getTableRow: (rowIndex: number) => unknown;
  previewFile: unknown;
  cleanedData?: CleanedEntry[];
  sourceFiles?: SessionFile[];
  hasSourceFile: (fileId: string | null | undefined) => boolean;
};

type TemplateApplyControllerOptions = {
  analysisFileService: IAnalysisFileService;
  templateApplyService: ITemplateApplyService<
    ProcessingJobOptions,
    RuleProcessingJobOptions,
    MutableState<Worker | null>,
    Worker | null
  >;
  batchSessionUpdate?: (callback: () => void) => void;
  onExtractionError?: (error: ExtractionErrorEntry) => void;
  showResults: () => void;
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
  setCleanedData: StateSetter<CleanedEntry[]>;
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
  sourceFiles: SessionFile[],
  processedIds: Set<string> | null = null,
): ProcessingQueueItem[] => {
  const queue: ProcessingQueueItem[] = [];
  const queuedIds = new Set();

  for (const entry of Array.isArray(sourceFiles) ? sourceFiles : []) {
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

const buildCleanedFileIds = (cleanedData: CleanedEntry[]): Set<string> =>
  new Set(
    (Array.isArray(cleanedData) ? cleanedData : [])
      .map((entry) => entry?.fileId)
      .filter((fileId): fileId is string => Boolean(fileId)),
  );

const buildExtractionStartFeedback = ({
  count,
  messageKey,
  meta = {},
  warnings = [],
}: {
  count: number;
  messageKey: string;
  meta?: ExtractionMeta;
  warnings?: string[];
}): ExtractionFeedback => {
  const groupSizePreview = Number(meta.groupSizePreview);
  const fixedGroupSize = Number(meta.groupSize);
  const fixedGroupCount = Number(meta.groups);
  const groupSizeText = meta.groupSizeCell
    ? localize("extract_points_from_cell", "points from {cell}", { cell: meta.pointsRawUpper || "" })
    : Number.isInteger(fixedGroupSize) && fixedGroupSize > 0
      ? localize("extract_points_fixed", "points={points}", { points: fixedGroupSize })
      : localize("extract_points_fixed", "points={points}", { points: "-" });
  const groupsText =
    meta.groupSizeCell &&
    Number.isInteger(groupSizePreview) &&
    groupSizePreview > 0
      ? localize("extract_groups_suffix", ", {groups} group(s)", {
          groups: Math.max(0, Number(meta.total || 0) / groupSizePreview),
        })
      : !meta.groupSizeCell &&
          Number.isInteger(fixedGroupCount) &&
          fixedGroupCount > 0
        ? localize("extract_groups_suffix", ", {groups} group(s)", { groups: fixedGroupCount })
        : "";
  const warningText = warnings.length
    ? localize("extract_warnings_block", "\n\nWarnings:\n- {warnings}", { warnings: warnings.join("\n- ") })
    : "";

  return {
    message: localize(messageKey, messageKey, {
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
  const details = normalizeExtractionErrorDetails(payload);
  const message = getWorkerExtractionErrorMessage(details);

  return {
    fileName:
      details.fileName || localize("import.unknownFile", "Unknown file"),
    message,
    messageKey: details.messageKey,
    messageParams: details.messageParams,
  };
};

const toNLSVars = (
  value: Record<string, unknown> | null,
): NLSVars | undefined => {
  if (!value) return undefined;

  const vars: NLSVars = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null ||
      entry === undefined
    ) {
      vars[key] = entry;
    }
  }

  return vars;
};

const getWorkerExtractionErrorMessage = ({
  messageKey,
  messageParams,
}: {
  messageKey: string | null;
  messageParams: Record<string, unknown> | null;
}): string => {
  const vars = toNLSVars(messageParams);

  switch (messageKey) {
    case "extractPointsCellPositiveInt":
      return localize(
        "extractPointsCellPositiveInt",
        "Points cell {cell} must contain a positive integer.",
        vars,
      );
    case "extractPointsCellTooLarge":
      return localize(
        "extractPointsCellTooLarge",
        "Points from {cell} ({points}) cannot be larger than the X range length ({total}).",
        vars,
      );
    case "extractXNotDivisibleByPointsFromCell":
      return localize(
        "extractXNotDivisibleByPointsFromCell",
        "X range has {total} points, which is not divisible by points={points} (from {cell}).",
        vars,
      );
    case "extractXNotDivisibleByPoints":
      return localize(
        "extractXNotDivisibleByPoints",
        "X range has {total} points, which is not divisible by points={points}.",
        vars,
      );
    case "extractCurveTypeUndeterminedFromVarHints":
      return localize(
        "extractCurveTypeUndeterminedFromVarHints",
        "Unable to determine curve type from Var1/Var2 or nearby headers. Please check the template, or use file-name keywords.",
      );
    default:
      return localize("extract_worker_failed", "Extraction worker failed.");
  }
};

export class TemplateApplyController {
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
      getTableRow: () => null,
      previewFile: null,
      cleanedData: [],
      sourceFiles: [],
      hasSourceFile: () => false,
    };
  }

  public get processingStatus(): ProcessingStatus {
    return this._processingStatus;
  }

  public update(input: TemplateApplyControllerInput): void {
    this.input = input;
  }

  public dispose(): void {
    this.options.templateApplyService.terminateProcessingWorker(this.processingWorkerRef);
  }

  public readonly resetProcessingWorker = (): void => {
    this.processingJobIdRef.current += 1;
    this.processingQueueRef.current = [];
    this.processingStopOnErrorRef.current = false;
    this.removedQueuedFileIdsRef.current = new Set();
    this.options.templateApplyService.terminateProcessingWorker(this.processingWorkerRef);
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
      (entry: ProcessingQueueItem) => entry.fileId !== fileId,
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
    const { sourceFiles = [] } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        false,
      );
    }

    if (isAutoTemplateConfig(config)) {
      const queue = buildProcessingQueue(sourceFiles);
      this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      this.startExtractionJob({
        extractionConfig: config,
        messageType: "processFileAuto",
        queue,
        resetCleanedData: true,
        stopOnError: Boolean(config?.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: queue.length,
        messageKey: "extract_started",
        meta: {},
        warnings: [],
      });
    }

    const prepared = this.prepareExtractionRun(config);
    if (!prepared.ok) {
      return prepared;
    }

    const queue = buildProcessingQueue(sourceFiles);
    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.startExtractionJob({
      extractionConfig: prepared.extractionConfig,
      queue,
      resetCleanedData: true,
      stopOnError: Boolean(prepared.stopOnError),
    });

    return buildExtractionStartFeedback({
      count: queue.length,
      messageKey: "extract_started",
      meta: prepared.meta,
      warnings: prepared.warnings,
    });
  };

  public readonly handleTemplateAppliedIncremental = (config: Record<string, unknown>) => {
    const { cleanedData = [], sourceFiles = [] } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        true,
      );
    }

    if (isAutoTemplateConfig(config)) {
      if (this._processingStatus.state === "processing") {
        return {
          message: localize("apply_to_new_files_busy", "Extraction is already running."),
          ok: false,
          type: "warning" as const,
        };
      }

      const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
      if (!lastFingerprint) {
        return {
          message: localize("apply_to_new_files_requires_full_apply", "Apply to All first."),
          ok: false,
          type: "warning" as const,
        };
      }

      if (stableStringify(config) !== lastFingerprint) {
        return {
          message: localize("apply_to_new_files_requires_same_config", "Template changed. Please Apply to All again."),
          ok: false,
          type: "warning" as const,
        };
      }

      const processedIds = buildCleanedFileIds(cleanedData);
      const queue = buildProcessingQueue(sourceFiles, processedIds);
      if (!queue.length) {
        return {
          message: localize("apply_to_new_files_no_new", "No new files to extract."),
          ok: false,
          type: "warning" as const,
        };
      }

      this.startExtractionJob({
        extractionConfig: config,
        messageType: "processFileAuto",
        queue,
        resetCleanedData: false,
        stopOnError: Boolean(config?.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: queue.length,
        messageKey: "apply_to_new_files_started",
        meta: {},
        warnings: [],
      });
    }

    if (this._processingStatus.state === "processing") {
      return {
        message: localize("apply_to_new_files_busy", "Extraction is already running."),
        ok: false,
        type: "warning" as const,
      };
    }

    const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
    if (!lastFingerprint) {
      return {
        message: localize("apply_to_new_files_requires_full_apply", "Apply to All first."),
        ok: false,
        type: "warning" as const,
      };
    }

    if (stableStringify(config) !== lastFingerprint) {
      return {
        message: localize("apply_to_new_files_requires_same_config", "Template changed. Please Apply to All again."),
        ok: false,
        type: "warning" as const,
      };
    }

    const processedIds = buildCleanedFileIds(cleanedData);
    const queue = buildProcessingQueue(sourceFiles, processedIds);
    if (!queue.length) {
      return {
        message: localize("apply_to_new_files_no_new", "No new files to extract."),
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
      resetCleanedData: false,
      stopOnError: Boolean(prepared.stopOnError),
    });

    return buildExtractionStartFeedback({
      count: queue.length,
      messageKey: "apply_to_new_files_started",
      meta: prepared.meta,
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
    const { getTableRow, previewFile, sourceFiles = [] } = this.input;
    const prepared = prepareExtraction({
      config,
      getPreviewRow: getTableRow,
      previewFile,
      rawData: sourceFiles,
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
  }): Promise<CleanedEntry | null> => {
    const inputPath =
      typeof entry.normalizedCsvPath === "string" &&
      entry.normalizedCsvPath.trim()
        ? entry.normalizedCsvPath.trim()
        : typeof entry.sourcePath === "string" &&
            entry.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? entry.sourcePath.trim()
          : null;
    if (!inputPath || !this.options.analysisFileService.canProcessFile()) {
      return null;
    }

    try {
      if (messageType === "processFileAuto") {
        const response = await this.options.analysisFileService.processFile({
          auto: true,
          curveFilterField: entry.curveFilterField ?? null,
          curveFilterKey: entry.curveFilterKey ?? null,
          fileId: entry.fileId,
          fileName: entry.fileName ?? "",
          maxPoints: 600,
          path: inputPath,
        });
        return response?.ok && response.result
          ? (response.result as CleanedEntry)
          : null;
      }

      if (messageType !== "processFile") {
        return null;
      }

      const response = await this.options.analysisFileService.processFile({
        config: extractionConfig,
        curveFilterField: entry.curveFilterField ?? null,
        curveFilterKey: entry.curveFilterKey ?? null,
        fileId: entry.fileId,
        fileName: entry.fileName ?? "",
        maxPoints: 600,
        path: inputPath,
      });
      return response?.ok && response.result
        ? (response.result as CleanedEntry)
        : null;
    } catch {
      return null;
    }
  };

  private readonly startExtractionJob = ({
    extractionConfig,
    messageType = "processFile",
    queue,
    resetCleanedData,
    stopOnError,
  }: StartExtractionJobOptions): void => {
    const { activeFileId, hasSourceFile } = this.input;
    this.options.templateApplyService.startProcessingJob({
      analysisFileService: this.options.analysisFileService,
      activeFileId,
      batchSessionUpdate: this.options.batchSessionUpdate,
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
      hasSourceFile,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      resetCleanedData,
      showResults: this.options.showResults,
      setAnalysisResults: this.options.setAnalysisResults,
      setCleanedData: this.options.setCleanedData,
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
      cleanedData = [],
      sourceFiles = [],
      hasSourceFile,
    } = this.input;

    if (incremental && this._processingStatus.state === "processing") {
      return {
        message: localize("apply_to_new_files_busy", "Extraction is already running."),
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
        message: localize("template_name", "Template name"),
        ok: false,
        type: "warning",
      };
    }

    const processedIds = incremental ? buildCleanedFileIds(cleanedData) : null;
    const candidates = buildProcessingQueue(sourceFiles, processedIds);
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
        message: localize("apply_to_new_files_no_new", "No new files to extract."),
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
        message: localize("apply_to_new_files_no_new", "No new files to extract."),
        ok: false,
        type: "warning",
      };
    }

    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.options.templateApplyService.startRuleProcessingJob({
      analysisFileService: this.options.analysisFileService,
      activeFileId,
      batchSessionUpdate: this.options.batchSessionUpdate,
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
      hasSourceFile,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      showResults: this.options.showResults,
      setAnalysisResults: this.options.setAnalysisResults,
      setCleanedData: this.options.setCleanedData,
      setProcessingStatus: this.setProcessingStatus,
      stopOnError: Boolean(config?.stopOnError),
      tryProcessFileWithRust: this.tryProcessFileWithRust,
    });

    return buildExtractionStartFeedback({
      count: finalQueue.length,
      messageKey: incremental
        ? "extract_started_incremental"
        : "extract_started",
      meta: {},
      warnings,
    });
  };
}
