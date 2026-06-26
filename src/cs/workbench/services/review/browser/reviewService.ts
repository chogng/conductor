/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import {
  IRecipeService,
  type IRecipeService as IRecipeServiceType,
} from "src/cs/workbench/services/recipe/common/recipe";
import {
  IReviewService,
  REVIEW_ENGINE_VERSION,
  REVIEW_POLICY_VERSION,
  type IReviewService as IReviewServiceType,
  type ManualTemplateReviewRequest,
  type ManualTemplateReviewResult,
  type ReviewDiagnostic,
  type ReviewInput,
  type ReviewResult,
  type TableReviewSummary,
  type TableReviewSummaryTarget,
  type ReviewedTemplateSource,
  type TemplateCandidateSummary,
  type TemplateReview,
  type UriManualTemplateReviewRequest,
  type UriTableReview,
} from "src/cs/workbench/services/review/common/review";
import {
  TableModel,
  ITableModelProducerService,
  type ITableModelProducerService as ITableModelProducerServiceType,
  type TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  ITableModelService,
  type ITableModelReference,
  type ITableModelService as ITableModelServiceType,
} from "src/cs/workbench/services/table/common/resolverService";
import type {
  TableModelContentSnapshot,
  TableModelSheetSnapshot,
  TableModelSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type { TemplateDraft } from "src/cs/workbench/services/template/common/templateDraft";
import {
  ITemplateMaterializationService,
  type ITemplateMaterializationService as ITemplateMaterializationServiceType,
} from "src/cs/workbench/services/template/common/templateMaterialization";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
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
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type ReviewTemplateCandidate = TemplateDraft;

type UriReviewTarget = {
  readonly resource: TableReviewSummaryTarget["resource"];
  readonly sheetId: string | null;
};

type UriReviewCacheEntry = {
  readonly columnCount?: number;
  readonly fileName?: string | null;
  readonly modelSignature: string;
  readonly result?: ReviewResult;
  readonly reviewSignature?: string;
  readonly sourceModelVersion?: number;
  readonly sourceVersion?: number;
  readonly summary: TableReviewSummary;
  readonly tableModel?: TableModelRecord;
  readonly rowCount?: number;
};

export class ReviewService extends Disposable implements IReviewServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeReviewStateEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeReviewState = this.onDidChangeReviewStateEmitter.event;

  private readonly pendingUriReviewKeys = new Set<string>();
  private readonly uriReviewCacheByKey = new Map<string, UriReviewCacheEntry>();
  private readonly uriReviewTargetsByKey = new Map<string, UriReviewTarget>();

  public constructor(
    @ISessionService private readonly sessionService: ISessionServiceType,
    @IRecipeService private readonly recipeService: IRecipeServiceType,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @ITemplateMaterializationService private readonly templateMaterializationService: ITemplateMaterializationServiceType,
    @ITableModelService private readonly tableModelService?: ITableModelServiceType,
    @ITableModelProducerService private readonly tableModelProducerService?: ITableModelProducerServiceType,
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

  public deriveAndReview(input: ReviewInput): ReviewResult {
    const tableModel = TableModel.fromRecord(input.tableModel, {
      columnCount: input.columnCount,
      fileName: input.fileName ?? undefined,
      rowCount: input.rowCount,
    });
    const candidates = this.templateMaterializationService.materializeAutomaticDrafts({
      tableModel,
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

  public getLatestReviewSummary(target: TableReviewSummaryTarget): TableReviewSummary {
    const reviewTarget = normalizeUriReviewTarget(target);
    const fallback = (): TableReviewSummary => ({
      resource: target.resource,
      ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      state: "missing",
      findingCodes: [],
    });
    if (!reviewTarget || !this.tableModelService || !this.tableModelProducerService) {
      return fallback();
    }

    const key = getUriReviewTargetKey(reviewTarget);
    this.uriReviewTargetsByKey.set(key, reviewTarget);
    const modelSignature = this.getCurrentUriReviewModelSignature(reviewTarget);
    const cached = this.uriReviewCacheByKey.get(key);
    if (cached && (!modelSignature || cached.modelSignature === modelSignature)) {
      return cached.summary;
    }

    this.scheduleUriReview(reviewTarget);
    return {
      resource: reviewTarget.resource,
      ...(reviewTarget.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      state: "pending",
      findingCodes: [],
    };
  }

  public async reviewUriTable(target: TableReviewSummaryTarget): Promise<UriTableReview> {
    const reviewTarget = normalizeUriReviewTarget(target);
    const fallback = (): UriTableReview => ({
      resource: target.resource,
      ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      summary: {
        resource: target.resource,
        ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
        state: "missing",
        findingCodes: [],
      },
    });
    if (!reviewTarget || !this.tableModelService || !this.tableModelProducerService) {
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
    this.fireReviewStateChange();
    return entry ? createUriTableReviewFromCacheEntry(entry) : fallback();
  }

  public reviewManualTemplate(input: ManualTemplateReviewRequest): ManualTemplateReviewResult {
    const ref = normalizeRawTableRef(input.ref);
    if (!ref) {
      return createInvalidManualReviewResult("review.manual.invalidRef", "Manual review needs a raw table target.");
    }

    const snapshot = this.sessionService.getSnapshot();
    const file = snapshot.filesById[ref.fileId];
    const table = file?.raw.tablesById[ref.rawTableId];
    const tableModel = file?.tableModelByRawTableId?.[ref.rawTableId];
    if (!file || !table || !tableModel) {
      return createInvalidManualReviewResult(
        "review.manual.missingEvidence",
        "Manual review needs an imported raw table with table model.",
      );
    }

    return this.reviewResolvedManualTemplate(input.selection, table.columnCount, table.rowCount);
  }

  private reviewResolvedManualTemplate(
    selection: ManualTemplateReviewRequest["selection"],
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
      return createInvalidManualReviewResult("review.manual.invalidUriTarget", "Manual review needs a URI table target.");
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

      const selectedSheet = getUriReviewSheet(snapshot, target.sheetId);
      const content = selectedSheet?.content ?? snapshot.content;
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

  private fireReviewStateChange(): void {
    this.onDidChangeReviewStateEmitter.fire(undefined);
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
        this.fireReviewStateChange();
      });
  }

  private async resolveUriReviewSummary(target: UriReviewTarget): Promise<UriReviewCacheEntry | null> {
    if (!this.tableModelService || !this.tableModelProducerService) {
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

    const selectedSheet = getUriReviewSheet(snapshot, target.sheetId);
    const content = selectedSheet?.content ?? snapshot.content;
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

    const sheetId = selectedSheet?.sheetId ?? target.sheetId ?? snapshot.defaultSheetId ?? null;
    const fileName = getUriReviewFileName(target.resource, selectedSheet);
    const tableModel = await this.createUriTableModelRecord({
      content,
      sheetId,
      snapshot,
      target,
    });
    const result = this.deriveAndReview({
      tableModel,
      columnCount: content.columnCount,
      fileName,
      recipeSnapshot: this.recipeService.getSnapshot(),
      rowCount: content.rowCount,
      userTemplateSnapshot: this.userTemplateService.getSnapshot(),
    });
    const reviewSignature = createReviewResultSignature(result);

    return {
      columnCount: content.columnCount,
      fileName,
      modelSignature,
      result,
      reviewSignature,
      rowCount: content.rowCount,
      sourceModelVersion: snapshot.version,
      sourceVersion: snapshot.sourceVersion,
      summary: createTableReviewSummaryFromResult({
        resource: target.resource,
        result,
        sheetId,
      }),
      tableModel,
    };
  }

  private createUriTableModelRecord({
    content,
    sheetId,
    snapshot,
    target,
  }: {
    readonly content: TableModelContentSnapshot;
    readonly sheetId: string | null;
    readonly snapshot: TableModelSnapshot;
    readonly target: UriReviewTarget;
  }): Promise<TableModelRecord> {
    if (!this.tableModelProducerService) {
      throw new Error("URI-backed review needs the table model producer service.");
    }

    const resourceText = target.resource.toString();
    return this.tableModelProducerService.getOrCreate({
      columnCount: content.columnCount,
      fileId: getUriReviewFileId(target.resource),
      fileName: getUriReviewFileName(target.resource, null),
      rawTableId: sheetId ?? resourceText,
      rowCount: content.rowCount,
      rows: content.rows,
      sourceModelVersion: snapshot.version,
      sourceRawTableVersion: snapshot.sourceVersion,
      sourceUri: resourceText,
      sourceVersion: snapshot.sourceVersion,
    });
  }

  private invalidateUriReviewTargetsForResource(resource: TableReviewSummaryTarget["resource"]): void {
    const resourceKey = normalizeResourceKey(resource);
    if (!resourceKey) {
      return;
    }

    let didChange = false;
    for (const [key, target] of this.uriReviewTargetsByKey) {
      if (normalizeResourceKey(target.resource) !== resourceKey) {
        continue;
      }
      this.uriReviewCacheByKey.delete(key);
      this.scheduleUriReview(target);
      didChange = true;
    }
    if (didChange) {
      this.fireReviewStateChange();
    }
  }

  private invalidateAllUriReviewTargets(): void {
    if (!this.uriReviewTargetsByKey.size) {
      return;
    }

    this.uriReviewCacheByKey.clear();
    for (const target of this.uriReviewTargetsByKey.values()) {
      this.scheduleUriReview(target);
    }
    this.fireReviewStateChange();
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
    selection: ManualTemplateReviewRequest["selection"],
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

const normalizeRawTableRef = (
  ref: RawTableRef,
): RawTableRef | null => {
  const fileId = normalizeText(ref.fileId);
  const rawTableId = normalizeText(ref.rawTableId);
  return fileId && rawTableId ? { fileId, rawTableId } : null;
};

const createTableReviewSummaryFromResult = ({
  resource,
  result,
  sheetId,
}: {
  readonly resource: TableReviewSummary["resource"];
  readonly result: ReviewResult;
  readonly sheetId: string | null;
}): TableReviewSummary => {
  const reviewSignature = createReviewResultSignature(result);
  const decision = result.decision;
  if (decision.kind === "ready") {
    return {
      resource,
      ...(sheetId ? { sheetId } : {}),
      state: "ready",
      confidence: normalizeConfidence(decision.reviewedTemplate.review.confidence),
      findingCodes: decision.reviewedTemplate.review.diagnostics.map(diagnostic => diagnostic.code),
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
      findingCodes: decision.diagnostics.map(diagnostic => diagnostic.code),
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

const createUriTableReviewFromCacheEntry = (
  entry: UriReviewCacheEntry,
): UriTableReview => ({
  resource: entry.summary.resource,
  ...(entry.summary.sheetId ? { sheetId: entry.summary.sheetId } : {}),
  summary: entry.summary,
  ...(entry.result ? { result: entry.result } : {}),
  ...(entry.tableModel ? { tableModel: entry.tableModel } : {}),
  ...(entry.reviewSignature ? { reviewSignature: entry.reviewSignature } : {}),
  ...(entry.sourceModelVersion !== undefined ? { sourceModelVersion: entry.sourceModelVersion } : {}),
  ...(entry.sourceVersion !== undefined ? { sourceVersion: entry.sourceVersion } : {}),
  ...(entry.rowCount !== undefined ? { rowCount: entry.rowCount } : {}),
  ...(entry.columnCount !== undefined ? { columnCount: entry.columnCount } : {}),
  ...(entry.fileName !== undefined ? { fileName: entry.fileName } : {}),
});

const createReviewResultSignature = (
  result: ReviewResult,
): string => [
  result.recipeFingerprint,
  result.userTemplateCatalogVersion,
  result.userTemplateEffectiveFingerprint,
  result.reviewEngineVersion,
  result.reviewPolicyVersion,
  result.decision.kind,
  result.decision.kind === "ready" ? result.decision.reviewedTemplate.templateFingerprint : "",
  result.reviews.map(review => [
    review.candidateId,
    review.templateFingerprint,
    review.status,
    review.confidence,
  ].join("\u001e")).join("\u001d"),
].join("\u001f");

const normalizeUriReviewTarget = (
  target: TableReviewSummaryTarget,
): UriReviewTarget | null => {
  const resourceKey = normalizeResourceKey(target.resource);
  if (!resourceKey) {
    return null;
  }

  return {
    resource: target.resource,
    sheetId: normalizeText(target.sheetId) || null,
  };
};

const getUriReviewTargetKey = (
  target: UriReviewTarget,
): string => [
  normalizeResourceKey(target.resource),
  target.sheetId ?? "",
].join("\u001f");

const createTableSourceFromUriReviewTarget = (
  target: UriReviewTarget,
): TableSource => ({
  resource: target.resource,
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
});

const getUriReviewSheet = (
  snapshot: TableModelSnapshot,
  requestedSheetId: string | null,
): TableModelSheetSnapshot | null => {
  if (requestedSheetId) {
    return snapshot.sheets.find(sheet => sheet.sheetId === requestedSheetId) ?? null;
  }

  return snapshot.sheets.find(sheet => sheet.sheetId === snapshot.defaultSheetId) ??
    snapshot.sheets[0] ??
    null;
};

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

const getUriReviewFileId = (
  resource: TableReviewSummaryTarget["resource"],
): string => normalizeResourceKey(resource) || resource.toString();

const getUriReviewFileName = (
  resource: TableReviewSummaryTarget["resource"],
  sheet: TableModelSheetSnapshot | null,
): string => {
  const sheetName = normalizeText(sheet?.sheetName);
  if (sheetName) {
    return sheetName;
  }

  const path = normalizeText(resource.path);
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  return name || resource.toString();
};

const getErrorMessage = (
  error: unknown,
): string => error instanceof Error
  ? error.message
  : String(error ?? "Review failed.");

const normalizeResourceKey = (
  resource: TableReviewSummaryTarget["resource"],
): string => normalizeResourceText(resource.toString());

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

const SYSTEM_RECOMMENDED_CONFIDENCE = 0.8;

registerSingleton(
  IReviewService,
  ReviewService as unknown as new (...services: BrandedService[]) => IReviewServiceType,
  InstantiationType.Delayed,
);
