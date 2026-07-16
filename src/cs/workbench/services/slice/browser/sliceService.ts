/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
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
	ISliceService,
	type ISliceService as ISliceServiceType,
	type SliceExecutionResult,
	type SliceFileState,
	type SlicePlan,
	type SlicePlanRangeRef,
	type SliceState,
	type SliceResourceBaseCurveRecord,
	type SliceResourceRequest,
	type SliceResourceResult,
	type SliceResourceRun,
	type SliceResourceSeriesRecord,
} from "src/cs/workbench/services/slice/common/slice";
import {
	IDataResourceService,
	type DataResourceStructuredContentSnapshot,
	type IDataResourceService as IDataResourceServiceType,
	type IDataResourceStructuredContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	type StructuredContentGridSnapshot,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	getPerfNow,
	startPerf,
} from "src/cs/workbench/common/perf";
import { executeSlicePlan } from "src/cs/workbench/services/slice/common/sliceExecutor";
import {
	createSliceExecutionRowsFromStructuredContent,
} from "src/cs/workbench/services/slice/common/sliceStructuredContent";
import {
	createSlicePlan,
} from "src/cs/workbench/services/slice/common/slicePlanner";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import {
	areTemplateSelectionsEqual,
	normalizeTemplateSelectionResource,
	type TemplateSelection,
	type TemplateResourceSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
	IUserTemplateService,
	type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type SliceResourceIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

type ResourceSliceQueueEntry = {
	readonly kind: "resource";
	readonly request: SliceResourceRequest;
	readonly plan: SlicePlan;
	readonly workspaceGeneration: number;
};

type SliceQueueEntry = ResourceSliceQueueEntry;

type ResolvedResourceSliceRows = {
	readonly content: StructuredContentGridSnapshot;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
};

const PersistedTemplateSelectionVersion = 1;
const PersistedTemplateSelectionStoragePrefix = "slice.templateSelection.v1:";

type PersistedTemplateSelection = {
	readonly version: typeof PersistedTemplateSelectionVersion;
	readonly relativePath: string;
	readonly sheetId: string | null;
	readonly templateId: string;
};

export class SliceService extends Disposable implements ISliceServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSliceStateEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeSliceState = this.onDidChangeSliceStateEmitter.event;
	private readonly onDidChangeResourceSliceResultEmitter = this._register(new Emitter<SliceResourceIdentity>());
	public readonly onDidChangeResourceSliceResult = this.onDidChangeResourceSliceResultEmitter.event;
	private readonly onDidChangeTemplateSelectionEmitter = this._register(new Emitter<SliceResourceIdentity>());
	public readonly onDidChangeTemplateSelection = this.onDidChangeTemplateSelectionEmitter.event;

	private readonly resourceStatesByCacheKey = new Map<string, SliceFileState>();
	private readonly resourcesByCacheKey = new Map<string, SliceResourceIdentity>();
	private readonly queue: SliceQueueEntry[] = [];
	private readonly resourceResultsByCacheKey = new Map<string, SliceResourceResult>();
	private readonly templateSelectionsByResource = new Map<string, TemplateResourceSelection>();
	private readonly runningSliceQueueGenerations = new Set<number>();
	private activeQueueKey: string | null = null;
	private isChangingWorkspace = false;
	private workspaceGeneration = 0;

	public constructor(
		@IDataResourceService private readonly dataResourceService?: IDataResourceServiceType,
		@IStorageService private readonly storageService?: IStorageServiceType,
		@IWorkspaceContextService private readonly workspaceContextService?: IWorkspaceContextServiceType,
		@IUserTemplateService private readonly userTemplateService?: IUserTemplateServiceType,
	) {
		super();
		if (this.dataResourceService) {
			this._register(this.dataResourceService.onDidChangeResource(resource => {
				this.removeResourceResultsForResource(resource);
			}));
		}
		if (this.workspaceContextService) {
			this._register(this.workspaceContextService.onWillChangeWorkspaceFolders(event => {
				this.isChangingWorkspace = true;
				event.join(this.storageService?.flush() ?? Promise.resolve());
			}));
			this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
				this.clearWorkspaceState();
				this.restorePersistedTemplateSelections();
				this.isChangingWorkspace = false;
				this.fireSliceStateChange();
			}));
		}
		if (this.userTemplateService) {
			this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
				if (!this.isChangingWorkspace) {
					this.removeMissingTemplateSelections();
				}
			}));
		}
		this.restorePersistedTemplateSelections();
	}

	public getState(): SliceState {
		return {
			queueLength: this.queue.length,
			templateSelections: [...this.templateSelectionsByResource.values()],
		};
	}

	public getResourceResult(resource: URI, sheetId?: string | null): SliceResourceResult | null {
		return this.resourceResultsByCacheKey.get(createSliceResourceCacheKey(resource, sheetId)) ?? null;
	}

	public getResourceState(resource: URI, sheetId?: string | null): SliceFileState | undefined {
		return this.resourceStatesByCacheKey.get(createSliceResourceCacheKey(resource, sheetId));
	}

	public getTemplateSelection(resource: URI, sheetId?: string | null): TemplateSelection {
		const normalizedResource = normalizeTemplateSelectionResource({ resource, sheetId });
		if (!normalizedResource) {
			return { kind: "auto" };
		}
		return this.templateSelectionsByResource.get(createSliceResourceCacheKey(normalizedResource.resource, normalizedResource.sheetId))?.selection ?? { kind: "auto" };
	}

	public submitResource(requests: readonly SliceResourceRequest[]): void {
		let didChange = false;
		for (const request of requests) {
			const cacheKey = createSliceResourceCacheKey(request.resource, request.sheetId);
			this.resourcesByCacheKey.set(cacheKey, normalizeSliceResource(request.resource, request.sheetId));
			const plan = this.createResourceRequestPlan(request);
			if (!plan) {
				didChange = this.setResourceState(cacheKey, {
					state: "skipped",
					code: "slice.resourceRequestInvalid",
					message: "The resource slice request is no longer valid.",
				}) || didChange;
				continue;
			}

			if (request.trigger.kind === "reviewDecision" && this.isLatestResourceAutoRunCurrent(request, plan)) {
				didChange = this.setResourceState(cacheKey, { state: "ready" }) || didChange;
				continue;
			}

			this.enqueueSliceEntry({
				kind: "resource",
				request,
				plan,
				workspaceGeneration: this.workspaceGeneration,
			});
			didChange = this.setResourceState(cacheKey, { state: "queued" }) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
	}

	public prioritizeResource(resource: URI, sheetId?: string | null): void {
		const cacheKey = createSliceResourceCacheKey(resource, sheetId);
		if (!cacheKey) {
			return;
		}

		this.resourcesByCacheKey.set(cacheKey, normalizeSliceResource(resource, sheetId));
		this.prioritizeQueueKey(cacheKey);
	}

	private prioritizeQueueKey(queueKey: string): void {
		this.activeQueueKey = queueKey;
		const index = this.queue.findIndex(entry => getSliceQueueEntryStateKey(entry) === queueKey);
		if (index > 0) {
			const [entry] = this.queue.splice(index, 1);
			if (entry) {
				this.queue.unshift(entry);
			}
		}
		this.fireSliceStateChange();
	}

	public cancelResource(resources: readonly SliceResourceIdentity[]): void {
		const cacheKeys = new Set(
			resources
				.map(resource => createSliceResourceCacheKey(resource.resource, resource.sheetId))
				.filter(Boolean),
		);
		if (!cacheKeys.size) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			const queueKey = entry ? getSliceQueueEntryStateKey(entry) : null;
			if (!entry || !queueKey || !cacheKeys.has(queueKey)) {
				continue;
			}

			this.queue.splice(index, 1);
			if (this.activeQueueKey === queueKey) {
				this.activeQueueKey = null;
			}
			didChange = this.setResourceState(queueKey, { state: "none" }) || didChange;
			didChange = this.deleteResourceIfUnused(queueKey) || didChange;
		}

		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	public setTemplateSelection(resource: URI, sheetId: string | null | undefined, selection: TemplateSelection): void {
		const normalizedResource = normalizeTemplateSelectionResource({ resource, sheetId });
		if (!normalizedResource) {
			return;
		}

		const nextSelection = normalizeTemplateSelection(selection);
		const cacheKey = createSliceResourceCacheKey(normalizedResource.resource, normalizedResource.sheetId);
		if (areTemplateSelectionsEqual(
			this.templateSelectionsByResource.get(cacheKey)?.selection ?? { kind: "auto" },
			nextSelection,
		)) {
			return;
		}

		if (nextSelection.kind === "auto") {
			this.templateSelectionsByResource.delete(cacheKey);
		} else {
			this.templateSelectionsByResource.set(cacheKey, {
				resource: normalizedResource.resource,
				sheetId: normalizedResource.sheetId ?? null,
				selection: nextSelection,
			});
		}
		this.persistTemplateSelection(normalizedResource, nextSelection);
		this.onDidChangeTemplateSelectionEmitter.fire(normalizedResource);
		this.fireSliceStateChange();
	}

	private createResourceRequestPlan(request: SliceResourceRequest): SlicePlan | null {
		const normalizedResource = normalizeSliceResource(request.resource, request.sheetId);
		const plan = createSlicePlan({
			resource: normalizedResource.resource,
			sheetId: normalizedResource.sheetId ?? null,
			mode: request.trigger.kind === "reviewDecision" ? "auto" : "manual",
			selection: request.trigger.kind === "reviewDecision"
				? { kind: "auto" }
				: createTemplateSelectionFromReviewedTemplate(request.reviewedTemplate),
			sourceVersion: request.sourceVersion,
			sourceContentSignature: request.sourceContentSignature,
			template: request.reviewedTemplate.template,
			templateFingerprint: request.reviewedTemplate.templateFingerprint,
			rowCount: request.rowCount,
			columnCount: request.columnCount,
		});
		return plan.errors.length ? null : plan;
	}

	private startSliceQueue(): void {
		const workspaceGeneration = this.workspaceGeneration;
		if (
			this.runningSliceQueueGenerations.has(workspaceGeneration) ||
			!this.queue.length ||
			!this.canProcessQueuedSlices()
		) {
			return;
		}

		void this.drainSliceQueue(workspaceGeneration);
	}

	private enqueueSliceEntry(entry: SliceQueueEntry): void {
		const entryKey = getSliceQueueEntryKey(entry);
		const index = this.queue.findIndex(candidate => getSliceQueueEntryKey(candidate) === entryKey);
		if (index === -1) {
			this.queue.push(entry);
			return;
		}

		this.queue[index] = entry;
	}

	private async drainSliceQueue(workspaceGeneration: number): Promise<void> {
		if (
			workspaceGeneration !== this.workspaceGeneration ||
			this.runningSliceQueueGenerations.has(workspaceGeneration) ||
			!this.canProcessQueuedSlices()
		) {
			return;
		}

		this.runningSliceQueueGenerations.add(workspaceGeneration);
		try {
			while (workspaceGeneration === this.workspaceGeneration && this.queue.length) {
				const entry = this.queue.shift();
				if (!entry) {
					continue;
				}

				const queueKey = getSliceQueueEntryStateKey(entry);
				if (!queueKey) {
					continue;
				}

				this.setQueueEntryState(entry, { state: "processing" });
				this.fireSliceStateChange();

				await this.processResourceSliceEntry(entry);
			}
		} finally {
			this.runningSliceQueueGenerations.delete(workspaceGeneration);
			if (workspaceGeneration === this.workspaceGeneration && this.queue.length) {
				this.startSliceQueue();
			}
		}
	}

	private canProcessQueuedSlices(): boolean {
		return Boolean(this.dataResourceService) && this.queue.length > 0;
	}

	private async processResourceSliceEntry(entry: ResourceSliceQueueEntry): Promise<void> {
		const cacheKey = createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId);
		const endPerf = startPerf("sliceService.processResource", {
			blockCount: entry.plan.blocks.length,
			inputRangeCount: entry.plan.inputRanges.length,
			queueLength: this.queue.length,
			rowCount: entry.request.rowCount,
		});
		const resolveStartedAt = getPerfNow();
		const resolved = await this.readRowsForResourceRequest(entry.request);
		const resolveContentMs = getPerfNow() - resolveStartedAt;
		if (entry.workspaceGeneration !== this.workspaceGeneration) {
			endPerf({
				resolveContentMs,
				result: "staleWorkspace",
			});
			return;
		}
		if (!resolved) {
			this.setResourceState(cacheKey, {
				state: "failed",
				code: "slice.resourceRowsUnavailable",
				message: "Resource table rows are unavailable for slicing.",
			});
			this.fireSliceStateChange();
			endPerf({
				resolveContentMs,
				result: "rowsUnavailable",
			});
			return;
		}

		if (!this.isCurrentResourceSlicePlan(entry, resolved)) {
			this.dropStaleSliceEntry(entry);
			endPerf({
				resolveContentMs,
				result: "stalePlan",
			});
			return;
		}

		const projectRowsStartedAt = getPerfNow();
		const rows = createSliceExecutionRowsFromStructuredContent(
			resolved.content,
			entry.plan,
		);
		const projectRowsMs = getPerfNow() - projectRowsStartedAt;
		const executeStartedAt = getPerfNow();
		const execution = executeSlicePlan({
			plan: entry.plan,
			rows,
		});
		const executeMs = getPerfNow() - executeStartedAt;
		const result = createSliceResourceResult({
			execution,
			completedAt: Date.now(),
			request: entry.request,
			sourceModelVersion: resolved.sourceModelVersion,
			sourceVersion: resolved.sourceVersion,
		});
		this.resourceResultsByCacheKey.set(cacheKey, result);
		this.resourcesByCacheKey.set(cacheKey, normalizeSliceResource(entry.request.resource, entry.request.sheetId));
		this.fireResourceSliceResultChange(result.resource, result.sheetId);
		this.setResourceState(cacheKey, result.run.errors.length
			? {
				state: "failed",
				code: result.run.errors[0] ?? "slice.failed",
				message: "Slice failed.",
			}
			: { state: "ready" });
		this.fireSliceStateChange();
		endPerf({
			curveCount: execution.curves.length,
			errorCount: execution.run.errors.length,
			executeMs,
			numericRunCount: countStructuredContentNumericRuns(resolved.content),
			pointCount: execution.curves.reduce(
				(total, curve) => total + curve.points.length,
				0,
			),
			projectedRowCount: countProjectedRows(rows),
			projectRowsMs,
			resolveContentMs,
			result: execution.run.errors.length ? "failed" : "ready",
			seriesCount: execution.series.length,
			sparseRows: resolved.content.sparseRows === true,
			warningCount: execution.run.warnings.length,
		});
	}

	private isCurrentResourceSlicePlan(
		entry: ResourceSliceQueueEntry,
		resolved: ResolvedResourceSliceRows,
	): boolean {
		return entry.request.sourceModelVersion === resolved.sourceModelVersion &&
			entry.request.sourceVersion === resolved.sourceVersion &&
			entry.request.rowCount === resolved.content.rowCount &&
			entry.request.columnCount === resolved.content.columnCount &&
			entry.plan.sourceContentSignature === this.createResourceRequestPlan(entry.request)?.sourceContentSignature &&
			entry.plan.templateFingerprint === entry.request.reviewedTemplate.templateFingerprint;
	}

	private dropStaleSliceEntry(entry: SliceQueueEntry): void {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return;
		}

		if (this.queue.some(candidate => getSliceQueueEntryStateKey(candidate) === stateKey)) {
			this.setQueueEntryState(entry, { state: "queued" });
		} else {
			this.deleteQueueEntryState(entry);
		}
		this.fireSliceStateChange();
	}

	private async readRowsForResourceRequest(
		request: SliceResourceRequest,
	): Promise<ResolvedResourceSliceRows | null> {
		if (!this.dataResourceService) {
			return null;
		}

		let reference: IDataResourceStructuredContentReference | null = null;
		try {
			reference = await this.dataResourceService.resolveStructuredContent({
				resource: request.resource,
				sheetId: request.sheetId,
			});
			if (reference.object.kind !== "ready") {
				return null;
			}

			return createResolvedResourceSliceRows(reference.object.snapshot);
		} catch {
			return null;
		} finally {
			reference?.dispose();
		}
	}

	private isLatestResourceAutoRunCurrent(request: SliceResourceRequest, plan: SlicePlan): boolean {
		const result = this.resourceResultsByCacheKey.get(createSliceResourceCacheKey(request.resource, request.sheetId));
		if (!result) {
			return false;
		}

		const run = result.run;
		return run.mode === "auto" &&
			run.sourceContentSignature === plan.sourceContentSignature &&
			run.templateFingerprint === plan.templateFingerprint &&
			result.sourceModelVersion === request.sourceModelVersion &&
			result.sourceVersion === request.sourceVersion &&
			result.requestSignature === request.requestSignature &&
			run.errors.length === 0;
	}

	private setResourceState(cacheKey: string, state: SliceFileState): boolean {
		const current = this.resourceStatesByCacheKey.get(cacheKey);
		if (isSameSliceFileState(current, state)) {
			return false;
		}

		this.resourceStatesByCacheKey.set(cacheKey, state);
		return true;
	}

	private setQueueEntryState(entry: SliceQueueEntry, state: SliceFileState): boolean {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return false;
		}

		return this.setResourceState(stateKey, state);
	}

	private deleteQueueEntryState(entry: SliceQueueEntry): boolean {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return false;
		}

		const didDeleteState = this.resourceStatesByCacheKey.delete(stateKey);
		const didDeleteResource = this.deleteResourceIfUnused(stateKey);
		return didDeleteState || didDeleteResource;
	}

	private deleteResourceIfUnused(cacheKey: string): boolean {
		if (this.resourceResultsByCacheKey.has(cacheKey)) {
			return false;
		}

		return this.resourcesByCacheKey.delete(cacheKey);
	}

	private removeResourceResultsForResource(resource: URI): void {
		const cacheKey = normalizeResourceUri(resource);
		if (!cacheKey) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			if (entry && normalizeResourceUri(entry.request.resource) === cacheKey) {
				const entryCacheKey = createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId);
				this.queue.splice(index, 1);
				this.resourceStatesByCacheKey.delete(entryCacheKey);
				this.deleteResourceIfUnused(entryCacheKey);
				if (this.activeQueueKey === entryCacheKey) {
					this.activeQueueKey = null;
				}
				didChange = true;
			}
		}
		for (const [resultCacheKey, result] of this.resourceResultsByCacheKey) {
			if (normalizeResourceUri(result.resource) !== cacheKey) {
				continue;
			}
			this.resourceResultsByCacheKey.delete(resultCacheKey);
			this.resourceStatesByCacheKey.delete(resultCacheKey);
			this.resourcesByCacheKey.delete(resultCacheKey);
			if (this.activeQueueKey === resultCacheKey) {
				this.activeQueueKey = null;
			}
			this.fireResourceSliceResultChange(result.resource, result.sheetId);
			didChange = true;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private clearWorkspaceState(): void {
		this.workspaceGeneration += 1;
		const resultTargets = [...this.resourceResultsByCacheKey.values()]
			.map(result => normalizeSliceResource(result.resource, result.sheetId));
		const selectionTargets = [...this.templateSelectionsByResource.values()]
			.map(selection => normalizeSliceResource(selection.resource, selection.sheetId));
		this.queue.length = 0;
		this.activeQueueKey = null;
		this.resourceStatesByCacheKey.clear();
		this.resourcesByCacheKey.clear();
		this.resourceResultsByCacheKey.clear();
		this.templateSelectionsByResource.clear();
		for (const target of resultTargets) {
			this.fireResourceSliceResultChange(target.resource, target.sheetId);
		}
		for (const target of selectionTargets) {
			this.onDidChangeTemplateSelectionEmitter.fire(target);
		}
	}

	private restorePersistedTemplateSelections(): void {
		if (!this.storageService || !this.workspaceContextService) {
			return;
		}

		for (const storageKey of this.storageService.keys(StorageScope.WORKSPACE)) {
			if (!storageKey.startsWith(PersistedTemplateSelectionStoragePrefix)) {
				continue;
			}

			const persisted = this.storageService.getObject<PersistedTemplateSelection>(
				storageKey,
				StorageScope.WORKSPACE,
			);
			const selection = normalizePersistedTemplateSelection(persisted);
			const resource = selection
				? this.workspaceContextService.resolveWorkspaceRelativePath(selection.relativePath)
				: null;
			if (
				!selection ||
				!resource ||
				storageKey !== createPersistedTemplateSelectionStorageKey(
					selection.relativePath,
					selection.sheetId,
				) ||
				(this.userTemplateService && !this.userTemplateService.getTemplate(selection.templateId))
			) {
				this.storageService.remove(storageKey, StorageScope.WORKSPACE);
				continue;
			}

			const normalizedResource = normalizeSliceResource(resource, selection.sheetId);
			this.templateSelectionsByResource.set(
				createSliceResourceCacheKey(normalizedResource.resource, normalizedResource.sheetId),
				{
					...normalizedResource,
					selection: {
						kind: "saved",
						templateId: selection.templateId,
					},
				},
			);
			this.onDidChangeTemplateSelectionEmitter.fire(normalizedResource);
		}
	}

	private persistTemplateSelection(
		resource: SliceResourceIdentity,
		selection: TemplateSelection,
	): void {
		if (!this.storageService || !this.workspaceContextService) {
			return;
		}

		const relativePath = this.workspaceContextService.getWorkspaceRelativePath(resource.resource);
		if (!relativePath) {
			return;
		}

		const storageKey = createPersistedTemplateSelectionStorageKey(
			relativePath,
			resource.sheetId,
		);
		if (selection.kind === "auto") {
			this.storageService.remove(storageKey, StorageScope.WORKSPACE);
			return;
		}

		this.storageService.store(
			storageKey,
			{
				version: PersistedTemplateSelectionVersion,
				relativePath,
				sheetId: normalizeText(resource.sheetId) || null,
				templateId: selection.templateId,
			} satisfies PersistedTemplateSelection,
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
	}

	private removeMissingTemplateSelections(): void {
		if (!this.userTemplateService) {
			return;
		}

		let didChange = false;
		for (const [cacheKey, resourceSelection] of this.templateSelectionsByResource) {
			if (
				resourceSelection.selection.kind !== "saved" ||
				this.userTemplateService.getTemplate(resourceSelection.selection.templateId)
			) {
				continue;
			}

			this.templateSelectionsByResource.delete(cacheKey);
			this.persistTemplateSelection(resourceSelection, { kind: "auto" });
			this.onDidChangeTemplateSelectionEmitter.fire(resourceSelection);
			didChange = true;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private fireSliceStateChange(): void {
		this.onDidChangeSliceStateEmitter.fire(undefined);
	}

	private fireResourceSliceResultChange(resource: URI, sheetId?: string | null): void {
		this.onDidChangeResourceSliceResultEmitter.fire(normalizeSliceResource(resource, sheetId));
	}
}

const createSliceResourceResult = ({
	execution,
	completedAt,
	request,
	sourceModelVersion,
	sourceVersion,
}: {
	readonly execution: SliceExecutionResult;
	readonly completedAt: number;
	readonly request: SliceResourceRequest;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
}): SliceResourceResult => ({
	...normalizeSliceResource(request.resource, request.sheetId),
	run: createSliceResourceRun(execution.run, request.resource, request.sheetId),
	series: execution.series.map(series => createSliceResourceSeriesRecord(series, request.resource, request.sheetId)),
	curves: execution.curves.flatMap(curve => createSliceResourceCurveRecord(curve, request.resource, request.sheetId) ?? []),
	requestSignature: request.requestSignature,
	sourceModelVersion,
	sourceVersion,
	completedAt,
});

const createSliceResourceRun = (
	run: SliceExecutionResult["run"],
	resource: URI,
	sheetId?: string | null,
): SliceResourceRun => {
	const { inputRanges, ...rest } = run;
	const normalizedResource = normalizeSliceResource(resource, sheetId);
	return {
		...rest,
		resource: normalizedResource.resource,
		sheetId: normalizedResource.sheetId ?? null,
		inputRanges: inputRanges.map(inputRange => createSliceResourceRangeRef(inputRange, normalizedResource.resource, normalizedResource.sheetId)),
	};
};

const createSliceResourceRangeRef = (
	range: SlicePlanRangeRef,
	resource: URI,
	sheetId?: string | null,
): SliceResourceRun["inputRanges"][number] => ({
	resource: "resource" in range ? range.resource : resource,
	sheetId: "sheetId" in range ? range.sheetId ?? null : sheetId ?? null,
	range: range.range,
});

const createSliceResourceSeriesRecord = (
	series: SliceExecutionResult["series"][number],
	resource: URI,
	sheetId?: string | null,
): SliceResourceSeriesRecord => {
	const normalizedResource = normalizeSliceResource(resource, sheetId);
	return {
		...series,
		resource: normalizedResource.resource,
		sheetId: normalizedResource.sheetId ?? null,
	};
};

const createSliceResourceCurveRecord = (
	curve: SliceExecutionResult["curves"][number],
	resource: URI,
	sheetId?: string | null,
): SliceResourceBaseCurveRecord | null => {
	if (curve.curveGeneration !== "base") {
		return null;
	}

	const { lineage, ...rest } = curve;
	const normalizedResource = normalizeSliceResource(resource, sheetId);
	return {
		...rest,
		resource: normalizedResource.resource,
		sheetId: normalizedResource.sheetId ?? null,
		lineage: {
			...lineage,
			baseSeries: {
				resource: normalizedResource.resource,
				sheetId: normalizedResource.sheetId ?? null,
				seriesId: lineage.baseSeries.seriesId,
			},
		},
	};
};

const normalizeTemplateSelection = (
	selection: TemplateSelection,
): TemplateSelection => {
	if (selection.kind === "auto") {
		return selection;
	}

	return selection.templateId.trim()
		? { kind: "saved", templateId: selection.templateId.trim() }
		: { kind: "auto" };
};

const createTemplateSelectionFromReviewedTemplate = (
	reviewedTemplate: ReviewedTemplate,
): TemplateSelection => {
	const source = reviewedTemplate.source;
	if (source.kind === "user") {
		const templateId = normalizeText(source.templateId);
		return templateId ? { kind: "saved", templateId } : { kind: "auto" };
	}

	return { kind: "auto" };
};

const normalizePersistedTemplateSelection = (
	value: PersistedTemplateSelection | undefined,
): PersistedTemplateSelection | null => {
	if (
		!value ||
		value.version !== PersistedTemplateSelectionVersion ||
		typeof value.relativePath !== "string" ||
		(value.sheetId !== null && typeof value.sheetId !== "string") ||
		typeof value.templateId !== "string"
	) {
		return null;
	}

	const relativePath = value.relativePath.trim().replaceAll("\\", "/");
	const templateId = value.templateId.trim();
	if (
		!relativePath ||
		relativePath === ".." ||
		relativePath.startsWith("../") ||
		relativePath.startsWith("/") ||
		!templateId
	) {
		return null;
	}

	return {
		version: PersistedTemplateSelectionVersion,
		relativePath,
		sheetId: normalizeText(value.sheetId) || null,
		templateId,
	};
};

const createPersistedTemplateSelectionStorageKey = (
	relativePath: string,
	sheetId?: string | null,
): string =>
	`${PersistedTemplateSelectionStoragePrefix}${encodeURIComponent(relativePath)}:${encodeURIComponent(normalizeText(sheetId))}`;

const getSliceQueueEntryStateKey = (
	entry: SliceQueueEntry,
): string | null => createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId);

const countStructuredContentNumericRuns = (
	content: StructuredContentGridSnapshot,
): number => content.columnFacts?.reduce(
	(total, facts) => total + facts.numericRuns.length,
	0,
) ?? 0;

const countProjectedRows = (
	rows: readonly (readonly unknown[])[],
): number => rows.reduce(
	(count, row) => count + (row ? 1 : 0),
	0,
);

const getSliceQueueEntryKey = (
	entry: SliceQueueEntry,
): string => `resource:${createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId)}`;

const normalizeSliceResource = (
	resource: URI,
	sheetId?: string | null,
): SliceResourceIdentity => ({
	resource,
	sheetId: normalizeText(sheetId) || null,
});

const createResolvedResourceSliceRows = (
	snapshot: DataResourceStructuredContentSnapshot,
): ResolvedResourceSliceRows => ({
	content: snapshot.content,
	sourceModelVersion: snapshot.sourceModelVersion,
	sourceVersion: snapshot.sourceVersion,
});

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeResourceUri = (
	resource: URI | null | undefined,
): string => {
	const text = getResourceUriString(resource);
	if (text) {
		return text.replace(/\\/g, "/");
	}

	if (resource && typeof resource === "object") {
		const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
		const scheme = normalizeText(candidate.scheme);
		const path = normalizeText(candidate.path);
		if (scheme && path) {
			const authority = normalizeText(candidate.authority);
			const query = normalizeText(candidate.query);
			const fragment = normalizeText(candidate.fragment);
			return (scheme === "file"
				? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
				: `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
			).replace(/\\/g, "/");
		}
	}

	return "";
};

const getResourceUriString = (
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

const createSliceResourceCacheKey = (
	resource: URI | null | undefined,
	sheetId?: string | null,
): string => {
	const resourceKey = normalizeResourceUri(resource);
	const normalizedSheetId = normalizeText(sheetId);
	return normalizedSheetId ? `${resourceKey}\u0000${normalizedSheetId}` : resourceKey;
};

const isSameSliceFileState = (
	current: SliceFileState | undefined,
	next: SliceFileState,
): boolean =>
	current?.state === next.state &&
	("code" in current ? current.code : undefined) === ("code" in next ? next.code : undefined) &&
	("message" in current ? current.message : undefined) === ("message" in next ? next.message : undefined);

registerSingleton(
	ISliceService,
	SliceService as unknown as new (...services: BrandedService[]) => ISliceServiceType,
	InstantiationType.Delayed,
);
