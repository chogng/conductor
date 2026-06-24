/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IRecipeService,
  type IRecipeService as IRecipeServiceType,
} from "src/cs/workbench/services/recipe/common/recipe";
import {
  IReviewService,
  REVIEW_ENGINE_VERSION,
  REVIEW_POLICY_VERSION,
  createReviewEvidenceSignature,
  type IReviewService as IReviewServiceType,
  type ManualTemplateReviewRequest,
  type ManualTemplateReviewResult,
  type RawTableReviewRecord,
  type ReviewDiagnostic,
  type ReviewInput,
  type ReviewQueueSnapshot,
  type ReviewResult,
  type ReviewedTemplateSource,
  type TemplateCandidateSummary,
  type TemplateReview,
} from "src/cs/workbench/services/review/common/review";
import {
  deriveAutomaticTemplateDrafts,
} from "src/cs/workbench/services/template/common/automaticTemplateMaterializer";
import {
  createRawTableFactsFromAssessmentRecord,
} from "src/cs/workbench/services/template/common/tableFacts";
import type { TemplateDraft } from "src/cs/workbench/services/template/common/templateDraft";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
  FileRecord,
  RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  type Template,
  type TemplateAxisBinding,
  type TemplateRowRange,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
  type UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type ReviewTemplateCandidate = TemplateDraft;

export class ReviewService extends Disposable implements IReviewServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeReviewStateEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeReviewState = this.onDidChangeReviewStateEmitter.event;

  private readonly pendingRefsByKey = new Map<string, RawTableRef>();
  private isReviewing = false;

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @IRecipeService private readonly recipeService: IRecipeServiceType,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
  ) {
    super();
    this._register(this.sessionService.onDidChangeSession(event => {
      if (event.reason === "sessionCleared") {
        this.clearQueue();
        return;
      }
      if (event.reason === "filesRemoved" && event.fileIds?.length) {
        this.deleteQueuedRefsForFiles(event.fileIds);
      }
    }));
  }

  public deriveAndReview(input: ReviewInput): ReviewResult {
    const tableFacts = createRawTableFactsFromAssessmentRecord(input.assessment, {
      columnCount: input.columnCount,
      fileName: input.fileName ?? undefined,
      rowCount: input.rowCount,
    });
    const candidates = deriveAutomaticTemplateDrafts({
      tableFacts,
      recipeSnapshot: input.recipeSnapshot,
      userTemplateSnapshot: input.userTemplateSnapshot,
    });
    const reviews = candidates.map(createTemplateReview);
    const readyCandidate = candidates.find(candidate => {
      const review = reviews.find(candidateReview => candidateReview.candidateId === candidate.id);
      return review?.status === "ready";
    });

    return {
      recipeFingerprint: input.recipeSnapshot.fingerprint,
      userTemplateCatalogVersion: input.userTemplateSnapshot.version,
      userTemplateEffectiveFingerprint: input.userTemplateSnapshot.effectiveFingerprint,
      reviewEngineVersion: REVIEW_ENGINE_VERSION,
      reviewPolicyVersion: REVIEW_POLICY_VERSION,
      candidates: candidates.map(createTemplateCandidateSummary),
      reviews,
      decision: createReviewDecision({
        candidates,
        readyCandidate,
        reviews,
      }),
    };
  }

  public enqueueAllCurrentEvidence(): void {
    this.enqueueForEvidence(getRawTableRefsForReviewSnapshot(this.sessionService.getSnapshot()));
  }

  public enqueueForEvidence(refs: readonly RawTableRef[]): void {
    let didChange = false;
    for (const ref of uniqueRawTableRefs(refs)) {
      const normalizedRef = normalizeRawTableRef(ref);
      if (!normalizedRef) {
        continue;
      }
      const key = getRawTableRefKey(normalizedRef);
      if (!this.pendingRefsByKey.has(key)) {
        this.pendingRefsByKey.set(key, normalizedRef);
        didChange = true;
      }
    }

    if (didChange) {
      this.fireReviewStateChange();
    }
    this.drainQueue();
  }

  public getQueueSnapshot(): ReviewQueueSnapshot {
    return {
      rawTables: [...this.pendingRefsByKey.values()],
    };
  }

  public reviewManualTemplate(input: ManualTemplateReviewRequest): ManualTemplateReviewResult {
    const ref = normalizeRawTableRef(input.ref);
    if (!ref) {
      return createInvalidManualReviewResult("review.manual.invalidRef", "Manual review needs a raw table target.");
    }

    const snapshot = this.sessionService.getSnapshot();
    const file = snapshot.filesById[ref.fileId];
    const table = file?.raw.tablesById[ref.rawTableId];
    const assessment = file?.assessmentsByRawTableId?.[ref.rawTableId];
    if (!file || !table || !assessment) {
      return createInvalidManualReviewResult(
        "review.manual.missingEvidence",
        "Manual review needs an imported raw table with Assessment evidence.",
      );
    }

    const resolvedTemplate = this.resolveManualTemplate(input.selection);
    if (resolvedTemplate.kind === "invalid") {
      return createInvalidManualReviewResult(resolvedTemplate.code, resolvedTemplate.message);
    }

    const reviewInput = createManualTemplateReview({
      candidateId: resolvedTemplate.candidateId,
      columnCount: table.columnCount,
      source: resolvedTemplate.source,
      template: resolvedTemplate.template,
      rowCount: table.rowCount,
    });

    if (reviewInput.review.status === "ready") {
      return {
        kind: "ready",
        reviewedTemplate: {
          candidateId: reviewInput.candidateId,
          source: reviewInput.source,
          template: reviewInput.template,
          templateFingerprint: reviewInput.templateFingerprint,
          review: reviewInput.review,
        },
        suggestedActions: [],
      };
    }

    if (reviewInput.review.status === "needsAdjustment") {
      return {
        kind: "needsManualAdjustment",
        review: reviewInput.review,
        diagnostics: reviewInput.review.diagnostics,
        suggestedActions: [{ id: "review.adjustTemplate", label: "Adjust template" }],
      };
    }

    return {
      kind: "invalid",
      review: reviewInput.review,
      diagnostics: reviewInput.review.diagnostics,
      suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
    };
  }

  private drainQueue(): void {
    if (this.isReviewing) {
      return;
    }

    this.isReviewing = true;
    try {
      while (this.pendingRefsByKey.size) {
        const refs = [...this.pendingRefsByKey.values()];
        this.pendingRefsByKey.clear();
        this.fireReviewStateChange();

        const commits: RawTableReviewRecord[] = [];
        const snapshot = this.sessionService.getSnapshot();
        const recipeSnapshot = this.recipeService.getSnapshot();
        const userTemplateSnapshot = this.userTemplateService.getSnapshot();
        for (const ref of refs) {
          const commit = this.createReviewCommit(
            ref,
            snapshot.filesById[ref.fileId],
            recipeSnapshot,
            userTemplateSnapshot,
          );
          if (commit) {
            commits.push(commit);
          }
        }

        if (commits.length) {
          this.sessionService.commitRawTableReviews(commits);
        }
      }
    } finally {
      this.isReviewing = false;
    }
  }

  private createReviewCommit(
    ref: RawTableRef,
    file: FileRecord | undefined,
    recipeSnapshot: ReturnType<IRecipeServiceType["getSnapshot"]>,
    userTemplateSnapshot: UserTemplateSnapshot,
  ): RawTableReviewRecord | null {
    const assessment = file?.assessmentsByRawTableId?.[ref.rawTableId];
    const table = file?.raw.tablesById[ref.rawTableId];
    if (!file || !assessment || !table) {
      return null;
    }

    const result = this.deriveAndReview({
      assessment,
      columnCount: table.columnCount,
      fileName: file.name,
      recipeSnapshot,
      rowCount: table.rowCount,
      userTemplateSnapshot,
    });
    return {
      fileId: ref.fileId,
      rawTableId: ref.rawTableId,
      sourceRawTableVersion: assessment.sourceRawTableVersion,
      evidenceSignature: createReviewEvidenceSignature(assessment, {
        columnCount: table.columnCount,
        fileName: file.name,
        rowCount: table.rowCount,
      }),
      ...result,
      createdAt: Date.now(),
    };
  }

  private clearQueue(): void {
    if (!this.pendingRefsByKey.size) {
      return;
    }
    this.pendingRefsByKey.clear();
    this.fireReviewStateChange();
  }

  private deleteQueuedRefsForFiles(fileIds: readonly string[]): void {
    const fileIdSet = new Set(fileIds.map(normalizeText).filter(Boolean));
    let didChange = false;
    for (const [key, ref] of this.pendingRefsByKey) {
      if (fileIdSet.has(ref.fileId)) {
        this.pendingRefsByKey.delete(key);
        didChange = true;
      }
    }
    if (didChange) {
      this.fireReviewStateChange();
    }
  }

  private fireReviewStateChange(): void {
    this.onDidChangeReviewStateEmitter.fire(undefined);
  }

  private resolveManualTemplate(
    selection: ManualTemplateReviewRequest["selection"],
  ): ManualTemplateResolution {
    if (selection.kind === "inline") {
      const templateFingerprint = createTemplateFingerprint(selection.template);
      return {
        kind: "resolved",
        candidateId: `manual:inline:${templateFingerprint}`,
        source: { kind: "inline" },
        template: selection.template,
      };
    }

    const templateId = normalizeText(selection.templateId);
    if (!templateId) {
      return {
        kind: "invalid",
        code: "review.manual.emptyTemplateId",
        message: "Manual review needs a Template id.",
      };
    }

    const userTemplate = this.userTemplateService.getTemplate(templateId);
    if (!userTemplate) {
      return {
        kind: "invalid",
        code: "review.manual.templateNotFound",
        message: "The selected UserTemplate could not be found.",
      };
    }

    return {
      kind: "resolved",
      candidateId: `manual:${selection.kind}:${templateId}`,
      source: {
        kind: "userTemplate",
        templateId: userTemplate.id,
        templateVersion: userTemplate.version,
      },
      template: userTemplate.template,
    };
  }
}

type ManualTemplateResolution =
  | {
      readonly kind: "resolved";
      readonly candidateId: string;
      readonly source: ReviewedTemplateSource;
      readonly template: Template;
    }
  | {
      readonly kind: "invalid";
      readonly code: string;
      readonly message: string;
    };

type ManualTemplateReview = {
  readonly candidateId: string;
  readonly source: ReviewedTemplateSource;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly review: TemplateReview;
};

const createManualTemplateReview = ({
  candidateId,
  columnCount,
  rowCount,
  source,
  template,
}: {
  readonly candidateId: string;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly source: ReviewedTemplateSource;
  readonly template: Template;
}): ManualTemplateReview => {
  const templateFingerprint = createTemplateFingerprint(template);
  const diagnostics = getManualTemplateDiagnosticCodes({
    columnCount,
    rowCount,
    template,
  });
  const status = getManualTemplateReviewStatus(template, diagnostics);
  const review: TemplateReview = {
    candidateId,
    templateFingerprint,
    status,
    confidence: status === "ready" ? 1 : 0,
    reasons: [getManualTemplateReason(source)],
    diagnostics: diagnostics.map(createReviewDiagnostic),
  };

  return {
    candidateId,
    source,
    template,
    templateFingerprint,
    review,
  };
};

const getManualTemplateDiagnosticCodes = ({
  columnCount,
  rowCount,
  template,
}: {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly template: Template;
}): readonly string[] => {
  const diagnostics = new Set<string>();
  if (!template.blocks.length) {
    diagnostics.add("review.manual.noBlocks");
    return [...diagnostics];
  }

  if (!Number.isInteger(rowCount) || rowCount <= 0) {
    diagnostics.add("review.manual.invalidRowCount");
  }
  if (!Number.isInteger(columnCount) || columnCount <= 0) {
    diagnostics.add("review.manual.invalidColumnCount");
  }

  for (const block of template.blocks) {
    if (!isRowRangeInBounds(block.rowRange, rowCount)) {
      diagnostics.add("review.manual.rowRangeOutOfBounds");
    }
    if (!isAxisInBounds(block.x, columnCount, rowCount)) {
      diagnostics.add("review.manual.xAxisOutOfBounds");
    }
    if (!isAxisInBounds(block.y, columnCount, rowCount)) {
      diagnostics.add("review.manual.yAxisOutOfBounds");
    }
  }

  return [...diagnostics];
};

const getManualTemplateReviewStatus = (
  template: Template,
  diagnostics: readonly string[],
): TemplateReview["status"] => {
  if (!template.blocks.length || diagnostics.includes("review.manual.invalidRowCount") || diagnostics.includes("review.manual.invalidColumnCount")) {
    return "invalid";
  }
  return diagnostics.length ? "needsAdjustment" : "ready";
};

const getManualTemplateReason = (
  source: ReviewedTemplateSource,
): string => {
  switch (source.kind) {
    case "inline":
      return "review.manual.inlineTemplate";
    case "userTemplate":
      return "review.manual.userTemplate";
    case "recipe":
      return "review.manual.recipeTemplate";
  }
};

const createInvalidManualReviewResult = (
  code: string,
  message: string,
): ManualTemplateReviewResult => ({
  kind: "invalid",
  diagnostics: [{
    severity: "error",
    code,
    message,
  }],
  suggestedActions: [{ id: "review.selectTemplate", label: "Select template" }],
});

const isRowRangeInBounds = (
  rowRange: TemplateRowRange,
  rowCount: number,
): boolean => {
  const startRow = Math.floor(Number(rowRange.startRow));
  const endRow = rowRange.endRow === "end"
    ? Math.max(0, rowCount - 1)
    : Math.floor(Number(rowRange.endRow));
  return Number.isInteger(startRow) &&
    Number.isInteger(endRow) &&
    startRow >= 0 &&
    startRow < rowCount &&
    endRow >= startRow &&
    endRow < rowCount;
};

const isAxisInBounds = (
  axis: TemplateAxisBinding,
  columnCount: number,
  rowCount: number,
): boolean =>
  axis.columns.length > 0 &&
  axis.columns.every(column => isColumnInBounds(column, columnCount)) &&
  (axis.ranges ?? []).every(range =>
    isColumnInBounds(range.column, columnCount) &&
    isRowRangeInBounds({
      startRow: range.startRow,
      endRow: range.endRow,
    }, rowCount)
  );

const isColumnInBounds = (
  column: number,
  columnCount: number,
): boolean =>
  Number.isInteger(column) &&
  column >= 0 &&
  column < columnCount;

const createReviewDecision = ({
  candidates,
  readyCandidate,
  reviews,
}: {
  readonly candidates: readonly ReviewTemplateCandidate[];
  readonly readyCandidate: ReviewTemplateCandidate | undefined;
  readonly reviews: readonly TemplateReview[];
}): ReviewResult["decision"] => {
  if (readyCandidate) {
    const review = reviews.find(candidateReview => candidateReview.candidateId === readyCandidate.id) ??
      createTemplateReview(readyCandidate);
    const application = review.confidence >= SYSTEM_RECOMMENDED_CONFIDENCE
      ? {
          kind: "systemRecommended" as const,
          reason: "review.ready.systemRecommended",
        }
      : {
          kind: "userActionRequired" as const,
          reason: "review.ready.lowConfidence",
        };
    return {
      kind: "ready",
      reviewedTemplate: {
        candidateId: readyCandidate.id,
        source: toReviewedTemplateSource(readyCandidate.source),
        template: readyCandidate.template,
        templateFingerprint: readyCandidate.templateFingerprint,
        review,
      },
      application,
      summary: application.kind === "systemRecommended"
        ? "Template is ready and recommended for system application."
        : "Template is ready but requires user action before application.",
      suggestedActions: application.kind === "systemRecommended"
        ? []
        : [{ id: "review.confirmTemplate", label: "Confirm template" }],
    };
  }

  if (candidates.length) {
    const candidate = candidates[0];
    const review = candidate ? createTemplateReview(candidate) : undefined;
    return {
      kind: "needsManualAdjustment",
      ...(candidate ? { candidateId: candidate.id } : {}),
      summary: "Template candidates need manual adjustment before application.",
      reasons: review?.reasons ?? ["review.noReadyCandidate"],
      diagnostics: review?.diagnostics ?? [],
      suggestedActions: [{ id: "review.adjustTemplate", label: "Adjust template" }],
    };
  }

  return {
    kind: "invalid",
    summary: "No usable Template candidates were found.",
    reasons: ["review.noCandidates"],
    diagnostics: [{
      severity: "warning",
      code: "review.noCandidates",
      message: "No Recipe or UserTemplate candidates matched this raw table evidence.",
    }],
    suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
  };
};

const createTemplateCandidateSummary = (
  candidate: ReviewTemplateCandidate,
): TemplateCandidateSummary => ({
  id: candidate.id,
  source: candidate.source,
  templateFingerprint: candidate.templateFingerprint,
  displayName: candidate.template.name,
  reasonCodes: candidate.derivationReasons,
  diagnosticCodes: candidate.derivationDiagnostics.map(diagnostic => diagnostic.code),
});

const createTemplateReview = (
  candidate: ReviewTemplateCandidate,
): TemplateReview => ({
  candidateId: candidate.id,
  templateFingerprint: candidate.templateFingerprint,
  status: candidate.derivationDiagnostics.length === 0
    ? "ready"
    : "needsAdjustment",
  confidence: normalizeConfidence(candidate.derivationConfidence),
  reasons: candidate.derivationReasons,
  diagnostics: candidate.derivationDiagnostics,
});

const createReviewDiagnostic = (
  code: string,
): ReviewDiagnostic => ({
  severity: "warning",
  code,
  message: code,
});

const toReviewedTemplateSource = (
  source: ReviewTemplateCandidate["source"],
): ReviewedTemplateSource => {
  return source;
};

const getRawTableRefsForReviewSnapshot = (
  snapshot: ReturnType<ISessionServiceType["getSnapshot"]>,
): RawTableRef[] => {
  const refs: RawTableRef[] = [];
  for (const fileId of snapshot.fileOrder) {
    const file = snapshot.filesById[fileId];
    if (!file) {
      continue;
    }
    for (const rawTableId of Object.keys(file.assessmentsByRawTableId ?? {})) {
      if (file.raw.tablesById[rawTableId]) {
        refs.push({ fileId, rawTableId });
      }
    }
  }
  return refs;
};

const uniqueRawTableRefs = (
  refs: readonly RawTableRef[],
): RawTableRef[] => {
  const result: RawTableRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const normalizedRef = normalizeRawTableRef(ref);
    if (!normalizedRef) {
      continue;
    }
    const key = getRawTableRefKey(normalizedRef);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalizedRef);
  }
  return result;
};

const normalizeRawTableRef = (
  ref: RawTableRef,
): RawTableRef | null => {
  const fileId = normalizeText(ref.fileId);
  const rawTableId = normalizeText(ref.rawTableId);
  return fileId && rawTableId ? { fileId, rawTableId } : null;
};

const getRawTableRefKey = (
  ref: RawTableRef,
): string => `${ref.fileId}\u0000${ref.rawTableId}`;

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

const normalizeConfidence = (
  value: unknown,
): number => {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  return Math.max(0, Math.min(1, confidence));
};

const SYSTEM_RECOMMENDED_CONFIDENCE = 0.8;

registerSingleton(
  IReviewService,
  ReviewService,
  InstantiationType.Delayed,
);
