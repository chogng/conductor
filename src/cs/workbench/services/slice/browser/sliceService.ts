/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
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
	readStructuredContentRows,
	type StructuredContentGridSnapshot,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { executeSlicePlan } from "src/cs/workbench/services/slice/common/sliceExecutor";
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

type SliceResourceIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

type ResourceSliceQueueEntry = {
	readonly kind: "resource";
	readonly request: SliceResourceRequest;
	readonly plan: SlicePlan;
};

type SliceQueueEntry = ResourceSliceQueueEntry;

type ResolvedResourceSliceRows = {
	readonly content: StructuredContentGridSnapshot;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
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
	private activeQueueKey: string | null = null;
	private isSliceQueueRunning = false;

	public constructor(
		@IDataResourceService private readonly dataResourceService?: IDataResourceServiceType,
	) {
		super();
		if (this.dataResourceService) {
			this._register(this.dataResourceService.onDidChangeResource(resource => {
				this.removeResourceResultsForResource(resource);
			}));
		}
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

			this.enqueueSliceEntry({ kind: "resource", request, plan });
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
			this.templateSelectionsByResource.get(cacheKey)?.selection,
			nextSelection,
		)) {
			return;
		}

		this.templateSelectionsByResource.set(cacheKey, {
			resource: normalizedResource.resource,
			sheetId: normalizedResource.sheetId ?? null,
			selection: nextSelection,
		});
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
		if (this.isSliceQueueRunning || !this.queue.length || !this.canProcessQueuedSlices()) {
			return;
		}

		void this.drainSliceQueue();
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

	private async drainSliceQueue(): Promise<void> {
		if (this.isSliceQueueRunning || !this.canProcessQueuedSlices()) {
			return;
		}

		this.isSliceQueueRunning = true;
		try {
			while (this.queue.length) {
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
			this.isSliceQueueRunning = false;
			if (this.queue.length) {
				this.startSliceQueue();
			}
		}
	}

	private canProcessQueuedSlices(): boolean {
		return Boolean(this.dataResourceService) && this.queue.length > 0;
	}

	private async processResourceSliceEntry(entry: ResourceSliceQueueEntry): Promise<void> {
		const cacheKey = createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId);
		const resolved = await this.readRowsForResourceRequest(entry.request);
		if (!resolved) {
			this.setResourceState(cacheKey, {
				state: "failed",
				code: "slice.resourceRowsUnavailable",
				message: "Resource table rows are unavailable for slicing.",
			});
			this.fireSliceStateChange();
			return;
		}

		if (!this.isCurrentResourceSlicePlan(entry, resolved)) {
			this.dropStaleSliceEntry(entry);
			return;
		}

		const execution = executeSlicePlan({
			plan: entry.plan,
			rows: readStructuredContentRowsForSlicePlan(resolved.content, entry.plan),
		});
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

const getSliceQueueEntryStateKey = (
	entry: SliceQueueEntry,
): string | null => createSliceResourceCacheKey(entry.request.resource, entry.request.sheetId);

const readStructuredContentRowsForSlicePlan = (
	content: StructuredContentGridSnapshot,
	plan: SlicePlan,
): readonly (readonly unknown[])[] => {
	const rows: (readonly unknown[])[] = [];
	for (const range of plan.inputRanges) {
		const startRow = range.range.startRow;
		const endRowExclusive = range.range.endRow + 1;
		const rangeRows = readStructuredContentRows(content, startRow, endRowExclusive);
		for (let index = 0; index < rangeRows.length; index += 1) {
			rows[startRow + index] = rangeRows[index] ?? [];
		}
	}
	return rows;
};

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
