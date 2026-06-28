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
	type SliceUriBaseCurveRecord,
	type SliceUriRequest,
	type SliceUriResult,
	type SliceUriRun,
	type SliceUriSeriesRecord,
	type SliceUriTarget,
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
	normalizeTemplateSelectionTarget,
	type TemplateSelection,
	type TemplateTargetSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

type UriSliceQueueEntry = {
	readonly kind: "uri";
	readonly request: SliceUriRequest;
	readonly plan: SlicePlan;
};

type SliceQueueEntry = UriSliceQueueEntry;

type ResolvedUriSliceRows = {
	readonly content: StructuredContentGridSnapshot;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
};

export class SliceService extends Disposable implements ISliceServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSliceStateEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeSliceState = this.onDidChangeSliceStateEmitter.event;
	private readonly onDidChangeUriSliceResultEmitter = this._register(new Emitter<SliceUriTarget>());
	public readonly onDidChangeUriSliceResult = this.onDidChangeUriSliceResultEmitter.event;

	private readonly uriStatesByCacheKey = new Map<string, SliceFileState>();
	private readonly uriTargetsByCacheKey = new Map<string, SliceUriTarget>();
	private readonly queue: SliceQueueEntry[] = [];
	private readonly uriResultsByCacheKey = new Map<string, SliceUriResult>();
	private readonly templateSelectionsByTarget = new Map<string, TemplateTargetSelection>();
	private activeQueueKey: string | null = null;
	private isSliceQueueRunning = false;

	public constructor(
		@IDataResourceService private readonly dataResourceService?: IDataResourceServiceType,
	) {
		super();
		if (this.dataResourceService) {
			this._register(this.dataResourceService.onDidChangeResource(resource => {
				this.removeUriResultsForResource(resource);
			}));
		}
	}

	public getState(): SliceState {
		return {
			queueLength: this.queue.length,
			templateSelections: [...this.templateSelectionsByTarget.values()],
		};
	}

	public getUriResult(target: SliceUriTarget): SliceUriResult | null {
		return this.uriResultsByCacheKey.get(createSliceUriCacheKey(target)) ?? null;
	}

	public getUriState(target: SliceUriTarget): SliceFileState | undefined {
		return this.uriStatesByCacheKey.get(createSliceUriCacheKey(target));
	}

	public submitUri(requests: readonly SliceUriRequest[]): void {
		let didChange = false;
		for (const request of requests) {
			const cacheKey = createSliceUriCacheKey(request.target);
			this.uriTargetsByCacheKey.set(cacheKey, normalizeSliceUriTarget(request.target));
			const plan = this.createUriRequestPlan(request);
			if (!plan) {
				didChange = this.setUriState(cacheKey, {
					state: "skipped",
					code: "slice.uriRequestInvalid",
					message: "The URI slice request is no longer valid.",
				}) || didChange;
				continue;
			}

			if (request.trigger.kind === "reviewDecision" && this.isLatestUriAutoRunCurrent(request, plan)) {
				didChange = this.setUriState(cacheKey, { state: "ready" }) || didChange;
				continue;
			}

			this.enqueueSliceEntry({ kind: "uri", request, plan });
			didChange = this.setUriState(cacheKey, { state: "queued" }) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
	}

	public prioritizeUri(target: SliceUriTarget): void {
		const cacheKey = createSliceUriCacheKey(target);
		if (!cacheKey) {
			return;
		}

		this.uriTargetsByCacheKey.set(cacheKey, normalizeSliceUriTarget(target));
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

	public cancelUri(targets: readonly SliceUriTarget[]): void {
		const cacheKeys = new Set(
			targets
				.map(target => createSliceUriCacheKey(target))
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
			didChange = this.setUriState(queueKey, { state: "none" }) || didChange;
			didChange = this.deleteUriTargetIfUnused(queueKey) || didChange;
		}

		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	public setTemplateSelection(target: SliceUriTarget, selection: TemplateSelection): void {
		const normalizedTarget = normalizeTemplateSelectionTarget(target);
		if (!normalizedTarget) {
			return;
		}

		this.templateSelectionsByTarget.set(createSliceUriCacheKey(normalizedTarget), {
			target: normalizedTarget,
			selection: normalizeTemplateSelection(selection),
		});
		this.fireSliceStateChange();
	}

	private createUriRequestPlan(request: SliceUriRequest): SlicePlan | null {
		const plan = createSlicePlan({
			target: {
				kind: "uri",
				target: normalizeSliceUriTarget(request.target),
			},
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

				await this.processUriSliceEntry(entry);
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

	private async processUriSliceEntry(entry: UriSliceQueueEntry): Promise<void> {
		const cacheKey = createSliceUriCacheKey(entry.request.target);
		const resolved = await this.readRowsForUriRequest(entry.request);
		if (!resolved) {
			this.setUriState(cacheKey, {
				state: "failed",
				code: "slice.uriRowsUnavailable",
				message: "URI table rows are unavailable for slicing.",
			});
			this.fireSliceStateChange();
			return;
		}

		if (!this.isCurrentUriSlicePlan(entry, resolved)) {
			this.dropStaleSliceEntry(entry);
			return;
		}

		const execution = executeSlicePlan({
			plan: entry.plan,
			rows: readStructuredContentRowsForSlicePlan(resolved.content, entry.plan),
		});
		const result = createSliceUriResult({
			execution,
			completedAt: Date.now(),
			request: entry.request,
			sourceModelVersion: resolved.sourceModelVersion,
			sourceVersion: resolved.sourceVersion,
		});
		this.uriResultsByCacheKey.set(cacheKey, result);
		this.uriTargetsByCacheKey.set(cacheKey, normalizeSliceUriTarget(entry.request.target));
		this.fireUriSliceResultChange(result.target);
		this.setUriState(cacheKey, result.run.errors.length
			? {
				state: "failed",
				code: result.run.errors[0] ?? "slice.failed",
				message: "Slice failed.",
			}
			: { state: "ready" });
		this.fireSliceStateChange();
	}

	private isCurrentUriSlicePlan(
		entry: UriSliceQueueEntry,
		resolved: ResolvedUriSliceRows,
	): boolean {
		return entry.request.sourceModelVersion === resolved.sourceModelVersion &&
			entry.request.sourceVersion === resolved.sourceVersion &&
			entry.request.rowCount === resolved.content.rowCount &&
			entry.request.columnCount === resolved.content.columnCount &&
			entry.plan.sourceContentSignature === this.createUriRequestPlan(entry.request)?.sourceContentSignature &&
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

	private async readRowsForUriRequest(
		request: SliceUriRequest,
	): Promise<ResolvedUriSliceRows | null> {
		if (!this.dataResourceService) {
			return null;
		}

		let reference: IDataResourceStructuredContentReference | null = null;
		try {
			reference = await this.dataResourceService.resolveStructuredContent({
				resource: request.target.resource,
				sheetId: request.target.sheetId,
			});
			if (reference.object.kind !== "ready") {
				return null;
			}

			return createResolvedUriSliceRows(reference.object.snapshot);
		} catch {
			return null;
		} finally {
			reference?.dispose();
		}
	}

	private isLatestUriAutoRunCurrent(request: SliceUriRequest, plan: SlicePlan): boolean {
		const result = this.uriResultsByCacheKey.get(createSliceUriCacheKey(request.target));
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

	private setUriState(cacheKey: string, state: SliceFileState): boolean {
		const current = this.uriStatesByCacheKey.get(cacheKey);
		if (isSameSliceFileState(current, state)) {
			return false;
		}

		this.uriStatesByCacheKey.set(cacheKey, state);
		return true;
	}

	private setQueueEntryState(entry: SliceQueueEntry, state: SliceFileState): boolean {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return false;
		}

		return this.setUriState(stateKey, state);
	}

	private deleteQueueEntryState(entry: SliceQueueEntry): boolean {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return false;
		}

		const didDeleteState = this.uriStatesByCacheKey.delete(stateKey);
		const didDeleteTarget = this.deleteUriTargetIfUnused(stateKey);
		return didDeleteState || didDeleteTarget;
	}

	private deleteUriTargetIfUnused(cacheKey: string): boolean {
		if (this.uriResultsByCacheKey.has(cacheKey)) {
			return false;
		}

		return this.uriTargetsByCacheKey.delete(cacheKey);
	}

	private removeUriResultsForResource(resource: URI): void {
		const cacheKey = normalizeResourceUri(resource);
		if (!cacheKey) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			if (entry && normalizeResourceUri(entry.request.target.resource) === cacheKey) {
				const entryCacheKey = createSliceUriCacheKey(entry.request.target);
				this.queue.splice(index, 1);
				this.uriStatesByCacheKey.delete(entryCacheKey);
				this.deleteUriTargetIfUnused(entryCacheKey);
				if (this.activeQueueKey === entryCacheKey) {
					this.activeQueueKey = null;
				}
				didChange = true;
			}
		}
		for (const [resultCacheKey, result] of this.uriResultsByCacheKey) {
			if (normalizeResourceUri(result.target.resource) !== cacheKey) {
				continue;
			}
			this.uriResultsByCacheKey.delete(resultCacheKey);
			this.uriStatesByCacheKey.delete(resultCacheKey);
			this.uriTargetsByCacheKey.delete(resultCacheKey);
			if (this.activeQueueKey === resultCacheKey) {
				this.activeQueueKey = null;
			}
			this.fireUriSliceResultChange(result.target);
			didChange = true;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private fireSliceStateChange(): void {
		this.onDidChangeSliceStateEmitter.fire(undefined);
	}

	private fireUriSliceResultChange(target: SliceUriTarget): void {
		this.onDidChangeUriSliceResultEmitter.fire(normalizeSliceUriTarget(target));
	}
}

const createSliceUriResult = ({
	execution,
	completedAt,
	request,
	sourceModelVersion,
	sourceVersion,
}: {
	readonly execution: SliceExecutionResult;
	readonly completedAt: number;
	readonly request: SliceUriRequest;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
}): SliceUriResult => ({
	target: normalizeSliceUriTarget(request.target),
	run: createSliceUriRun(execution.run, request.target),
	series: execution.series.map(series => createSliceUriSeriesRecord(series, request.target)),
	curves: execution.curves.flatMap(curve => createSliceUriCurveRecord(curve, request.target) ?? []),
	requestSignature: request.requestSignature,
	sourceModelVersion,
	sourceVersion,
	completedAt,
});

const createSliceUriRun = (
	run: SliceExecutionResult["run"],
	target: SliceUriTarget,
): SliceUriRun => {
	const { inputRanges, ...rest } = run;
	return {
		...rest,
		resource: target.resource,
		sheetId: target.sheetId ?? null,
		inputRanges: inputRanges.map(inputRange => createSliceUriRangeRef(inputRange, target)),
	};
};

const createSliceUriRangeRef = (
	range: SlicePlanRangeRef,
	target: SliceUriTarget,
): SliceUriRun["inputRanges"][number] => ({
	resource: "resource" in range ? range.resource : target.resource,
	sheetId: "sheetId" in range ? range.sheetId ?? null : target.sheetId ?? null,
	range: range.range,
});

const createSliceUriSeriesRecord = (
	series: SliceExecutionResult["series"][number],
	target: SliceUriTarget,
): SliceUriSeriesRecord => {
	return {
		...series,
		resource: target.resource,
		sheetId: target.sheetId ?? null,
	};
};

const createSliceUriCurveRecord = (
	curve: SliceExecutionResult["curves"][number],
	target: SliceUriTarget,
): SliceUriBaseCurveRecord | null => {
	if (curve.curveGeneration !== "base") {
		return null;
	}

	const { lineage, ...rest } = curve;
	return {
		...rest,
		resource: target.resource,
		sheetId: target.sheetId ?? null,
		lineage: {
			...lineage,
			baseSeries: {
				resource: target.resource,
				sheetId: target.sheetId ?? null,
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
): string | null => createSliceUriCacheKey(entry.request.target);

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
): string => `uri:${createSliceUriCacheKey(entry.request.target)}`;

const normalizeSliceUriTarget = (
	target: SliceUriTarget,
): SliceUriTarget => ({
	resource: target.resource,
	sheetId: normalizeText(target.sheetId) || null,
});

const createResolvedUriSliceRows = (
	snapshot: DataResourceStructuredContentSnapshot,
): ResolvedUriSliceRows => ({
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

const createSliceUriCacheKey = (
	target: SliceUriTarget,
): string => {
	const resource = normalizeResourceUri(target.resource);
	const sheetId = normalizeText(target.sheetId);
	return sheetId ? `${resource}\u0000${sheetId}` : resource;
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
