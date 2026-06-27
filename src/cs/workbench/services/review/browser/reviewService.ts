/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  IRecipeService,
  type IRecipeService as IRecipeServiceType,
} from "src/cs/workbench/services/recipe/common/recipe";
import {
  IReviewService,
  type IReviewService as IReviewServiceType,
  type ManualTemplateReviewResult,
  type ReviewDiagnostic,
  type ReviewSummary,
  type ReviewSummaryTarget,
  type ReviewedTemplateSource,
  type CandidateReview,
  type ReviewResult,
  type ManualTemplateSelection,
  type UriManualTemplateReviewRequest,
  type UriReview,
} from "src/cs/workbench/services/review/common/review";
import {
  createManualCandidateReview,
} from "src/cs/workbench/services/review/common/reviewScoring";
import { deriveReviewResult } from "src/cs/workbench/services/review/common/reviewResult";
import type {
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  ITableModelService,
  type ITableModelReference,
  type ITableModelService as ITableModelServiceType,
} from "src/cs/workbench/services/table/common/resolverService";
import {
  type TableModelContentSnapshot,
  type TableParseDiagnostic,
  type TableModelSheetSnapshot,
  type TableModelSnapshot,
} from "src/cs/workbench/services/table/common/model";
import {
  createEmptyTableProjectionStructure,
  type TableProjectionDiagnostic,
} from "src/cs/workbench/services/table/common/tableProjection";
import type { ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";
import {
  type Template,
  type TemplateAxisBinding,
  type TemplateRowRange,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type UriReviewTarget = {
  readonly resource: URI;
  readonly contentHash: string | null;
  readonly sheetId: string | null;
};

type UriReviewCacheEntry = {
  readonly columnCount?: number;
  readonly contentHash?: string;
  readonly fileName?: string | null;
  readonly modelSignature: string;
  readonly result?: ReviewResult;
  readonly reviewSignature?: string;
  readonly sourceModelVersion?: number;
  readonly sourceVersion?: number;
  readonly summary: ReviewSummary;
  readonly rowCount?: number;
};

export class ReviewService extends Disposable implements IReviewServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeReviewEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeReview = this.onDidChangeReviewEmitter.event;

  private readonly pendingUriReviewKeys = new Set<string>();
  private readonly uriReviewCacheByKey = new Map<string, UriReviewCacheEntry>();
  private readonly uriReviewTargetsByKey = new Map<string, UriReviewTarget>();

  public constructor(
    @IRecipeService private readonly recipeService: IRecipeServiceType,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @ITableModelService private readonly tableModelService?: ITableModelServiceType,
  ) {
    super();
    if (this.tableModelService) {
      this._register(this.tableModelService.onDidChangeModel(model => {
        this.invalidateUriReviewTargetsForResource(model.resource);
      }));
    }
    this._register(this.recipeService.onDidChangeRecipes(() => {
      this.invalidateAllUriReviewTargets();
    }));
    this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
      this.invalidateAllUriReviewTargets();
    }));
  }

  public getLatestReview(target: ReviewSummaryTarget): UriReview | undefined {
    const reviewTarget = normalizeUriReviewTarget(target);
    if (!reviewTarget) {
      return undefined;
    }

    const cached = this.uriReviewCacheByKey.get(getUriReviewTargetKey(reviewTarget));
    if (!cached) {
      return undefined;
    }

    const modelSignature = this.getCurrentUriReviewModelSignature(reviewTarget);
    if (isUriReviewCacheEntryFresh(cached, modelSignature)) {
      return createUriReviewFromCacheEntry(cached);
    }

    this.scheduleUriReview(reviewTarget);
    return createStaleUriReviewFromCacheEntry(cached, reviewTarget);
  }

  public getLatestReviewSummary(target: ReviewSummaryTarget): ReviewSummary {
    const reviewTarget = normalizeUriReviewTarget(target);
    const fallback = (): ReviewSummary => ({
      resource: target.resource,
      ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      state: "missing",
      findingCodes: [],
    });
    if (!reviewTarget || !this.tableModelService) {
      return fallback();
    }

    const key = getUriReviewTargetKey(reviewTarget);
    this.uriReviewTargetsByKey.set(key, reviewTarget);
    const modelSignature = this.getCurrentUriReviewModelSignature(reviewTarget);
    const cached = this.uriReviewCacheByKey.get(key);
    if (cached && isUriReviewCacheEntryFresh(cached, modelSignature)) {
      return cached.summary;
    }

    this.scheduleUriReview(reviewTarget);
    if (cached) {
      return createStaleReviewSummaryFromCacheEntry(cached, reviewTarget);
    }

    return {
      resource: reviewTarget.resource,
      ...(reviewTarget.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      state: "pending",
      findingCodes: [],
    };
  }

  public async reviewUri(target: ReviewSummaryTarget): Promise<UriReview> {
    const reviewTarget = normalizeUriReviewTarget(target);
    const fallback = (): UriReview => ({
      resource: target.resource,
      ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      summary: {
        resource: target.resource,
        ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
        state: "missing",
        findingCodes: [],
      },
    });
    if (!reviewTarget || !this.tableModelService) {
      return fallback();
    }

    const key = getUriReviewTargetKey(reviewTarget);
    this.uriReviewTargetsByKey.set(key, reviewTarget);
    const entry = await this.resolveUriReviewSummary(reviewTarget);
    if (entry) {
      this.uriReviewCacheByKey.set(key, entry);
    } else {
      this.uriReviewCacheByKey.delete(key);
    }
    this.fireReviewChange();
    return entry ? createUriReviewFromCacheEntry(entry) : fallback();
  }

  private reviewResolvedManualTemplate(
    selection: ManualTemplateSelection,
    columnCount: number,
    rowCount: number,
  ): ManualTemplateReviewResult {
    const resolvedTemplate = this.resolveManualTemplate(selection);
    if (resolvedTemplate.kind === "invalid") {
      return createInvalidManualReviewResult(resolvedTemplate.code, resolvedTemplate.message);
    }

    const reviewInput = createManualTemplateReview({
      candidateId: resolvedTemplate.candidateId,
      columnCount,
      source: resolvedTemplate.source,
      template: resolvedTemplate.template,
      rowCount,
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

  public async reviewUriManualTemplate(input: UriManualTemplateReviewRequest): Promise<ManualTemplateReviewResult> {
    const target = normalizeUriReviewTarget(input.target);
    if (!target || !this.tableModelService) {
      return createInvalidManualReviewResult("review.manual.invalidUriTarget", "Manual review needs a URI content target.");
    }

    let reference: ITableModelReference | null = null;
    try {
      reference = await this.tableModelService.createModelReference(
        target.resource,
        createTableSourceFromUriReviewTarget(target),
      );
      const snapshot = reference.object.getSnapshot();
      if (snapshot.loadState.state !== "ready") {
        return createInvalidManualReviewResult("review.manual.tableModelNotReady", "Manual review needs resolved table content.");
      }

      const sheetResolution = resolveUriReviewSheet(snapshot, target.sheetId);
      if (sheetResolution.kind === "missing") {
        return createInvalidManualReviewResult("review.manual.sheetNotFound", "Manual review needs the requested sheet.");
      }

      const content = sheetResolution.sheet?.content ?? snapshot.content;
      if (!content) {
        return createInvalidManualReviewResult("review.manual.noTableContent", "Manual review needs resolved table content.");
      }

      return this.reviewResolvedManualTemplate(input.selection, content.columnCount, content.rowCount);
    } catch (error) {
      return createInvalidManualReviewResult("review.manual.uriResolveFailed", getErrorMessage(error));
    } finally {
      reference?.dispose();
    }
  }

  private fireReviewChange(): void {
    this.onDidChangeReviewEmitter.fire(undefined);
  }

  private scheduleUriReview(target: UriReviewTarget): void {
    const key = getUriReviewTargetKey(target);
    if (this.pendingUriReviewKeys.has(key)) {
      return;
    }

    this.pendingUriReviewKeys.add(key);
    void this.resolveUriReviewSummary(target)
      .then(entry => {
        if (entry) {
          this.uriReviewCacheByKey.set(key, entry);
        } else {
          this.uriReviewCacheByKey.delete(key);
        }
      })
      .finally(() => {
        this.pendingUriReviewKeys.delete(key);
        this.fireReviewChange();
      });
  }

  private async resolveUriReviewSummary(target: UriReviewTarget): Promise<UriReviewCacheEntry | null> {
    if (!this.tableModelService) {
      return null;
    }

    let reference: ITableModelReference | null = null;
    try {
      reference = await this.tableModelService.createModelReference(
        target.resource,
        createTableSourceFromUriReviewTarget(target),
      );
      const snapshot = reference.object.getSnapshot();
      return this.createUriReviewSummaryFromSnapshot(target, snapshot);
    } catch (error) {
      return {
        modelSignature: createUriReviewErrorSignature(target, error),
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.tableModelResolveFailed"],
          message: getErrorMessage(error),
        },
      };
    } finally {
      reference?.dispose();
    }
  }

  private async createUriReviewSummaryFromSnapshot(
    target: UriReviewTarget,
    snapshot: TableModelSnapshot,
  ): Promise<UriReviewCacheEntry> {
    const modelSignature = createUriReviewModelSignature({
      recipeFingerprint: this.recipeService.getSnapshot().fingerprint,
      snapshot,
      target,
      userTemplateEffectiveFingerprint: this.userTemplateService.getSnapshot().effectiveFingerprint,
      userTemplateVersion: this.userTemplateService.getSnapshot().version,
    });
    if (snapshot.loadState.state === "error") {
      return {
        modelSignature,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.tableModelLoadFailed"],
          message: snapshot.loadState.message,
        },
      };
    }
    if (snapshot.loadState.state !== "ready") {
      return {
        modelSignature,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "pending",
          findingCodes: [],
        },
      };
    }

    const sheetResolution = resolveUriReviewSheet(snapshot, target.sheetId);
    if (sheetResolution.kind === "missing") {
      return {
        modelSignature,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.sheetNotFound"],
          message: "Review needs the requested table sheet.",
        },
      };
    }

    const selectedSheet = sheetResolution.sheet;
    const content = selectedSheet
      ? selectedSheet.content
      : snapshot.content;
    if (!content) {
      return {
        modelSignature,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.noTableContent"],
          message: "Review needs resolved table content.",
        },
      };
    }

    const targetSheetId = target.sheetId;
    const fileName = getUriReviewFileName(target.resource, selectedSheet);
    const evidence = createUriReviewEvidence({
      content,
      diagnostics: getUriReviewDiagnostics(snapshot, selectedSheet),
      fileName,
      snapshot,
      target,
    });
    const result = deriveReviewResult({
      columnCount: content.columnCount,
      contentHash: target.contentHash,
      evidence,
      fileName,
      modelVersion: snapshot.version,
      recipeSnapshot: this.recipeService.getSnapshot(),
      resource: target.resource,
      rowCount: content.rowCount,
      sheetId: targetSheetId ?? undefined,
      sourceVersion: snapshot.sourceVersion,
      userTemplateSnapshot: this.userTemplateService.getSnapshot(),
    });
    const reviewSignature = createReviewResultSignature(result);

    return {
      columnCount: content.columnCount,
      fileName,
      ...(target.contentHash ? { contentHash: target.contentHash } : {}),
      modelSignature,
      result,
      reviewSignature,
      rowCount: content.rowCount,
      sourceModelVersion: snapshot.version,
      sourceVersion: snapshot.sourceVersion,
      summary: createReviewSummaryFromResult({
        resource: target.resource,
        result,
        sheetId: targetSheetId,
      }),
    };
  }

  private invalidateUriReviewTargetsForResource(resource: URI): void {
    const resourceIdentity = normalizeResourceIdentity(resource);
    if (!resourceIdentity) {
      return;
    }

    let didChange = false;
    for (const [key, target] of this.uriReviewTargetsByKey) {
      if (normalizeResourceIdentity(target.resource) !== resourceIdentity) {
        continue;
      }
      this.scheduleUriReview(target);
      didChange = true;
    }
    if (didChange) {
      this.fireReviewChange();
    }
  }

  private invalidateAllUriReviewTargets(): void {
    if (!this.uriReviewTargetsByKey.size) {
      return;
    }

    for (const target of this.uriReviewTargetsByKey.values()) {
      this.scheduleUriReview(target);
    }
    this.fireReviewChange();
  }

  private getCurrentUriReviewModelSignature(target: UriReviewTarget): string | null {
    const snapshot = this.tableModelService?.get(target.resource)?.getSnapshot();
    if (!snapshot) {
      return null;
    }

    return createUriReviewModelSignature({
      recipeFingerprint: this.recipeService.getSnapshot().fingerprint,
      snapshot,
      target,
      userTemplateEffectiveFingerprint: this.userTemplateService.getSnapshot().effectiveFingerprint,
      userTemplateVersion: this.userTemplateService.getSnapshot().version,
    });
  }

  private resolveManualTemplate(
    selection: ManualTemplateSelection,
  ): ManualTemplateLookupResult {
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

type ManualTemplateLookupResult =
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

const createUriReviewEvidence = ({
  content,
  diagnostics,
  fileName,
  snapshot,
  target,
}: {
  readonly content: TableModelContentSnapshot;
  readonly diagnostics: readonly TableParseDiagnostic[];
  readonly fileName: string | null;
  readonly snapshot: TableModelSnapshot;
  readonly target: UriReviewTarget;
}): ReviewEvidence => ({
  sourceMetadata: {
    columnCount: content.columnCount,
    ...(target.contentHash ? { contentHash: target.contentHash } : {}),
    fileName,
    rowCount: content.rowCount,
    sourceModelVersion: snapshot.version,
    sourceUri: normalizeResourceIdentity(target.resource),
    sourceVersion: snapshot.sourceVersion,
  },
  tableProjection: {
    structure: createEmptyTableProjectionStructure(),
    columnProfiles: [],
    layoutCandidates: [],
    semanticCandidates: [],
    groups: [],
    blocks: [],
    diagnostics: diagnostics.map(toTableProjectionParserDiagnostic),
  },
});

const toTableProjectionParserDiagnostic = (
  diagnostic: TableParseDiagnostic,
): TableProjectionDiagnostic => ({
  severity: diagnostic.severity,
  code: diagnostic.code,
  message: diagnostic.message,
  ...(diagnostic.rowIndex !== undefined || diagnostic.columnIndex !== undefined ? {
    sourceRange: {
      startRow: diagnostic.rowIndex ?? 0,
      endRow: diagnostic.rowIndex ?? 0,
      startCol: diagnostic.columnIndex ?? 0,
      endCol: diagnostic.columnIndex ?? 0,
    },
  } : {}),
});

type ManualTemplateReview = {
  readonly candidateId: string;
  readonly source: ReviewedTemplateSource;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly review: CandidateReview;
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
  const diagnosticObjects = diagnostics.map(createReviewDiagnostic);
  const review = createManualCandidateReview({
    candidateId,
    interpretationFingerprint: templateFingerprint,
    status,
    confidence: status === "ready"
      ? 1
      : status === "needsAdjustment"
        ? 0.6
        : 0,
    reasons: [getManualTemplateReason(source)],
    diagnostics: diagnosticObjects,
  });

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
): CandidateReview["status"] => {
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
      return "review.manual.recipeReviewedTemplate";
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

const createReviewDiagnostic = (
  code: string,
): ReviewDiagnostic => ({
  severity: "warning",
  code,
  message: code,
});

const createReviewSummaryFromResult = ({
  resource,
  result,
  sheetId,
}: {
  readonly resource: ReviewSummary["resource"];
  readonly result: ReviewResult;
  readonly sheetId: string | null;
}): ReviewSummary => {
  const reviewSignature = createReviewResultSignature(result);
  const decision = result.decision;
  if (decision.kind === "ready") {
    return {
      resource,
      ...(sheetId ? { sheetId } : {}),
      state: "ready",
      confidence: normalizeConfidence(decision.reviewedTemplate.review.confidence),
      findingCodes: decision.reviewedTemplate.review.findings.map(finding => finding.code),
      message: decision.summary,
      reviewedSemanticLabel: normalizeOptionalText(decision.reviewedTemplate.template.name),
      reviewSignature,
      templateFingerprint: decision.reviewedTemplate.templateFingerprint,
    };
  }

  if (decision.kind === "needsManualAdjustment") {
    const reviewCandidate = decision.candidateId
      ? result.reviews.find(candidateReview => candidateReview.candidateId === decision.candidateId)
      : undefined;
    return {
      resource,
      ...(sheetId ? { sheetId } : {}),
      state: "needsAdjustment",
      ...(reviewCandidate ? { confidence: normalizeConfidence(reviewCandidate.confidence) } : {}),
      findingCodes: reviewCandidate
        ? reviewCandidate.findings.map(finding => finding.code)
        : decision.diagnostics.map(diagnostic => diagnostic.code),
      message: decision.summary,
      reviewSignature,
    };
  }

  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
    state: "invalid",
    findingCodes: decision.diagnostics.map(diagnostic => diagnostic.code),
    message: decision.summary,
    reviewSignature,
  };
};

const createUriReviewFromCacheEntry = (
  entry: UriReviewCacheEntry,
): UriReview => ({
  resource: entry.summary.resource,
  ...(entry.summary.sheetId ? { sheetId: entry.summary.sheetId } : {}),
  ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
  summary: entry.summary,
  ...(entry.result ? { result: entry.result } : {}),
  ...(entry.reviewSignature ? { reviewSignature: entry.reviewSignature } : {}),
  ...(entry.sourceModelVersion !== undefined ? { sourceModelVersion: entry.sourceModelVersion } : {}),
  ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
  ...(entry.rowCount !== undefined ? { rowCount: entry.rowCount } : {}),
  ...(entry.columnCount !== undefined ? { columnCount: entry.columnCount } : {}),
  ...(entry.fileName !== undefined ? { fileName: entry.fileName } : {}),
});

const createStaleUriReviewFromCacheEntry = (
  entry: UriReviewCacheEntry,
  target: UriReviewTarget,
): UriReview => ({
  resource: target.resource,
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
  ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
  summary: createStaleReviewSummaryFromCacheEntry(entry, target),
  ...(entry.sourceModelVersion !== undefined ? { sourceModelVersion: entry.sourceModelVersion } : {}),
  ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
  ...(entry.rowCount !== undefined ? { rowCount: entry.rowCount } : {}),
  ...(entry.columnCount !== undefined ? { columnCount: entry.columnCount } : {}),
  ...(entry.fileName !== undefined ? { fileName: entry.fileName } : {}),
});

const createStaleReviewSummaryFromCacheEntry = (
  entry: UriReviewCacheEntry,
  target: UriReviewTarget,
): ReviewSummary => ({
  resource: target.resource,
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
  state: "stale",
  ...(entry.summary.confidence !== undefined ? { confidence: entry.summary.confidence } : {}),
  ...(entry.summary.reviewedSemanticLabel ? { reviewedSemanticLabel: entry.summary.reviewedSemanticLabel } : {}),
  findingCodes: distinctReviewFindingCodes([
    "review.stale",
    ...entry.summary.findingCodes,
  ]),
  message: "Review is stale. Waiting for updated review.",
});

const isUriReviewCacheEntryFresh = (
  entry: UriReviewCacheEntry,
  modelSignature: string | null,
): boolean =>
  Boolean(modelSignature && entry.modelSignature === modelSignature);

const createReviewResultSignature = (
  result: ReviewResult,
): string => [
  normalizeResourceIdentity(result.resource),
  result.sheetId ?? "",
  result.contentHash ?? "",
  result.modelVersion ?? "",
  result.sourceVersion ?? "",
  result.evidenceFingerprint,
  result.recipeFingerprint,
  result.userTemplateCatalogVersion,
  result.userTemplateEffectiveFingerprint,
  result.reviewEngineVersion,
  result.reviewPolicyVersion,
  result.decision.kind,
  result.decision.kind === "ready" ? result.decision.reviewedTemplate.templateFingerprint : "",
  result.reviews.map(review => [
    review.candidateId,
    review.interpretationFingerprint,
    review.status,
    review.confidence,
    JSON.stringify(review.factors),
    review.findings.map(finding => finding.code).join("\u001c"),
  ].join("\u001e")).join("\u001d"),
].join("\u001f");

const normalizeUriReviewTarget = (
  target: ReviewSummaryTarget,
): UriReviewTarget | null => {
  const resource = URI.revive(target.resource);
  const resourceIdentity = normalizeResourceIdentity(resource);
  if (!resourceIdentity) {
    return null;
  }

  return {
    resource,
    contentHash: normalizeText(target.contentHash) || null,
    sheetId: normalizeText(target.sheetId) || null,
  };
};

const getUriReviewTargetKey = (
  target: UriReviewTarget,
): string => [
  normalizeResourceIdentity(target.resource),
  target.contentHash ?? "",
  target.sheetId ?? "",
].join("\u001f");

const createTableSourceFromUriReviewTarget = (
  target: UriReviewTarget,
): TableSource => ({
  resource: target.resource,
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
});

type UriReviewSheetResolution =
  | {
      readonly kind: "found";
      readonly sheet: TableModelSheetSnapshot | null;
    }
  | {
      readonly kind: "missing";
    };

const resolveUriReviewSheet = (
  snapshot: TableModelSnapshot,
  requestedSheetId: string | null,
): UriReviewSheetResolution => {
  if (requestedSheetId) {
    const sheet = snapshot.sheets.find(candidate => candidate.sheetId === requestedSheetId);
    return sheet
      ? { kind: "found", sheet }
      : { kind: "missing" };
  }

  return {
    kind: "found",
    sheet: snapshot.sheets.find(sheet => sheet.sheetId === snapshot.defaultSheetId) ??
      snapshot.sheets[0] ??
      null,
  };
};

const getUriReviewDiagnostics = (
  snapshot: TableModelSnapshot,
  sheet: TableModelSheetSnapshot | null,
): readonly TableParseDiagnostic[] => [
  ...snapshot.diagnostics,
  ...(sheet?.diagnostics ?? []),
];

const createUriReviewModelSignature = ({
  recipeFingerprint,
  snapshot,
  target,
  userTemplateEffectiveFingerprint,
  userTemplateVersion,
}: {
  readonly recipeFingerprint: string;
  readonly snapshot: TableModelSnapshot;
  readonly target: UriReviewTarget;
  readonly userTemplateEffectiveFingerprint: string;
  readonly userTemplateVersion: number;
}): string => [
  getUriReviewTargetKey(target),
  snapshot.version,
  snapshot.sourceVersion,
  target.contentHash ?? "",
  snapshot.loadState.state,
  recipeFingerprint,
  userTemplateEffectiveFingerprint,
  userTemplateVersion,
].join("\u001f");

const createUriReviewErrorSignature = (
  target: UriReviewTarget,
  error: unknown,
): string => [
  getUriReviewTargetKey(target),
  "error",
  getErrorMessage(error),
].join("\u001f");

const getUriReviewFileName = (
  resource: URI,
  sheet: TableModelSheetSnapshot | null,
): string => {
  const sheetName = normalizeText(sheet?.sheetName);
  if (sheetName) {
    return sheetName;
  }

  const path = normalizeText(resource.path);
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  return name || getResourceIdentityString(resource);
};

const getErrorMessage = (
  error: unknown,
): string => error instanceof Error
  ? error.message
  : String(error ?? "Review failed.");

const normalizeResourceIdentity = (
  resource: URI | undefined,
): string => {
  const text = getResourceIdentityString(resource);
  if (text) {
    return normalizeResourceText(text);
  }

  if (resource && typeof resource === "object") {
    const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
    const scheme = normalizeText(candidate.scheme);
    const path = normalizeText(candidate.path);
    if (scheme && path) {
      const authority = normalizeText(candidate.authority);
      const query = normalizeText(candidate.query);
      const fragment = normalizeText(candidate.fragment);
      return normalizeResourceText(
        scheme === "file"
          ? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
          : `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`,
      );
    }
  }

  return "";
};

const getResourceIdentityString = (
  resource: unknown,
): string => {
  if (!resource) {
    return "";
  }

  if (typeof resource === "string") {
    return normalizeText(resource);
  }

  const toString = (resource as { readonly toString?: unknown }).toString;
  if (typeof toString === "function" && toString !== Object.prototype.toString) {
    const text = normalizeText(toString.call(resource));
    return text === "[object Object]" ? "" : text;
  }

  return "";
};

const normalizeResourceText = (
  value: unknown,
): string => normalizeText(value).replace(/\\/g, "/");

const normalizeOptionalText = (
  value: unknown,
): string | undefined => {
  const normalized = normalizeText(value);
  return normalized || undefined;
};

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

const distinctReviewFindingCodes = (
  codes: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const normalized = normalizeText(code);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

registerSingleton(
  IReviewService,
  ReviewService as unknown as new (...services: BrandedService[]) => IReviewServiceType,
  InstantiationType.Delayed,
);
