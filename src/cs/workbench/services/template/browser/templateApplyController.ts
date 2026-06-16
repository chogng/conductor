/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize, type NLSVars } from "src/cs/nls";
import { Emitter } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { startPerf, summarizeProcessedFile } from "src/cs/workbench/common/perf";
import {
  ISessionService,
  type CommitTemplateOutputInput,
  type CommitTemplateOutputOptions,
} from "src/cs/workbench/services/session/common/session";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import {
  createProcessedFileSessionCommit,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import { prepareExtraction } from "src/cs/workbench/services/template/common/extractionValidation";
import { isAutoTemplateConfig } from "src/cs/workbench/services/template/common/autoTemplate";
import { normalizeExtractionErrorDetails } from "src/cs/workbench/services/template/common/extractionErrors";
import { stableStringify } from "src/cs/workbench/services/template/common/templateStableKey";
import {
  mergeTemplateProcessingAssessment,
} from "src/cs/workbench/services/template/common/templateProcessingAssessment";
import {
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  splitFileNameMatchInput,
} from "src/cs/workbench/services/template/common/fileNameMatching";
import type {
  ProcessedEntry,
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  ProcessingJobOptions,
  ProcessingQueueItem,
  RuleProcessingJobOptions,
  TemplateWorkerRef,
} from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import {
  buildTemplateProcessingPlan,
  type TemplateProcessingSkippedFile,
} from "src/cs/workbench/services/template/browser/templateApplyPlanner";
import {
  ITemplateApplyService,
  ITemplateApplyWorkflowService,
  type TemplateApplyWorkflowInput,
} from "src/cs/workbench/services/template/common/template";
import {
  ITemplateProcessingBackendService,
  type TemplateProcessingBackend,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";

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
  segmentCountCell?: boolean;
  segmentCountPreview?: number;
  segmentsRawUpper?: string;
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
  clearTemplateOutputBeforeRun: boolean;
  stopOnError: boolean;
};

const TEMPLATE_OUTPUT_FLUSH_DELAY_MS = 32;

type TemplateApplyControllerOptions = {
  sessionService: Pick<
    ISessionService,
    | "commitTemplateOutputs"
    | "commitTemplateRun"
    | "getSnapshot"
    | "onDidChangeSession"
  >;
  tableService: Pick<ITableService, "getViewInput">;
  templateProcessingBackendService: TemplateProcessingBackend;
  templateApplyService: ITemplateApplyService<
    ProcessingJobOptions,
    RuleProcessingJobOptions,
    TemplateWorkerRef<Worker | null>,
    Worker | null
  >;
  onExtractionError?: (error: ExtractionErrorEntry) => void;
  showResults: () => void;
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

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createTemplateWorkerRef = <T,>(current: T): TemplateWorkerRef<T> => ({ current });

const isSameProcessingStatus = (
  current: ProcessingStatus,
  next: ProcessingStatus,
): boolean =>
  current.state === next.state &&
  current.processed === next.processed &&
  current.total === next.total;

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

const resolveProcessedFileIds = ({
  processedFileIds,
}: TemplateApplyWorkflowInput): Set<string> => {
  return new Set(
    (Array.isArray(processedFileIds) ? processedFileIds : [])
      .map((fileId) => String(fileId ?? "").trim())
      .filter(Boolean),
  );
};

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
  const segmentCountPreview = Number(meta.segmentCountPreview);
  const fixedGroupSize = Number(meta.groupSize);
  const fixedGroupCount = Number(meta.groups);
  const groupSizeText = meta.segmentCountCell
    ? localize("template.extraction.segmentsFromCell", "segments from {cell}", { cell: meta.segmentsRawUpper || "" })
    : meta.groupSizeCell
      ? localize("template.extraction.pointsFromCell", "points from {cell}", { cell: meta.pointsRawUpper || "" })
      : Number.isInteger(fixedGroupSize) && fixedGroupSize > 0
        ? localize("template.extraction.pointsFixed", "points={points}", { points: fixedGroupSize })
        : localize("template.extraction.pointsFixed", "points={points}", { points: "-" });
  const groupsText =
    meta.segmentCountCell &&
    Number.isInteger(segmentCountPreview) &&
    segmentCountPreview > 0
      ? localize("template.extraction.groupsSuffix", ", {groups} group(s)", { groups: segmentCountPreview })
      : meta.groupSizeCell &&
    Number.isInteger(groupSizePreview) &&
    groupSizePreview > 0
      ? localize("template.extraction.groupsSuffix", ", {groups} group(s)", {
          groups: Math.max(0, Number(meta.total || 0) / groupSizePreview),
        })
      : !meta.groupSizeCell &&
          Number.isInteger(fixedGroupCount) &&
          fixedGroupCount > 0
        ? localize("template.extraction.groupsSuffix", ", {groups} group(s)", { groups: fixedGroupCount })
        : "";
  const warningText = warnings.length
    ? localize("template.extraction.warningsBlock", "\n\nWarnings:\n- {warnings}", { warnings: warnings.join("\n- ") })
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

const buildSkippedAssessmentWarnings = (
  skippedFiles: readonly TemplateProcessingSkippedFile[],
): string[] => {
  if (!skippedFiles.length) {
    return [];
  }

  return [
    localize("template.apply.skippedAssessmentFiles", "Skipped {count} file(s) that need template review or assessment.", {
      count: skippedFiles.length,
    }),
  ];
};

const buildNoProcessableFilesFeedback = (
  skippedFiles: readonly TemplateProcessingSkippedFile[],
): { ok: false; message: string; type: "warning" } => ({
  message: skippedFiles.length
    ? localize("template.apply.noProcessableFilesWithSkipped", "No processable files to extract. {count} file(s) need template review or assessment.", {
        count: skippedFiles.length,
      })
    : localize("template.apply.noProcessableFiles", "No processable files to extract."),
  ok: false,
  type: "warning",
});

const buildWorkerExtractionError = (payload: unknown): ExtractionErrorEntry => {
  const details = normalizeExtractionErrorDetails(payload);
  const message = getWorkerExtractionErrorMessage(details);

  return {
    fileName:
      details.fileName || localize("files.import.unknownFile", "Unknown file"),
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
    case "template.extraction.pointsCellPositiveInt":
      return localize(
        "template.extraction.pointsCellPositiveInt",
        "Points cell {cell} must contain a positive integer.",
        vars,
      );
    case "template.extraction.pointsCellTooLarge":
      return localize(
        "template.extraction.pointsCellTooLarge",
        "Points from {cell} ({points}) cannot be larger than the X range length ({total}).",
        vars,
      );
    case "template.extraction.xNotDivisibleByPointsFromCell":
      return localize(
        "template.extraction.xNotDivisibleByPointsFromCell",
        "X range has {total} points, which is not divisible by points={points} (from {cell}).",
        vars,
      );
    case "template.extraction.xNotDivisibleByPoints":
      return localize(
        "template.extraction.xNotDivisibleByPoints",
        "X range has {total} points, which is not divisible by points={points}.",
        vars,
      );
    case "template.extraction.curveTypeUndeterminedFromVarHints":
      return localize(
        "template.extraction.curveTypeUndeterminedFromVarHints",
        "Unable to determine curve type from Var1/Var2 or nearby headers. Please check the template, or use file-name keywords.",
      );
    default:
      return localize("template.extraction.workerFailed", "Extraction worker failed.");
  }
};

export class TemplateApplyController {
  private readonly onDidChangeProcessingStatusEmitter = new Emitter<ProcessingStatus>();
  public readonly onDidChangeProcessingStatus = this.onDidChangeProcessingStatusEmitter.event;

  private readonly processingWorkerRef = createTemplateWorkerRef<Worker | null>(null);
  private readonly processingJobIdRef = createTemplateWorkerRef(0);
  private readonly processingQueueRef = createTemplateWorkerRef<ProcessingQueueItem[]>([]);
  private readonly processingStopOnErrorRef = createTemplateWorkerRef(false);
  private readonly removedQueuedFileIdsRef = createTemplateWorkerRef<Set<string>>(new Set());
  private readonly lastAppliedTemplateConfigFingerprintRef = createTemplateWorkerRef<string | null>(null);
  private readonly sessionChangeDisposable: IDisposable;
  private pendingTemplateOutputCommits: CommitTemplateOutputInput[] = [];
  private scheduledTemplateOutputFlush:
    | { readonly kind: "animationFrame"; readonly handle: number }
    | { readonly kind: "timeout"; readonly handle: ReturnType<typeof setTimeout> }
    | null = null;
  private input: TemplateApplyWorkflowInput;
  private _processingStatus: ProcessingStatus = {
    state: "idle",
    processed: 0,
    total: 0,
  };

  constructor(
    private readonly options: TemplateApplyControllerOptions,
  ) {
    this.sessionChangeDisposable = options.sessionService.onDidChangeSession(this.handleSessionChanged);
    this.input = {
      processedFileIds: [],
      rawFiles: [],
    };
  }

  public get processingStatus(): ProcessingStatus {
    return this._processingStatus;
  }

  public update(input: TemplateApplyWorkflowInput): void {
    this.input = input;
  }

  public dispose(): void {
    this.sessionChangeDisposable.dispose();
    this.discardTemplateOutputCommits();
    this.options.templateApplyService.terminateProcessingWorker(this.processingWorkerRef);
    this.onDidChangeProcessingStatusEmitter.dispose();
  }

  public readonly resetProcessingWorker = (): void => {
    this.discardTemplateOutputCommits();
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

  private readonly handleSessionChanged = (event: SessionChangeEvent): void => {
    if (event.reason === "sessionCleared") {
      this.resetProcessingWorker();
      return;
    }

    if (event.reason !== "filesRemoved" || !event.fileIds?.length) {
      return;
    }

    for (const fileId of event.fileIds) {
      this.removeQueuedProcessingFile(fileId);
    }
  };

  private readonly commitTemplateOutput = (
    file: ProcessedEntry | null | undefined,
    options?: CommitTemplateOutputOptions,
  ): void => {
    const endPerf = startPerf("templateApplyController.commitTemplateOutput", summarizeProcessedFile(file));
    const commit = createProcessedFileSessionCommit(
      this.options.sessionService.getSnapshot(),
      file,
      options,
    );
    if (!commit) {
      endPerf({ committed: false });
      return;
    }

    this.pendingTemplateOutputCommits.push(commit);
    endPerf({
      committed: true,
      pendingBatchSize: this.pendingTemplateOutputCommits.length,
    });
    this.scheduleTemplateOutputFlush();
  };

  private readonly scheduleTemplateOutputFlush = (): void => {
    if (this.scheduledTemplateOutputFlush) {
      return;
    }

    const flush = (): void => {
      this.scheduledTemplateOutputFlush = null;
      this.flushTemplateOutputCommits();
    };

    this.scheduledTemplateOutputFlush = {
      kind: "timeout",
      handle: setTimeout(flush, TEMPLATE_OUTPUT_FLUSH_DELAY_MS),
    };
  };

  private readonly cancelTemplateOutputFlush = (): void => {
    const scheduled = this.scheduledTemplateOutputFlush;
    if (!scheduled) {
      return;
    }

    this.scheduledTemplateOutputFlush = null;
    if (scheduled.kind === "animationFrame") {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(scheduled.handle);
      }
      return;
    }

    clearTimeout(scheduled.handle);
  };

  private readonly flushTemplateOutputCommits = (): void => {
    this.cancelTemplateOutputFlush();
    const commits = this.pendingTemplateOutputCommits;
    if (!commits.length) {
      return;
    }

    const endPerf = startPerf("templateApplyController.flushTemplateOutputs", {
      batchSize: commits.length,
    });
    this.pendingTemplateOutputCommits = [];
    this.options.sessionService.commitTemplateOutputs(commits);
    endPerf();
  };

  private readonly discardTemplateOutputCommits = (): void => {
    this.cancelTemplateOutputFlush();
    this.pendingTemplateOutputCommits = [];
  };

  private readonly clearTemplateOutput = (): void => {
    this.discardTemplateOutputCommits();
    this.options.sessionService.commitTemplateRun({ kind: "clearTemplateOutput" });
  };

  private readonly hasSourceFile = (fileId: string | null | undefined): boolean => {
    const normalizedFileId = String(fileId ?? "").trim();
    return Boolean(
      normalizedFileId &&
      this.options.sessionService.getSnapshot().filesById[normalizedFileId],
    );
  };

  private readonly createFullApplyBusyFeedback = ():
    | { ok: false; message: string; type: "warning" }
    | null => {
    if (this._processingStatus.state === "processing") {
      return {
        message: localize("template.applyAll.busy", "Extraction is already running."),
        ok: false,
        type: "warning",
      };
    }

    if (this.input.hasPendingSourceFiles) {
      return {
        message: localize("template.applyAll.importing", "Files are still importing. Try again after import finishes."),
        ok: false,
        type: "warning",
      };
    }

    return null;
  };

  private readonly createIncrementalApplyBusyFeedback = ():
    | { ok: false; message: string; type: "warning" }
    | null => {
    if (this._processingStatus.state === "processing") {
      return {
        message: localize("template.applyNewFiles.busy", "Extraction is already running."),
        ok: false,
        type: "warning",
      };
    }

    if (this.input.hasPendingSourceFiles) {
      return {
        message: localize("template.applyNewFiles.importing", "Files are still importing. Try again after import finishes."),
        ok: false,
        type: "warning",
      };
    }

    return null;
  };

  public readonly handleTemplateApplied = (config: Record<string, unknown>) => {
    const busy = this.createFullApplyBusyFeedback();
    if (busy) {
      return busy;
    }

    const { rawFiles = [] } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        false,
      );
    }

    if (isAutoTemplateConfig(config)) {
      const plan = buildTemplateProcessingPlan(rawFiles);
      if (!plan.queue.length) {
        return buildNoProcessableFilesFeedback(plan.skippedFiles);
      }

      this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      this.startExtractionJob({
        extractionConfig: config,
        messageType: "processFileAuto",
        queue: plan.queue,
        clearTemplateOutputBeforeRun: true,
        stopOnError: Boolean(config?.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: plan.queue.length,
        messageKey: "extract_started",
        meta: {},
        warnings: buildSkippedAssessmentWarnings(plan.skippedFiles),
      });
    }

    const prepared = this.prepareExtractionRun(config);
    if (!prepared.ok) {
      return prepared;
    }

    const plan = buildTemplateProcessingPlan(rawFiles);
    if (!plan.queue.length) {
      return buildNoProcessableFilesFeedback(plan.skippedFiles);
    }

    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.startExtractionJob({
      extractionConfig: prepared.extractionConfig,
      queue: plan.queue,
      clearTemplateOutputBeforeRun: true,
      stopOnError: Boolean(prepared.stopOnError),
    });

    return buildExtractionStartFeedback({
      count: plan.queue.length,
      messageKey: "extract_started",
      meta: prepared.meta,
      warnings: [
        ...prepared.warnings,
        ...buildSkippedAssessmentWarnings(plan.skippedFiles),
      ],
    });
  };

  public readonly handleTemplateAppliedIncremental = (config: Record<string, unknown>) => {
    const busy = this.createIncrementalApplyBusyFeedback();
    if (busy) {
      return busy;
    }

    const { rawFiles = [] } = this.input;

    if (Array.isArray((config as RuleBasedExtractionConfig)?.fileNameTemplateRules)) {
      return this.handleRuleBasedTemplateApplied(
        config as RuleBasedExtractionConfig,
        true,
      );
    }

    if (isAutoTemplateConfig(config)) {
      if (this._processingStatus.state === "processing") {
        return {
          message: localize("template.applyNewFiles.busy", "Extraction is already running."),
          ok: false,
          type: "warning" as const,
        };
      }

      const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
      if (!lastFingerprint) {
        return {
          message: localize("template.applyNewFiles.requiresFullApply", "Apply to All first."),
          ok: false,
          type: "warning" as const,
        };
      }

      if (stableStringify(config) !== lastFingerprint) {
        return {
          message: localize("template.applyNewFiles.requiresSameConfig", "Template changed. Please Apply to All again."),
          ok: false,
          type: "warning" as const,
        };
      }

      const processedIds = resolveProcessedFileIds(this.input);
      const plan = buildTemplateProcessingPlan(rawFiles, processedIds);
      if (!plan.queue.length) {
        return plan.skippedFiles.length
          ? buildNoProcessableFilesFeedback(plan.skippedFiles)
          : {
              message: localize("template.applyNewFiles.noNewFiles", "No new files to extract."),
              ok: false,
              type: "warning" as const,
            };
      }

      this.startExtractionJob({
        extractionConfig: config,
        messageType: "processFileAuto",
        queue: plan.queue,
        clearTemplateOutputBeforeRun: false,
        stopOnError: Boolean(config?.stopOnError),
      });

      return buildExtractionStartFeedback({
        count: plan.queue.length,
        messageKey: "apply_to_new_files_started",
        meta: {},
        warnings: buildSkippedAssessmentWarnings(plan.skippedFiles),
      });
    }

    if (this._processingStatus.state === "processing") {
      return {
        message: localize("template.applyNewFiles.busy", "Extraction is already running."),
        ok: false,
        type: "warning" as const,
      };
    }

    const lastFingerprint = this.lastAppliedTemplateConfigFingerprintRef.current;
    if (!lastFingerprint) {
      return {
        message: localize("template.applyNewFiles.requiresFullApply", "Apply to All first."),
        ok: false,
        type: "warning" as const,
      };
    }

    if (stableStringify(config) !== lastFingerprint) {
      return {
        message: localize("template.applyNewFiles.requiresSameConfig", "Template changed. Please Apply to All again."),
        ok: false,
        type: "warning" as const,
      };
    }

    const processedIds = resolveProcessedFileIds(this.input);
    const plan = buildTemplateProcessingPlan(rawFiles, processedIds);
    if (!plan.queue.length) {
      return plan.skippedFiles.length
        ? buildNoProcessableFilesFeedback(plan.skippedFiles)
        : {
            message: localize("template.applyNewFiles.noNewFiles", "No new files to extract."),
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
      queue: plan.queue,
      clearTemplateOutputBeforeRun: false,
      stopOnError: Boolean(prepared.stopOnError),
    });

    return buildExtractionStartFeedback({
      count: plan.queue.length,
      messageKey: "apply_to_new_files_started",
      meta: prepared.meta,
      warnings: [
        ...prepared.warnings,
        ...buildSkippedAssessmentWarnings(plan.skippedFiles),
      ],
    });
  };

  private readonly setProcessingStatus: StateSetter<ProcessingStatus> = (next) => {
    const previous = this._processingStatus;
    const resolved =
      typeof next === "function"
        ? (next as (previous: ProcessingStatus) => ProcessingStatus)(previous)
        : next;
    if (isSameProcessingStatus(previous, resolved)) {
      return;
    }

    this._processingStatus = resolved;
    if (previous.state === "processing" && resolved.state !== "processing") {
      this.flushTemplateOutputCommits();
    }
    this.onDidChangeProcessingStatusEmitter.fire(resolved);
  };

  private readonly prepareExtractionRun = (
    config: Record<string, unknown>,
  ): PreparedExtractionResult => {
    const { rawFiles = [] } = this.input;
    const tableModel = this.options.tableService.getViewInput()?.tableModel ?? null;
    const prepared = prepareExtraction({
      config,
      getPreviewRow: rowIndex => tableModel?.getRow(rowIndex) ?? null,
      previewFile: tableModel?.getState().file ?? null,
      rawData: rawFiles,
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

  private readonly tryProcessFileWithBackend = async ({
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
    if (!inputPath || !this.options.templateProcessingBackendService.canProcessFile()) {
      return null;
    }

    try {
      if (messageType === "processFileAuto") {
        if (!entry.assessment) {
          return null;
        }
        const response = await this.options.templateProcessingBackendService.processFile({
          assessment: entry.assessment ?? null,
          auto: true,
          curveFilterField: entry.curveFilterField ?? null,
          curveFilterKey: entry.curveFilterKey ?? null,
          fileId: entry.fileId,
          fileName: entry.fileName ?? "",
          maxPoints: 600,
          path: inputPath,
        });
        return response?.ok && response.result
          ? mergeTemplateProcessingAssessment(
              response.result as ProcessedEntry,
              entry.assessment,
            )
          : null;
      }

      if (messageType !== "processFile") {
        return null;
      }

      const response = await this.options.templateProcessingBackendService.processFile({
        assessment: entry.assessment ?? null,
        config: extractionConfig,
        curveFilterField: entry.curveFilterField ?? null,
        curveFilterKey: entry.curveFilterKey ?? null,
        fileId: entry.fileId,
        fileName: entry.fileName ?? "",
        maxPoints: 600,
        path: inputPath,
      });
      return response?.ok && response.result
        ? mergeTemplateProcessingAssessment(
            response.result as ProcessedEntry,
            entry.assessment,
          )
        : null;
    } catch {
      return null;
    }
  };

  private readonly startExtractionJob = ({
    extractionConfig,
    messageType = "processFile",
    queue,
    clearTemplateOutputBeforeRun,
    stopOnError,
  }: StartExtractionJobOptions): void => {
    const {
      fileTemplateSelectionsByFileId,
      templateSelection,
    } = this.input;
    this.options.templateApplyService.startProcessingJob({
      templateProcessingBackendService: this.options.templateProcessingBackendService,
      extractionConfig,
      fileTemplateSelectionsByFileId,
      messageType,
      onWorkerErrorPayload: (payload) => {
        this.options.onExtractionError?.(buildWorkerExtractionError(payload));
      },
      processingJobIdRef: this.processingJobIdRef,
      processingQueueRef: this.processingQueueRef,
      processingStopOnErrorRef: this.processingStopOnErrorRef,
      processingWorkerRef: this.processingWorkerRef,
      queue,
      hasSourceFile: this.hasSourceFile,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      clearTemplateOutputBeforeRun,
      showResults: this.options.showResults,
      templateSelection,
      commitTemplateOutput: this.commitTemplateOutput,
      clearTemplateOutput: this.clearTemplateOutput,
      setProcessingStatus: this.setProcessingStatus,
      stopOnError,
      tryProcessFileWithBackend: this.tryProcessFileWithBackend,
    });
  };

  private readonly handleRuleBasedTemplateApplied = (
    config: RuleBasedExtractionConfig,
    incremental: boolean,
  ): ExtractionFeedback | { ok: false; message: string; type: "warning" } => {
    const {
      fileTemplateSelectionsByFileId,
      rawFiles = [],
      templateSelection,
    } = this.input;

    if (incremental && this._processingStatus.state === "processing") {
      return {
        message: localize("template.applyNewFiles.busy", "Extraction is already running."),
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
        message: localize("template.fields.name", "Template name"),
        ok: false,
        type: "warning",
      };
    }

    const processedIds = incremental ? resolveProcessedFileIds(this.input) : null;
    const plan = buildTemplateProcessingPlan(rawFiles, processedIds);
    const candidates = plan.queue;
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
      return plan.skippedFiles.length
        ? buildNoProcessableFilesFeedback(plan.skippedFiles)
        : {
            message: localize("template.applyNewFiles.noNewFiles", "No new files to extract."),
            ok: false,
            type: "warning",
          };
    }

    const finalQueue: ProcessingQueueItem[] = [];
    const groupedPrepared: Array<{
      extractionConfig: unknown;
      queue: ProcessingQueueItem[];
    }> = [];
    const warnings: string[] = buildSkippedAssessmentWarnings(plan.skippedFiles);

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
        message: localize("template.applyNewFiles.noNewFiles", "No new files to extract."),
        ok: false,
        type: "warning",
      };
    }

    this.lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    this.options.templateApplyService.startRuleProcessingJob({
      templateProcessingBackendService: this.options.templateProcessingBackendService,
      finalQueue,
      fileTemplateSelectionsByFileId,
      groupedPrepared,
      incremental,
      onWorkerErrorPayload: (payload) => {
        this.options.onExtractionError?.(buildWorkerExtractionError(payload));
      },
      processingJobIdRef: this.processingJobIdRef,
      processingQueueRef: this.processingQueueRef,
      processingStopOnErrorRef: this.processingStopOnErrorRef,
      processingWorkerRef: this.processingWorkerRef,
      hasSourceFile: this.hasSourceFile,
      removedQueuedFileIdsRef: this.removedQueuedFileIdsRef,
      showResults: this.options.showResults,
      templateSelection,
      commitTemplateOutput: this.commitTemplateOutput,
      clearTemplateOutput: this.clearTemplateOutput,
      setProcessingStatus: this.setProcessingStatus,
      stopOnError: Boolean(config?.stopOnError),
      tryProcessFileWithBackend: this.tryProcessFileWithBackend,
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

export class BrowserTemplateApplyWorkflowService
  extends TemplateApplyController
  implements ITemplateApplyWorkflowService {
  public declare readonly _serviceBrand: undefined;

  constructor(
    @ISessionService sessionService: ISessionService,
    @ITableService tableService: ITableService,
    @ITemplateProcessingBackendService templateProcessingBackendService: ITemplateProcessingBackendService,
    @ITemplateApplyService templateApplyService: ITemplateApplyService<
      ProcessingJobOptions,
      RuleProcessingJobOptions,
      TemplateWorkerRef<Worker | null>,
      Worker | null
    >,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
  ) {
    super({
      sessionService,
      tableService,
      templateApplyService,
      templateProcessingBackendService,
      onExtractionError: () => undefined,
      showResults: () => layoutService.navigateToView("chart"),
    });
  }

  public applyTemplate(config: Record<string, unknown>): unknown {
    return this.handleTemplateApplied(config);
  }

  public applyTemplateIncremental(config: Record<string, unknown>): unknown {
    return this.handleTemplateAppliedIncremental(config);
  }
}

registerSingleton(
  ITemplateApplyWorkflowService,
  BrowserTemplateApplyWorkflowService,
  InstantiationType.Delayed,
);
