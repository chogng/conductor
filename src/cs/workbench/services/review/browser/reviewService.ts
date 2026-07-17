/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { LinkedMap, Touch } from "src/cs/base/common/map";
import { Disposable } from "src/cs/base/common/lifecycle";
import { CancellationToken } from "src/cs/base/common/cancellation";
import { disposableTimeout, raceCancellation } from "src/cs/base/common/async";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import { IFileService, type IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
  type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import {
  IWorkspaceContextService,
  type IWorkspaceContextService as IWorkspaceContextServiceType,
} from "src/cs/platform/workspace/common/workspace";
import {
  IReviewService,
  REVIEW_ENGINE_VERSION,
  REVIEW_POLICY_VERSION,
  type ReviewChangeEvent,
  type ManualTemplateReviewResult,
  type ManualTemplateSelection,
  type ReviewReevaluationResult,
  type ReviewedTemplateConfirmationRequest,
  type ResourceManualTemplateReviewRequest,
  type ResourceReviewExecution,
} from "src/cs/workbench/services/review/common/review";
import {
  IDataResourceService,
  type DataResourceStructuredContentResolution,
  type DataResourceStructuredContentSnapshot,
  type DataResourceStructuredContentTarget,
  type DataResourceStructuredEvidenceResolution,
  type DataResourceStructuredEvidenceSnapshot,
  type IDataResourceStructuredContentReference,
  type IDataResourceStructuredEvidenceReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
  ISchemaProfileService,
  type SchemaProfile,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
  ConfirmSchemaProfileInput,
  SchemaProfileConfirmationBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import type {
  StructuredCanonicalUnit,
  StructuredColumnProfile,
  StructuredMeasurementColumnRef,
  StructuredMeasurementColumnRole,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	createManualCandidateReview,
	deriveReviewResult,
} from "src/cs/workbench/services/review/common/reviewDecision";
import type {
  CandidateReview,
  ReviewEvidence,
  ReviewDiagnostic,
  ReviewResult,
  ReviewSummary,
  ReviewSummaryTarget,
  ReviewedTemplate,
  ReviewedTemplateSource,
} from "src/cs/workbench/services/review/common/reviewModel";
import {
  type Template,
  type TemplateAxisBinding,
  type TemplateRowRange,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";

interface NormalizedUriReviewTarget {
  readonly resource: URI;
  readonly contentHash?: string;
  readonly sheetId?: string;
}

type UriReviewCacheEntry = {
  readonly columnCount?: number;
  readonly contentHash?: string;
  readonly fileName?: string | null;
  readonly modelSignature: string;
  readonly result?: ReviewResult;
  readonly reviewEngineVersion: number;
  readonly reviewPolicyVersion: number;
  readonly reviewSignature?: string;
  readonly sourceModelVersion?: number;
  readonly sourceVersion?: number;
  readonly summary: ReviewSummary;
  readonly rowCount?: number;
};

type ActiveUriReview = {
  readonly generation: number;
  readonly promise: Promise<UriReviewCacheEntry | null>;
  readonly workspaceGeneration: number;
};

type ActiveUriReevaluation = {
  readonly promise: Promise<ReviewReevaluationResult | null>;
  readonly token: CancellationToken;
};

const ReviewChangeBatchDelayMs = 16;
const PersistedReviewVersion = 1;
const PersistedReviewStoragePrefix = "review.result.v1:";

type PersistedUriReview = {
  readonly version: typeof PersistedReviewVersion;
  readonly fileMtime: number;
  readonly fileSize: number;
  readonly schemaProfileVersion: number;
  readonly userTemplateEffectiveFingerprint: string;
  readonly userTemplateVersion: number;
  readonly entry: UriReviewCacheEntry;
};

export class ReviewService extends Disposable implements IReviewService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeReviewEmitter = this._register(new Emitter<ReviewChangeEvent>());
  public readonly onDidChangeReview = this.onDidChangeReviewEmitter.event;

  private readonly pendingReviewChangeTargetsByKey = new Map<string, NormalizedUriReviewTarget>();
  private readonly staleUriReviewKeys = new Set<string>();
  private readonly activeUriReviewsByKey = new Map<string, ActiveUriReview>();
  private readonly activeUriReevaluationsByKey = new Map<string, ActiveUriReevaluation>();
  private readonly pendingUriReviewRefreshTargetsByKey = new Map<string, NormalizedUriReviewTarget>();
  private readonly uriReviewCacheByKey = new Map<string, UriReviewCacheEntry>();
  private readonly uriReviewGenerationByKey = new Map<string, number>();
  private readonly uriReviewTargetsByKey = new LinkedMap<string, NormalizedUriReviewTarget>();
  private readonly attemptedPersistedReviewKeys = new Set<string>();
  private readonly pendingPersistence = new Set<Promise<void>>();
  private workspaceGeneration = 0;
  private disposed = false;
  private scheduledReviewChange: { dispose(): void } | null = null;
  private scheduledUriReviewRefresh: { dispose(): void } | null = null;

  public constructor(
    @IUserTemplateService private readonly userTemplateService: IUserTemplateService,
    @IDataResourceService private readonly dataResourceService?: IDataResourceService,
    @ISchemaProfileService private readonly schemaProfileService?: ISchemaProfileService,
    @IStorageService private readonly storageService?: IStorageServiceType,
    @IWorkspaceContextService private readonly workspaceContextService?: IWorkspaceContextServiceType,
    @IFileService private readonly fileService?: IFileServiceType,
  ) {
    super();
    this._register({
      dispose: () => {
        this.disposed = true;
        this.scheduledReviewChange?.dispose();
        this.scheduledReviewChange = null;
        this.scheduledUriReviewRefresh?.dispose();
        this.scheduledUriReviewRefresh = null;
        this.staleUriReviewKeys.clear();
        this.activeUriReviewsByKey.clear();
        this.activeUriReevaluationsByKey.clear();
        this.pendingUriReviewRefreshTargetsByKey.clear();
        this.pendingReviewChangeTargetsByKey.clear();
        this.uriReviewCacheByKey.clear();
        this.uriReviewGenerationByKey.clear();
        this.uriReviewTargetsByKey.clear();
        this.attemptedPersistedReviewKeys.clear();
        this.pendingPersistence.clear();
      },
    });
    if (this.dataResourceService) {
      this._register(this.dataResourceService.onDidChangeResource(resource => {
        this.invalidateUriReviewTargetsForResource(resource);
      }));
    }
    this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
      this.invalidateAllUriReviewTargets();
    }));
    if (this.schemaProfileService) {
      this._register(this.schemaProfileService.onDidChangeSchemaProfiles(() => {
        this.invalidateAllUriReviewTargets();
      }));
    }
    if (this.workspaceContextService) {
      this._register(this.workspaceContextService.onWillChangeWorkspaceFolders(event => {
        event.join(this.flushPendingPersistence());
      }));
      this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
        this.clearUriReviewState();
      }));
    }
  }

  public getLatestReviewSummary(target: ReviewSummaryTarget): ReviewSummary {
    const reviewTarget = normalizeUriReviewTarget(target);
    const fallback = (): ReviewSummary => ({
      resource: target.resource,
      ...(reviewTarget?.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
      state: "missing",
      findingCodes: [],
    });
    if (!reviewTarget || !this.dataResourceService) {
      return fallback();
    }

    const key = getUriReviewTargetKey(reviewTarget);
    const cached = this.uriReviewCacheByKey.get(key);
    if (cached && isCurrentUriReviewCacheEntry(cached) && !this.staleUriReviewKeys.has(key)) {
      return cached.summary;
    }

    if (cached) {
      return createStaleReviewSummaryFromCacheEntry(cached, reviewTarget);
    }
    if (this.activeUriReviewsByKey.has(key)) {
      return {
        resource: reviewTarget.resource,
        ...(reviewTarget.sheetId ? { sheetId: reviewTarget.sheetId } : {}),
        state: "pending",
        findingCodes: [],
      };
    }

    return fallback();
  }

  public getLatestResourceReviewExecution(target: ReviewSummaryTarget): ResourceReviewExecution | null {
    const reviewTarget = normalizeUriReviewTarget(target);
    if (!reviewTarget || !this.dataResourceService) {
      return null;
    }

    const key = getUriReviewTargetKey(reviewTarget);
    const cached = this.uriReviewCacheByKey.get(key);
    return cached && isCurrentUriReviewCacheEntry(cached) && !this.staleUriReviewKeys.has(key)
      ? createResourceReviewExecutionFromCacheEntry(cached)
      : null;
  }

  public async resolveReviewSummary(target: ReviewSummaryTarget): Promise<ReviewSummary | null> {
    const reviewTarget = normalizeUriReviewTarget(target);
    if (!reviewTarget || !this.dataResourceService) {
      return null;
    }

    const entry = await this.resolveCurrentUriReviewCacheEntry(reviewTarget);
    return entry?.summary ?? null;
  }

  public async reevaluate(
    target: ReviewSummaryTarget,
    token: CancellationToken = CancellationToken.None,
  ): Promise<ReviewReevaluationResult | null> {
    const reviewTarget = normalizeUriReviewTarget(target);
    if (!reviewTarget || !this.dataResourceService || token.isCancellationRequested) {
      return null;
    }

    const key = getUriReviewTargetKey(reviewTarget);
    const activeReevaluation = this.activeUriReevaluationsByKey.get(key);
    if (activeReevaluation && !activeReevaluation.token.isCancellationRequested) {
      return activeReevaluation.promise;
    }

    const reevaluation = raceCancellation(
      this.doReevaluate(key, reviewTarget, token),
      token,
      null,
    ).finally(() => {
      if (this.activeUriReevaluationsByKey.get(key)?.promise === reevaluation) {
        this.activeUriReevaluationsByKey.delete(key);
      }
    });
    this.activeUriReevaluationsByKey.set(key, {
      promise: reevaluation,
      token,
    });
    return reevaluation;
  }

  public async reviewResourceForExecution(target: ReviewSummaryTarget): Promise<ResourceReviewExecution | null> {
    const reviewTarget = normalizeUriReviewTarget(target);
    if (!reviewTarget || !this.dataResourceService) {
      return null;
    }

    const entry = await this.resolveCurrentUriReviewCacheEntry(reviewTarget);
    return entry ? createResourceReviewExecutionFromCacheEntry(entry) : null;
  }

  private async doReevaluate(
    key: string,
    target: NormalizedUriReviewTarget,
    token: CancellationToken,
  ): Promise<ReviewReevaluationResult | null> {
    this.trackUriReviewTarget(key, target);
    this.markUriReviewTargetStale(key);
    this.pendingUriReviewRefreshTargetsByKey.delete(key);
    this.fireReviewChange(target);

    const review = this.startUriReview(key, target, token);
    const entry = await review.promise;
    const isCurrent = () =>
      !token.isCancellationRequested &&
      this.getUriReviewGeneration(key) === review.generation &&
      this.workspaceGeneration === review.workspaceGeneration;
    if (!isCurrent()) {
      return null;
    }

    if (!entry) {
      this.deleteUriReviewCacheEntry(key);
      this.fireReviewChange(target);
      return null;
    }

    this.storeUriReviewCacheEntry(key, entry, "none");
    this.fireReviewChange(target);
    const persistence = await this.persistReevaluatedReview(target, entry, isCurrent);
    return isCurrent()
      ? {
          persistence,
          summary: entry.summary,
        }
      : null;
  }

  private async resolveCurrentUriReviewCacheEntry(reviewTarget: NormalizedUriReviewTarget): Promise<UriReviewCacheEntry | null> {
    const key = getUriReviewTargetKey(reviewTarget);
    this.trackUriReviewTarget(key, reviewTarget);
    const persistedReview = this.restorePersistedReview(reviewTarget);
    if (persistedReview) {
      await persistedReview;
    }
    const cached = this.uriReviewCacheByKey.get(key);
    if (cached && isCurrentUriReviewCacheEntry(cached) && !this.staleUriReviewKeys.has(key)) {
      return cached;
    }
    if (cached && !isCurrentUriReviewCacheEntry(cached)) {
      this.markStaleUriReviewCacheEntryForRefresh(key, reviewTarget);
    }

    const activeReview = this.activeUriReviewsByKey.get(key);
    if (activeReview) {
      const entry = await activeReview.promise;
      this.trackUriReviewTarget(key, reviewTarget);
      return this.getUriReviewGeneration(key) === activeReview.generation &&
        this.workspaceGeneration === activeReview.workspaceGeneration
        ? entry
        : null;
    }

    const review = this.startUriReview(key, reviewTarget);
    const entry = await review.promise;
    this.trackUriReviewTarget(key, reviewTarget);
    const isCurrentGeneration =
      this.getUriReviewGeneration(key) === review.generation &&
      this.workspaceGeneration === review.workspaceGeneration;
    if (isCurrentGeneration && entry) {
      this.storeUriReviewCacheEntry(key, entry);
    } else if (isCurrentGeneration) {
      this.deleteUriReviewCacheEntry(key);
    }
    this.fireReviewChange(reviewTarget);
    return isCurrentGeneration ? entry : null;
  }

  public async confirmReviewedTemplate(input: ReviewedTemplateConfirmationRequest): Promise<SchemaProfile | null> {
    const target = normalizeUriReviewTarget(input);
    if (!target || !this.dataResourceService || !this.schemaProfileService) {
      return null;
    }

    let reference: IDataResourceStructuredContentReference | null = null;
    try {
      reference = await this.dataResourceService.resolveStructuredContent(createDataResourceStructuredContentTarget(target));
      if (reference.object.kind !== "ready") {
        return null;
      }

      const confirmation = createSchemaProfileConfirmationFromReviewedTemplate({
        snapshot: reference.object.snapshot,
        reviewedTemplate: input.reviewedTemplate,
      });
      return confirmation ? this.schemaProfileService.confirmProfile(confirmation) : null;
    } catch {
      return null;
    } finally {
      reference?.dispose();
    }
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

  public async reviewResourceManualTemplate(input: ResourceManualTemplateReviewRequest): Promise<ManualTemplateReviewResult> {
    const target = normalizeUriReviewTarget(input);
    if (!target || !this.dataResourceService) {
      return createInvalidManualReviewResult("review.manual.invalidUriTarget", "Manual review needs a URI content target.");
    }

    let reference: IDataResourceStructuredContentReference | null = null;
    try {
      reference = await this.dataResourceService.resolveStructuredContent(createDataResourceStructuredContentTarget(target));
      return this.reviewManualTemplateWithStructuredContent(input.selection, reference.object);
    } catch (error) {
      return createInvalidManualReviewResult("review.manual.uriResolveFailed", getErrorMessage(error));
    } finally {
      reference?.dispose();
    }
  }

  private reviewManualTemplateWithStructuredContent(
    selection: ManualTemplateSelection,
    resolution: DataResourceStructuredContentResolution,
  ): ManualTemplateReviewResult {
    if (resolution.kind === "pending") {
      return createInvalidManualReviewResult("review.manual.structuredContentNotReady", "Manual review needs resolved structured content.");
    }
    if (resolution.kind === "loadError") {
      return createInvalidManualReviewResult("review.manual.structuredContentLoadFailed", resolution.loadState.message);
    }
    if (resolution.kind === "missingSheet") {
      return createInvalidManualReviewResult("review.manual.sheetNotFound", "Manual review needs the requested sheet.");
    }
    if (resolution.kind === "missingContent") {
      return createInvalidManualReviewResult("review.manual.noStructuredContent", "Manual review needs resolved structured content.");
    }

    return this.reviewResolvedManualTemplate(selection, resolution.snapshot.columnCount, resolution.snapshot.rowCount);
  }

  private fireReviewChange(...targets: readonly NormalizedUriReviewTarget[]): void {
    if (this.disposed) {
      return;
    }

    for (const target of targets) {
      this.pendingReviewChangeTargetsByKey.set(getUriReviewTargetKey(target), target);
    }
    if (this.scheduledReviewChange || !this.pendingReviewChangeTargetsByKey.size) {
      return;
    }

    this.scheduledReviewChange = disposableTimeout(() => {
      this.scheduledReviewChange?.dispose();
      this.scheduledReviewChange = null;
      const changedTargets = [...this.pendingReviewChangeTargetsByKey.values()];
      this.pendingReviewChangeTargetsByKey.clear();
      if (changedTargets.length) {
        this.onDidChangeReviewEmitter.fire(changedTargets);
      }
    }, ReviewChangeBatchDelayMs);
  }

  private trackUriReviewTarget(key: string, target: NormalizedUriReviewTarget): void {
    this.uriReviewTargetsByKey.set(key, target, Touch.AsNew);
  }

  private storeUriReviewCacheEntry(
    key: string,
    entry: UriReviewCacheEntry,
    persistence: "background" | "none" = "background",
  ): void {
    const target = this.uriReviewTargetsByKey.get(key, Touch.AsNew);
    if (!target) {
      return;
    }

    this.uriReviewCacheByKey.delete(key);
    this.uriReviewCacheByKey.set(key, entry);
    this.staleUriReviewKeys.delete(key);
    this.pendingUriReviewRefreshTargetsByKey.delete(key);
    if (persistence === "background") {
      this.queuePersistedReview(target, entry);
    }
  }

  private deleteUriReviewCacheEntry(key: string): void {
    this.uriReviewCacheByKey.delete(key);
    this.staleUriReviewKeys.delete(key);
    this.pendingUriReviewRefreshTargetsByKey.delete(key);
  }

  private evictUriReviewTarget(key: string): void {
    const target = this.uriReviewTargetsByKey.get(key);
    const hadCachedReview = this.uriReviewCacheByKey.has(key);
    const hasActiveReview = this.activeUriReviewsByKey.has(key);
    this.uriReviewTargetsByKey.delete(key);
    this.uriReviewCacheByKey.delete(key);
    this.staleUriReviewKeys.delete(key);
    this.pendingUriReviewRefreshTargetsByKey.delete(key);
    if (hasActiveReview) {
      this.uriReviewGenerationByKey.set(key, this.getUriReviewGeneration(key) + 1);
    } else {
      this.uriReviewGenerationByKey.delete(key);
    }
    if (target && hadCachedReview) {
      this.fireReviewChange(target);
    }
  }

  private clearUriReviewState(): void {
    this.workspaceGeneration += 1;
    this.scheduledReviewChange?.dispose();
    this.scheduledReviewChange = null;
    this.scheduledUriReviewRefresh?.dispose();
    this.scheduledUriReviewRefresh = null;
    this.staleUriReviewKeys.clear();
    this.activeUriReviewsByKey.clear();
    this.activeUriReevaluationsByKey.clear();
    this.pendingUriReviewRefreshTargetsByKey.clear();
    this.pendingReviewChangeTargetsByKey.clear();
    this.uriReviewCacheByKey.clear();
    this.uriReviewGenerationByKey.clear();
    this.uriReviewTargetsByKey.clear();
    this.attemptedPersistedReviewKeys.clear();
  }

  private restorePersistedReview(
    target: NormalizedUriReviewTarget,
  ): Promise<void> | undefined {
    const storageKey = this.getPersistedReviewStorageKey(target);
    if (
      !storageKey ||
      !this.storageService ||
      !this.fileService ||
      this.attemptedPersistedReviewKeys.has(storageKey)
    ) {
      return;
    }
    this.attemptedPersistedReviewKeys.add(storageKey);
    return this.doRestorePersistedReview(storageKey, target);
  }

  private async doRestorePersistedReview(
    storageKey: string,
    target: NormalizedUriReviewTarget,
  ): Promise<void> {
    if (!this.storageService || !this.fileService) {
      return;
    }
    const persisted = this.storageService.getObject<PersistedUriReview>(
      storageKey,
      StorageScope.WORKSPACE,
    );
    if (!persisted) {
      return;
    }

    try {
      const stat = await this.fileService.stat(target.resource);
      const userTemplateSnapshot = this.userTemplateService.getSnapshot();
      if (
        persisted.version !== PersistedReviewVersion ||
        persisted.fileMtime !== stat.mtime ||
        persisted.fileSize !== stat.size ||
        persisted.schemaProfileVersion !== (this.schemaProfileService?.getVersion() ?? 0) ||
        persisted.userTemplateVersion !== userTemplateSnapshot.version ||
        persisted.userTemplateEffectiveFingerprint !== userTemplateSnapshot.effectiveFingerprint ||
        !isCurrentUriReviewCacheEntry(persisted.entry) ||
        !isPersistedReviewResultValid(persisted.entry.result) ||
        persisted.entry.result.reviewEngineVersion !== REVIEW_ENGINE_VERSION ||
        persisted.entry.result.reviewPolicyVersion !== REVIEW_POLICY_VERSION ||
        persisted.entry.result.userTemplateCatalogVersion !== persisted.userTemplateVersion ||
        persisted.entry.result.userTemplateEffectiveFingerprint !==
          persisted.userTemplateEffectiveFingerprint ||
        (
          target.contentHash !== undefined &&
          persisted.entry.contentHash !== target.contentHash
        )
      ) {
        this.storageService.remove(storageKey, StorageScope.WORKSPACE);
        return;
      }

      const {
        sheetId: _persistedSheetId,
        ...persistedResult
      } = persisted.entry.result;
      const result: ReviewResult = {
        ...persistedResult,
        resource: target.resource,
        ...(target.sheetId ? { sheetId: target.sheetId } : {}),
      };
      const entry: UriReviewCacheEntry = {
        ...persisted.entry,
        result,
        reviewSignature: createReviewResultSignature(result),
        summary: createReviewSummaryFromResult({
          resource: target.resource,
          result,
          sheetId: target.sheetId,
        }),
      };
      const key = getUriReviewTargetKey(target);
      this.trackUriReviewTarget(key, target);
      this.uriReviewCacheByKey.set(key, entry);
      this.fireReviewChange(target);
    } catch {
      this.storageService.remove(storageKey, StorageScope.WORKSPACE);
    }
  }

  private queuePersistedReview(
    target: NormalizedUriReviewTarget,
    entry: UriReviewCacheEntry,
  ): void {
    if (!entry.result || !this.storageService || !this.fileService) {
      return;
    }

    const storageKey = this.getPersistedReviewStorageKey(target);
    if (!storageKey) {
      return;
    }

    const persistence = this.persistReview(storageKey, target, entry)
      .then(() => undefined)
      .catch(error => {
        console.warn("Failed to persist Review result.", error);
      });
    this.pendingPersistence.add(persistence);
    void persistence.finally(() => this.pendingPersistence.delete(persistence));
  }

  private async persistReevaluatedReview(
    target: NormalizedUriReviewTarget,
    entry: UriReviewCacheEntry,
    isCurrent: () => boolean,
  ): Promise<ReviewReevaluationResult["persistence"]> {
    if (!this.storageService || !this.fileService) {
      return "unavailable";
    }

    const storageKey = this.getPersistedReviewStorageKey(target);
    if (!storageKey) {
      return "unavailable";
    }
    if (!entry.result) {
      if (!isCurrent()) {
        return "unavailable";
      }
      this.storageService.remove(storageKey, StorageScope.WORKSPACE);
      await this.storageService.flush();
      return "cleared";
    }

    const stored = await this.persistReview(storageKey, target, entry, isCurrent);
    if (!stored) {
      return "unavailable";
    }
    await this.storageService.flush();
    return "stored";
  }

  private async persistReview(
    storageKey: string,
    target: NormalizedUriReviewTarget,
    entry: UriReviewCacheEntry,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    if (!this.storageService || !this.fileService) {
      return false;
    }

    const stat = await this.fileService.stat(target.resource);
    const userTemplateSnapshot = this.userTemplateService.getSnapshot();
    if (
      !isCurrent() ||
      entry.result?.userTemplateCatalogVersion !== userTemplateSnapshot.version ||
      entry.result.userTemplateEffectiveFingerprint !==
        userTemplateSnapshot.effectiveFingerprint
    ) {
      return false;
    }
    this.storageService.store(
      storageKey,
      {
        version: PersistedReviewVersion,
        fileMtime: stat.mtime,
        fileSize: stat.size,
        schemaProfileVersion: this.schemaProfileService?.getVersion() ?? 0,
        userTemplateEffectiveFingerprint:
          entry.result.userTemplateEffectiveFingerprint,
        userTemplateVersion: entry.result.userTemplateCatalogVersion,
        entry,
      } satisfies PersistedUriReview,
      StorageScope.WORKSPACE,
      StorageTarget.MACHINE,
    );
    return true;
  }

  private async flushPendingPersistence(): Promise<void> {
    if (!this.storageService) {
      return;
    }

    await Promise.all([...this.pendingPersistence]);
    await this.storageService.flush();
  }

  private getPersistedReviewStorageKey(
    target: NormalizedUriReviewTarget,
  ): string | null {
    const relativePath =
      this.workspaceContextService?.getWorkspaceRelativePath(target.resource);
    if (!relativePath) {
      return null;
    }

    return `${PersistedReviewStoragePrefix}${encodeURIComponent(relativePath)}:${encodeURIComponent(target.sheetId ?? "")}`;
  }

  private markUriReviewTargetStale(key: string): void {
    this.staleUriReviewKeys.add(key);
    this.uriReviewGenerationByKey.set(key, this.getUriReviewGeneration(key) + 1);
  }

  private markStaleUriReviewCacheEntryForRefresh(key: string, target: NormalizedUriReviewTarget): void {
    if (this.staleUriReviewKeys.has(key)) {
      return;
    }

    this.markUriReviewTargetStale(key);
    this.queueUriReviewRefresh(key, target);
    this.fireReviewChange(target);
  }

  private queueUriReviewRefresh(key: string, target: NormalizedUriReviewTarget): void {
    if (this.disposed) {
      return;
    }

    this.pendingUriReviewRefreshTargetsByKey.set(key, target);
    this.scheduleUriReviewRefresh();
  }

  private scheduleUriReviewRefresh(): void {
    if (this.disposed || this.scheduledUriReviewRefresh || !this.pendingUriReviewRefreshTargetsByKey.size) {
      return;
    }

    this.scheduledUriReviewRefresh = disposableTimeout(() => {
      this.scheduledUriReviewRefresh?.dispose();
      this.scheduledUriReviewRefresh = null;
      this.flushPendingUriReviewRefreshes();
    }, ReviewChangeBatchDelayMs);
  }

  private flushPendingUriReviewRefreshes(): void {
    if (this.disposed || !this.pendingUriReviewRefreshTargetsByKey.size) {
      return;
    }

    const pendingRefreshes = Array.from(this.pendingUriReviewRefreshTargetsByKey);
    this.pendingUriReviewRefreshTargetsByKey.clear();
    for (const [key, target] of pendingRefreshes) {
      if (!this.staleUriReviewKeys.has(key) || !this.uriReviewTargetsByKey.get(key)) {
        continue;
      }

      const activeReview = this.activeUriReviewsByKey.get(key);
      if (activeReview) {
        this.pendingUriReviewRefreshTargetsByKey.set(key, target);
        void activeReview.promise.then(
          () => this.scheduleUriReviewRefresh(),
          () => this.scheduleUriReviewRefresh(),
        );
        continue;
      }

      void this.resolveCurrentUriReviewCacheEntry(target);
    }
  }

  private getUriReviewGeneration(key: string): number {
    return this.uriReviewGenerationByKey.get(key) ?? 0;
  }

  private startUriReview(
    key: string,
    target: NormalizedUriReviewTarget,
    token: CancellationToken = CancellationToken.None,
  ): ActiveUriReview {
    const generation = this.getUriReviewGeneration(key);
    const workspaceGeneration = this.workspaceGeneration;
    const promise = this.resolveUriReviewSummary(target, token).finally(() => {
      if (this.activeUriReviewsByKey.get(key)?.promise === promise) {
        this.activeUriReviewsByKey.delete(key);
        if (!this.uriReviewTargetsByKey.get(key)) {
          this.uriReviewGenerationByKey.delete(key);
        }
      }
    });
    const review = { generation, promise, workspaceGeneration };
    this.activeUriReviewsByKey.set(key, review);
    this.fireReviewChange(target);
    return review;
  }

  private async resolveUriReviewSummary(
    target: NormalizedUriReviewTarget,
    token: CancellationToken = CancellationToken.None,
  ): Promise<UriReviewCacheEntry | null> {
    if (!this.dataResourceService) {
      return null;
    }

    let reference: IDataResourceStructuredEvidenceReference | null = null;
    try {
      reference = await this.dataResourceService.resolveStructuredEvidence(
        createDataResourceStructuredContentTarget(target),
        token,
      );
      return this.createUriReviewSummaryFromStructuredContent(target, reference.object);
    } catch (error) {
      if (token.isCancellationRequested) {
        return null;
      }
      return {
        modelSignature: createUriReviewErrorSignature(target, error),
        reviewEngineVersion: REVIEW_ENGINE_VERSION,
        reviewPolicyVersion: REVIEW_POLICY_VERSION,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.structuredContentResolveFailed"],
          message: getErrorMessage(error),
        },
      };
    } finally {
      reference?.dispose();
    }
  }

  private async createUriReviewSummaryFromStructuredContent(
    target: NormalizedUriReviewTarget,
    resolution: DataResourceStructuredEvidenceResolution,
  ): Promise<UriReviewCacheEntry> {
    const userTemplateSnapshot = this.userTemplateService.getSnapshot();
    const modelSignature = createUriReviewModelSignature({
      resolution,
      schemaProfileVersion: this.schemaProfileService?.getVersion() ?? 0,
      target,
      userTemplateEffectiveFingerprint: userTemplateSnapshot.effectiveFingerprint,
      userTemplateVersion: userTemplateSnapshot.version,
    });
    if (resolution.kind === "loadError") {
      return {
        modelSignature,
        reviewEngineVersion: REVIEW_ENGINE_VERSION,
        reviewPolicyVersion: REVIEW_POLICY_VERSION,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.structuredContentLoadFailed"],
          message: resolution.loadState.message,
        },
      };
    }
    if (resolution.kind === "pending") {
      return {
        modelSignature,
        reviewEngineVersion: REVIEW_ENGINE_VERSION,
        reviewPolicyVersion: REVIEW_POLICY_VERSION,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "pending",
          findingCodes: [],
        },
      };
    }

    if (resolution.kind === "missingSheet") {
      return {
        modelSignature,
        reviewEngineVersion: REVIEW_ENGINE_VERSION,
        reviewPolicyVersion: REVIEW_POLICY_VERSION,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.sheetNotFound"],
          message: "Review needs the requested sheet.",
        },
      };
    }
    if (resolution.kind === "missingContent") {
      return {
        modelSignature,
        reviewEngineVersion: REVIEW_ENGINE_VERSION,
        reviewPolicyVersion: REVIEW_POLICY_VERSION,
        summary: {
          resource: target.resource,
          ...(target.sheetId ? { sheetId: target.sheetId } : {}),
          state: "invalid",
          findingCodes: ["review.noStructuredContent"],
          message: "Review needs resolved structured content.",
        },
      };
    }

    const structuredContent = resolution.snapshot;
    const sheetId = target.sheetId;
    const result = deriveReviewResult({
      columnCount: structuredContent.columnCount,
      contentHash: target.contentHash,
      evidence: createReviewEvidenceFromStructuredContent(structuredContent),
      fileName: structuredContent.fileName,
      modelVersion: structuredContent.sourceModelVersion,
      resource: target.resource,
      rowCount: structuredContent.rowCount,
      schemaProfileSnapshot: this.schemaProfileService?.getSnapshot(),
      sheetId: sheetId ?? undefined,
      sourceVersion: structuredContent.sourceVersion,
      userTemplateSnapshot,
    });
    const reviewSignature = createReviewResultSignature(result);

    return {
      columnCount: structuredContent.columnCount,
      fileName: structuredContent.fileName,
      ...(target.contentHash ? { contentHash: target.contentHash } : {}),
      modelSignature,
      result,
      reviewEngineVersion: REVIEW_ENGINE_VERSION,
      reviewPolicyVersion: REVIEW_POLICY_VERSION,
      reviewSignature,
      rowCount: structuredContent.rowCount,
      sourceModelVersion: structuredContent.sourceModelVersion,
      sourceVersion: structuredContent.sourceVersion,
      summary: createReviewSummaryFromResult({
        resource: target.resource,
        result,
        sheetId,
      }),
    };
  }

  private invalidateUriReviewTargetsForResource(resource: URI): void {
    const resourceIdentity = normalizeResourceIdentity(resource);
    if (!resourceIdentity) {
      return;
    }

    const changedTargets: NormalizedUriReviewTarget[] = [];
    for (const [key, target] of this.uriReviewTargetsByKey) {
      if (normalizeResourceIdentity(target.resource) !== resourceIdentity) {
        continue;
      }
      if (!this.uriReviewCacheByKey.has(key)) {
        continue;
      }
      this.markUriReviewTargetStale(key);
      this.queueUriReviewRefresh(key, target);
      changedTargets.push(target);
    }
    if (changedTargets.length) {
      this.fireReviewChange(...changedTargets);
    }
  }

  private invalidateAllUriReviewTargets(): void {
    if (!this.uriReviewTargetsByKey.size) {
      return;
    }

    const changedTargets: NormalizedUriReviewTarget[] = [];
    for (const [key, target] of this.uriReviewTargetsByKey) {
      if (this.uriReviewCacheByKey.has(key)) {
        this.markUriReviewTargetStale(key);
        this.queueUriReviewRefresh(key, target);
        changedTargets.push(target);
      }
    }
    if (changedTargets.length) {
      this.fireReviewChange(...changedTargets);
    }
  }

  private resolveManualTemplate(
    selection: ManualTemplateSelection,
  ): ManualTemplateLookupResult {
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
        kind: "user",
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
  readonly review: CandidateReview;
};

const createSchemaProfileConfirmationFromReviewedTemplate = ({
  reviewedTemplate,
  snapshot,
}: {
  readonly reviewedTemplate: ReviewedTemplate;
  readonly snapshot: DataResourceStructuredContentSnapshot;
}): ConfirmSchemaProfileInput | null => {
  const schemaFingerprint = normalizeText(snapshot.structuredContent.structure.fingerprint);
  const columnProfiles = snapshot.structuredContent.columnProfiles;
  if (!schemaFingerprint || !columnProfiles.length) {
    return null;
  }

  const measurementColumnsByRawCol = createMeasurementColumnsByRawCol(
    snapshot.structuredContent.blocks.flatMap(block => block.columns.columns),
  );
  const columnProfilesByRawCol = createColumnProfilesByRawCol(columnProfiles);
  const bindings: SchemaProfileConfirmationBinding[] = [];
  const seen = new Set<string>();
  let hasUnconfirmedAxisColumn = false;
  for (const block of reviewedTemplate.template.blocks) {
    hasUnconfirmedAxisColumn = !addSchemaProfileAxisBindings({
      axis: "x",
      axisColumns: block.x.columns,
      axisUnit: block.x.unit,
      bindings,
      columnProfilesByRawCol,
      measurementColumnsByRawCol,
      seen,
    }) || hasUnconfirmedAxisColumn;
    hasUnconfirmedAxisColumn = !addSchemaProfileAxisBindings({
      axis: "y",
      axisColumns: block.y.columns,
      axisUnit: block.y.unit,
      bindings,
      columnProfilesByRawCol,
      measurementColumnsByRawCol,
      seen,
    }) || hasUnconfirmedAxisColumn;
  }

  return bindings.length && !hasUnconfirmedAxisColumn
    ? {
      schemaFingerprint,
      columnProfiles,
      bindings,
    }
    : null;
};

const addSchemaProfileAxisBindings = ({
  axis,
  axisColumns,
  axisUnit,
  bindings,
  columnProfilesByRawCol,
  measurementColumnsByRawCol,
  seen,
}: {
  readonly axis: "x" | "y";
  readonly axisColumns: readonly number[];
  readonly axisUnit?: string;
  readonly bindings: SchemaProfileConfirmationBinding[];
  readonly columnProfilesByRawCol: ReadonlyMap<number, StructuredColumnProfile>;
  readonly measurementColumnsByRawCol: ReadonlyMap<number, StructuredMeasurementColumnRef>;
  readonly seen: Set<string>;
}): boolean => {
  for (const column of axisColumns) {
    const rawCol = normalizeColumnIndex(column);
    if (rawCol === undefined) {
      return false;
    }

    if (!columnProfilesByRawCol.has(rawCol)) {
      return false;
    }

    const measurementColumn = measurementColumnsByRawCol.get(rawCol);
    const role = normalizeStructuredRole(measurementColumn?.role);
    if (!role || role === "unknown") {
      return false;
    }

    const canonicalUnit = normalizeStructuredCanonicalUnit(measurementColumn?.unit ?? axisUnit);
    const key = `${rawCol}\u0000${axis}\u0000${role}\u0000${canonicalUnit ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    bindings.push({
      rawCol,
      role,
      axis,
      canonicalUnit,
    });
  }

  return true;
};

const createColumnProfilesByRawCol = (
  columnProfiles: readonly StructuredColumnProfile[],
): ReadonlyMap<number, StructuredColumnProfile> => {
  const result = new Map<number, StructuredColumnProfile>();
  for (const profile of columnProfiles) {
    const rawCol = normalizeColumnIndex(profile.rawCol);
    if (rawCol === undefined) {
      continue;
    }

    result.set(rawCol, profile);
  }
  return result;
};

const createMeasurementColumnsByRawCol = (
  columns: readonly StructuredMeasurementColumnRef[],
): ReadonlyMap<number, StructuredMeasurementColumnRef> => {
  const result = new Map<number, StructuredMeasurementColumnRef>();
  for (const column of columns) {
    const rawCol = normalizeColumnIndex(column.rawCol);
    if (rawCol === undefined) {
      continue;
    }

    const existing = result.get(rawCol);
    if (!existing || normalizeConfidence(column.confidence) > normalizeConfidence(existing.confidence)) {
      result.set(rawCol, column);
    }
  }
  return result;
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
    case "user":
      return "review.manual.userTemplate";
    case "dataResource":
      return "review.manual.dataResourceReviewedTemplate";
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
  readonly sheetId?: string;
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
      ...(decision.reviewedTemplate.reviewedType ? { reviewedType: decision.reviewedTemplate.reviewedType } : {}),
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

const createResourceReviewExecutionFromCacheEntry = (
  entry: UriReviewCacheEntry,
): ResourceReviewExecution | null => {
  if (
    !entry.reviewSignature ||
    !isNonNegativeInteger(entry.sourceModelVersion) ||
    !isNonNegativeInteger(entry.sourceVersion) ||
    !isNonNegativeInteger(entry.rowCount) ||
    !isNonNegativeInteger(entry.columnCount)
  ) {
    return null;
  }

  const systemRecommendedReviewedTemplate = getSystemRecommendedReviewedTemplate(entry.result);
  return {
    resource: entry.summary.resource,
    ...(entry.summary.sheetId ? { sheetId: entry.summary.sheetId } : {}),
    ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
    summary: entry.summary,
    reviewSignature: entry.reviewSignature,
    sourceModelVersion: entry.sourceModelVersion,
    sourceVersion: entry.sourceVersion,
    rowCount: entry.rowCount,
    columnCount: entry.columnCount,
    ...(entry.fileName !== undefined ? { fileName: entry.fileName } : {}),
    ...(systemRecommendedReviewedTemplate ? { systemRecommendedReviewedTemplate } : {}),
  };
};

const isCurrentUriReviewCacheEntry = (
  entry: UriReviewCacheEntry,
): boolean =>
  entry.reviewEngineVersion === REVIEW_ENGINE_VERSION &&
  entry.reviewPolicyVersion === REVIEW_POLICY_VERSION;

const isPersistedReviewResultValid = (
  result: ReviewResult | undefined,
): result is ReviewResult => {
  if (!result || !result.decision || !Array.isArray(result.reviews)) {
    return false;
  }

  if (result.decision.kind !== "ready") {
    return true;
  }

  try {
    return createTemplateFingerprint(result.decision.reviewedTemplate.template) ===
      result.decision.reviewedTemplate.templateFingerprint;
  } catch {
    return false;
  }
};

const getSystemRecommendedReviewedTemplate = (
  result: ReviewResult | undefined,
): ReviewedTemplate | undefined =>
  result?.decision.kind === "ready" &&
  result.decision.application.kind === "systemRecommended"
    ? result.decision.reviewedTemplate
    : undefined;

const isNonNegativeInteger = (
  value: number | undefined,
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0;

const createStaleReviewSummaryFromCacheEntry = (
  entry: UriReviewCacheEntry,
  target: NormalizedUriReviewTarget,
): ReviewSummary => ({
  resource: target.resource,
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
  state: "stale",
  ...(entry.summary.confidence !== undefined ? { confidence: entry.summary.confidence } : {}),
  ...(entry.summary.reviewedType ? { reviewedType: entry.summary.reviewedType } : {}),
  ...(entry.summary.reviewedSemanticLabel ? { reviewedSemanticLabel: entry.summary.reviewedSemanticLabel } : {}),
  findingCodes: distinctReviewFindingCodes([
    "review.stale",
    ...entry.summary.findingCodes,
  ]),
  message: "Review is stale. Waiting for updated review.",
});

const createReviewResultSignature = (
  result: ReviewResult,
): string => [
  normalizeResourceIdentity(result.resource),
  result.sheetId ?? "",
  result.contentHash ?? "",
  result.modelVersion ?? "",
  result.sourceVersion ?? "",
  result.evidenceFingerprint,
  result.semanticRulesFingerprint,
  result.userTemplateCatalogVersion,
  result.userTemplateEffectiveFingerprint,
  result.reviewEngineVersion,
  result.reviewPolicyVersion,
  result.decision.kind,
  result.decision.kind === "ready" ? result.decision.reviewedTemplate.reviewedType ?? "" : "",
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
): NormalizedUriReviewTarget | null => {
  const resource = URI.revive(target.resource);
  const resourceIdentity = normalizeResourceIdentity(resource);
  if (!resourceIdentity) {
    return null;
  }
  const contentHash = normalizeText(target.contentHash);
  const sheetId = normalizeText(target.sheetId);

  return {
    resource,
    ...(contentHash ? { contentHash } : {}),
    ...(sheetId ? { sheetId } : {}),
  };
};

const getUriReviewTargetKey = (
  target: NormalizedUriReviewTarget,
): string => [
  normalizeResourceIdentity(target.resource),
  target.contentHash ?? "",
  target.sheetId ?? "",
].join("\u001f");

const createDataResourceStructuredContentTarget = (
  target: NormalizedUriReviewTarget,
): DataResourceStructuredContentTarget => ({
  resource: target.resource,
  ...(target.contentHash ? { contentHash: target.contentHash } : {}),
  ...(target.sheetId ? { sheetId: target.sheetId } : {}),
});

const createReviewEvidenceFromStructuredContent = (
  snapshot: DataResourceStructuredEvidenceSnapshot,
): ReviewEvidence => ({
  sourceMetadata: {
    columnCount: snapshot.columnCount,
    ...(snapshot.contentHash ? { contentHash: snapshot.contentHash } : {}),
    fileName: snapshot.fileName,
    rowCount: snapshot.rowCount,
    sourceModelVersion: snapshot.sourceModelVersion,
    sourceUri: snapshot.sourceUri,
    sourceVersion: snapshot.sourceVersion,
  },
  structuredContent: snapshot.structuredContent,
});

const createUriReviewModelSignature = ({
  resolution,
  schemaProfileVersion,
  target,
  userTemplateEffectiveFingerprint,
  userTemplateVersion,
}: {
  readonly resolution: DataResourceStructuredEvidenceResolution;
  readonly schemaProfileVersion: number;
  readonly target: NormalizedUriReviewTarget;
  readonly userTemplateEffectiveFingerprint: string;
  readonly userTemplateVersion: number;
}): string => [
  getUriReviewTargetKey(target),
  resolution.kind,
  resolution.kind === "ready" ? resolution.snapshot.sourceModelVersion : "",
  resolution.kind === "ready" ? resolution.snapshot.sourceVersion : "",
  resolution.kind === "loadError" ? resolution.loadState.message : "",
  target.contentHash ?? "",
  resolution.kind === "ready" ? resolution.snapshot.structuredContent.semanticRulesFingerprint : "",
  schemaProfileVersion,
  userTemplateEffectiveFingerprint,
  userTemplateVersion,
].join("\u001f");

const createUriReviewErrorSignature = (
  target: NormalizedUriReviewTarget,
  error: unknown,
): string => [
  getUriReviewTargetKey(target),
  "error",
  getErrorMessage(error),
].join("\u001f");

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

const normalizeColumnIndex = (
  value: unknown,
): number | undefined => {
  const column = Math.floor(Number(value));
  return Number.isFinite(column) && column >= 0 ? column : undefined;
};

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

const normalizeStructuredRole = (
  value: unknown,
): StructuredMeasurementColumnRole | null => {
  if (
    value === "vd" ||
    value === "vg" ||
    value === "vs" ||
    value === "id" ||
    value === "ig" ||
    value === "is" ||
    value === "capacitance" ||
    value === "conductance" ||
    value === "frequency" ||
    value === "time" ||
    value === "voltage" ||
    value === "current" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
};

const normalizeStructuredCanonicalUnit = (
  value: unknown,
): StructuredCanonicalUnit | null =>
  value === "V" ||
  value === "A" ||
  value === "ohm" ||
  value === "s" ||
  value === "F" ||
  value === "Hz" ||
  value === "S"
    ? value
    : null;

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
  ReviewService as unknown as new (...services: BrandedService[]) => IReviewService,
  InstantiationType.Delayed,
);
