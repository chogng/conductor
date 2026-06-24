/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createAssessmentEvidenceFromRecord } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import {
  IRecipeService,
  type IRecipeService as IRecipeServiceType,
} from "src/cs/workbench/services/recipe/common/recipe";
import {
  IReviewService,
  REVIEW_ENGINE_VERSION,
  REVIEW_POLICY_VERSION,
  createReviewEvidenceSignature,
  type AutomaticTemplateCandidateSource,
  type IReviewService as IReviewServiceType,
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
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
  FileRecord,
  RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  ITemplateService,
  type ITemplateService as ITemplateServiceType,
  type TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import {
  evaluateSavedTemplateCandidates,
} from "src/cs/workbench/services/templateResolution/common/savedTemplateEvaluator";
import {
  materializeRecipeTemplates,
} from "src/cs/workbench/services/templateResolution/common/recipeTemplateMaterializer";
import type {
  TemplateCandidate,
} from "src/cs/workbench/services/templateResolution/common/templateResolution";

export class ReviewService extends Disposable implements IReviewServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeReviewStateEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeReviewState = this.onDidChangeReviewStateEmitter.event;

  private readonly pendingRefsByKey = new Map<string, RawTableRef>();
  private isReviewing = false;

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @IRecipeService private readonly recipeService: IRecipeServiceType,
    @ITemplateService private readonly templateService: ITemplateServiceType,
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
    const evidence = createAssessmentEvidenceFromRecord(input.assessment, {
      columnCount: input.columnCount,
      fileName: input.fileName ?? undefined,
      rowCount: input.rowCount,
    });
    const recipeCandidates = materializeRecipeTemplates({
      evidence,
      recipeSnapshot: input.recipeSnapshot,
    }).map((candidate): TemplateCandidate => ({
      id: candidate.id,
      source: {
        kind: "recipe",
        recipeId: candidate.recipeId,
        recipeVersion: candidate.recipeVersion,
      },
      template: candidate.template,
      templateFingerprint: candidate.templateFingerprint,
      confidence: candidate.confidence,
      state: candidate.state,
      reasons: candidate.reasons,
      diagnosticCodes: candidate.diagnosticCodes,
    }));
    const candidates = sortReviewCandidates([
      ...recipeCandidates,
      ...evaluateSavedTemplateCandidates({
        evidence,
        templateSnapshot: input.templateSnapshot,
      }),
    ]);
    const reviews = candidates.map(createTemplateReview);
    const readyCandidate = candidates.find(candidate => {
      const review = reviews.find(candidateReview => candidateReview.candidateId === candidate.id);
      return review?.status === "ready";
    });

    return {
      recipeFingerprint: input.recipeSnapshot.fingerprint,
      userTemplateCatalogVersion: input.templateSnapshot.version,
      userTemplateEffectiveFingerprint: createLegacyTemplateSnapshotFingerprint(input.templateSnapshot),
      reviewEngineVersion: REVIEW_ENGINE_VERSION,
      reviewPolicyVersion: REVIEW_POLICY_VERSION,
      candidates: candidates.map(createTemplateCandidateSummary),
      reviews,
      decision: createReviewDecision({
        candidates,
        legacyAutoApplyAllowed: input.assessment.decision.autoApplyAllowed,
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
        const templateSnapshot = this.templateService.getSnapshot();
        for (const ref of refs) {
          const commit = this.createReviewCommit(
            ref,
            snapshot.filesById[ref.fileId],
            recipeSnapshot,
            templateSnapshot,
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
    templateSnapshot: ReturnType<ITemplateServiceType["getSnapshot"]>,
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
      templateSnapshot,
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
}

const createReviewDecision = ({
  candidates,
  legacyAutoApplyAllowed,
  readyCandidate,
  reviews,
}: {
  readonly candidates: readonly TemplateCandidate[];
  readonly legacyAutoApplyAllowed: boolean;
  readonly readyCandidate: TemplateCandidate | undefined;
  readonly reviews: readonly TemplateReview[];
}): ReviewResult["decision"] => {
  if (readyCandidate) {
    const review = reviews.find(candidateReview => candidateReview.candidateId === readyCandidate.id) ??
      createTemplateReview(readyCandidate);
    const application = legacyAutoApplyAllowed && review.confidence >= SYSTEM_RECOMMENDED_CONFIDENCE
      ? {
          kind: "systemRecommended" as const,
          reason: "review.ready.systemRecommended",
        }
      : {
          kind: "userActionRequired" as const,
          reason: legacyAutoApplyAllowed
            ? "review.ready.lowConfidence"
            : "review.ready.legacyEvidenceRequiresUserAction",
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
      message: "No Recipe or saved Template candidates matched this raw table evidence.",
    }],
    suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
  };
};

const createTemplateCandidateSummary = (
  candidate: TemplateCandidate,
): TemplateCandidateSummary => ({
  id: candidate.id,
  source: toAutomaticTemplateCandidateSource(candidate.source),
  templateFingerprint: candidate.templateFingerprint,
  displayName: candidate.template.name,
  reasonCodes: candidate.reasons,
  diagnosticCodes: candidate.diagnosticCodes,
});

const createTemplateReview = (
  candidate: TemplateCandidate,
): TemplateReview => ({
  candidateId: candidate.id,
  templateFingerprint: candidate.templateFingerprint,
  status: candidate.state === "ready"
    ? "ready"
    : "needsAdjustment",
  confidence: normalizeConfidence(candidate.confidence),
  reasons: candidate.reasons,
  diagnostics: candidate.diagnosticCodes.map(createReviewDiagnostic),
});

const createReviewDiagnostic = (
  code: string,
): ReviewDiagnostic => ({
  severity: "warning",
  code,
  message: code,
});

const toAutomaticTemplateCandidateSource = (
  source: TemplateCandidate["source"],
): AutomaticTemplateCandidateSource => {
  if (source.kind === "recipe") {
    return source;
  }
  return {
    kind: "savedTemplate",
    templateId: source.templateId,
    templateVersion: source.templateVersion,
  };
};

const toReviewedTemplateSource = (
  source: TemplateCandidate["source"],
): ReviewedTemplateSource => {
  if (source.kind === "recipe") {
    return source;
  }
  return {
    kind: "savedTemplate",
    templateId: source.templateId,
    templateVersion: source.templateVersion,
  };
};

const sortReviewCandidates = (
  candidates: readonly TemplateCandidate[],
): readonly TemplateCandidate[] => [...candidates].sort((left, right) =>
  getCandidateStateRank(right) - getCandidateStateRank(left) ||
  right.confidence - left.confidence ||
  left.id.localeCompare(right.id)
);

const getCandidateStateRank = (
  candidate: TemplateCandidate,
): number => candidate.state === "ready" ? 1 : 0;

const createLegacyTemplateSnapshotFingerprint = (
  snapshot: TemplateSnapshot,
): string => JSON.stringify({
  kind: "legacyTemplateSnapshot",
  version: snapshot.version,
  templates: snapshot.templates.map(template => ({
    id: String(template.id ?? ""),
    version: template.version,
  })),
});

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
