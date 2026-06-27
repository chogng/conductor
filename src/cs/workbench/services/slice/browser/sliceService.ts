/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import Papa from "papaparse";
import {
	ISessionService,
	type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
	FileRecord,
	RawTableRef,
	TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	IRawTableRowsReaderService,
	ISliceService,
	type IRawTableRowsReaderService as IRawTableRowsReaderServiceType,
	type RawTableRows,
	type RawTableRowsReadInput,
	type ISliceService as ISliceServiceType,
	type SliceCommit,
	type SliceExecutionResult,
	type SliceFileState,
	type SlicePlan,
	type SlicePlanRangeRef,
	type SliceRequest,
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
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

type SessionSliceQueueEntry = {
	readonly kind: "session";
	readonly ref: RawTableRef;
	readonly plan: SlicePlan;
};

type UriSliceQueueEntry = {
	readonly kind: "uri";
	readonly request: SliceUriRequest;
	readonly plan: SlicePlan;
};

type SliceQueueEntry = SessionSliceQueueEntry | UriSliceQueueEntry;

type ResolvedUriSliceRows = {
	readonly content: StructuredContentGridSnapshot;
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
};

class RawTableRowsReaderService extends Disposable implements IRawTableRowsReaderServiceType {
	public declare readonly _serviceBrand: undefined;

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		return readRawTableRows(input);
	}
}

export class SliceService extends Disposable implements ISliceServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSliceStateEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeSliceState = this.onDidChangeSliceStateEmitter.event;
	private readonly onDidChangeUriSliceResultEmitter = this._register(new Emitter<SliceUriTarget>());
	public readonly onDidChangeUriSliceResult = this.onDidChangeUriSliceResultEmitter.event;

	private readonly fileStates = new Map<string, SliceFileState>();
	private readonly uriStatesByCacheKey = new Map<string, SliceFileState>();
	private readonly uriTargetsByCacheKey = new Map<string, SliceUriTarget>();
	private readonly queue: SliceQueueEntry[] = [];
	private readonly uriResultsByCacheKey = new Map<string, SliceUriResult>();
	private templateSelectionsByFileId: Record<string, TemplateSelection> = {};
	private activeFileId: string | null = null;
	private activeQueueKey: string | null = null;
	private isSliceQueueRunning = false;

	public constructor(
		@ISessionService private readonly sessionService: ISessionServiceType,
		@IRawTableRowsReaderService private readonly rawTableRowsReaderService?: IRawTableRowsReaderServiceType,
		@IDataResourceService private readonly dataResourceService?: IDataResourceServiceType,
	) {
		super();
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "sessionCleared") {
				this.clearState();
				return;
			}
			if (event.reason === "filesRemoved" && event.fileIds?.length) {
				this.removeFiles(event.fileIds);
			}
		}));
		if (this.dataResourceService) {
			this._register(this.dataResourceService.onDidChangeResource(resource => {
				this.removeUriResultsForResource(resource);
			}));
		}
	}

	public getState(): SliceState {
		return {
			fileStates: new Map(this.fileStates),
			queueLength: this.queue.length,
			activeFileId: this.activeFileId,
			templateSelectionsByFileId: { ...this.templateSelectionsByFileId },
		};
	}

	public getUriResult(target: SliceUriTarget): SliceUriResult | null {
		return this.uriResultsByCacheKey.get(createSliceUriCacheKey(target)) ?? null;
	}

	public getUriState(target: SliceUriTarget): SliceFileState | undefined {
		return this.uriStatesByCacheKey.get(createSliceUriCacheKey(target));
	}

	public submit(requests: readonly SliceRequest[]): void {
		let didChange = false;
		for (const request of requests) {
			const plan = this.createRequestPlan(request);
			if (!plan) {
				didChange = this.setFileState(request.ref.fileId, {
					state: "skipped",
					code: "slice.requestInvalid",
					message: "The slice request is no longer valid.",
				}) || didChange;
				continue;
			}

			if (request.trigger.kind === "reviewDecision" && this.isLatestAutoRunCurrent(request.ref, plan)) {
				didChange = this.setFileState(request.ref.fileId, { state: "ready" }) || didChange;
				continue;
			}

			this.enqueueSliceEntry({ kind: "session", ref: request.ref, plan });
			didChange = this.setFileState(request.ref.fileId, { state: "queued" }) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
		this.startSliceQueue();
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

	public enqueueAuto(refs: readonly RawTableRef[]): void {
		let didChange = false;
		for (const ref of uniqueRawTableRefs(refs)) {
			didChange = this.setFileState(ref.fileId, {
				state: "skipped",
				code: "slice.reviewDecisionMissing",
				message: "No URI review decision is available for automatic slicing.",
			}) || didChange;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	public prioritize(fileId: string): void {
		const normalizedFileId = normalizeText(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.activeFileId = normalizedFileId;
		this.prioritizeQueueKey(normalizedFileId);
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

	public cancel(fileIds?: readonly string[]): void {
		const normalizedFileIds = new Set((fileIds ?? []).map(normalizeText).filter(Boolean));
		const cancelAll = !normalizedFileIds.size;
		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			const fileId = entry ? getSliceQueueEntryStateKey(entry) : null;
			if (!entry || !fileId || (!cancelAll && !normalizedFileIds.has(fileId))) {
				continue;
			}
			this.queue.splice(index, 1);
			if (this.activeQueueKey === fileId) {
				this.activeQueueKey = null;
			}
			didChange = this.setQueueEntryState(entry, { state: "none" }) || didChange;
		}
		if (cancelAll) {
			didChange = this.fileStates.size > 0 || this.uriStatesByCacheKey.size > 0 || didChange;
			this.fileStates.clear();
			this.uriStatesByCacheKey.clear();
			this.uriTargetsByCacheKey.clear();
			this.activeFileId = null;
			this.activeQueueKey = null;
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
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
			if (entry?.kind !== "uri" || !queueKey || !cacheKeys.has(queueKey)) {
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

	public setTemplateSelection(fileId: string, selection: TemplateSelection): void {
		const normalizedFileId = normalizeText(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.templateSelectionsByFileId = {
			...this.templateSelectionsByFileId,
			[normalizedFileId]: normalizeTemplateSelection(selection),
		};
		this.fireSliceStateChange();
	}

	private createRequestPlan(request: SliceRequest): SlicePlan | null {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[request.ref.fileId];
		const table = file?.raw.tablesById[request.ref.rawTableId];
		if (!file || !table) {
			return null;
		}
		if ((file.rawTableVersionsById[request.ref.rawTableId] ?? 0) !== request.sourceRawTableVersion) {
			return null;
		}

		return this.createPlan({
			file,
			mode: request.trigger.kind === "reviewDecision" ? "auto" : "manual",
			ref: request.ref,
			selection: request.trigger.kind === "reviewDecision"
				? { kind: "auto" }
				: { kind: "inline", template: request.reviewedTemplate.template },
			template: request.reviewedTemplate.template,
			templateFingerprint: request.reviewedTemplate.templateFingerprint,
		});
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
				: { kind: "inline", template: request.reviewedTemplate.template },
			sourceVersion: request.sourceVersion,
			sourceTableModelSignature: request.sourceTableModelSignature,
			template: request.reviewedTemplate.template,
			templateFingerprint: request.reviewedTemplate.templateFingerprint,
			rowCount: request.rowCount,
			columnCount: request.columnCount,
		});
		return plan.errors.length ? null : plan;
	}

	private createPlan({
		file,
		mode,
		ref,
		selection,
		sourceTableModelSignature,
		template,
		templateFingerprint,
	}: {
		readonly file: FileRecord;
		readonly mode: SlicePlan["mode"];
		readonly ref: RawTableRef;
		readonly selection: TemplateSelection;
		readonly sourceTableModelSignature?: string;
		readonly template: Template;
		readonly templateFingerprint?: string;
	}): SlicePlan | null {
		const table = file.raw.tablesById[ref.rawTableId];
		if (!table) {
			return null;
		}

		const plan = createSlicePlan({
			target: {
				kind: "rawTable",
				ref,
			},
			mode,
			selection,
			sourceRawTableVersion: file.rawTableVersionsById[ref.rawTableId] ?? 0,
			sourceTableModelSignature,
			template,
			templateFingerprint,
			rowCount: table.rowCount,
			columnCount: table.columnCount,
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

				const fileId = getSliceQueueEntryStateKey(entry);
				if (!fileId) {
					continue;
				}

				this.setQueueEntryState(entry, { state: "processing" });
				this.fireSliceStateChange();

				if (entry.kind === "uri") {
					await this.processUriSliceEntry(entry);
					continue;
				}

				if (!this.rawTableRowsReaderService) {
					if (this.queue.some(candidate => candidate.kind === "uri" && this.dataResourceService)) {
						this.queue.push(entry);
						continue;
					}

					this.queue.unshift(entry);
					break;
				}

				if (!this.isCurrentSlicePlan(entry.plan)) {
					this.dropStaleSliceEntry(entry);
					continue;
				}

				const rows = await this.readRowsForPlan(entry.plan);
				if (!rows) {
					this.setFileState(entry.ref.fileId, {
						state: "failed",
						code: "slice.rowsUnavailable",
						message: "Raw table rows are unavailable for slicing.",
					});
					this.fireSliceStateChange();
					continue;
				}
				if (!this.isCurrentSlicePlan(entry.plan)) {
					this.dropStaleSliceEntry(entry);
					continue;
				}

				const execution = executeSlicePlan({
					plan: entry.plan,
					rows,
				});
				const commit = createSliceCommit({
					execution,
					plan: entry.plan,
				});
				this.sessionService.commitSliceRuns([commit]);
				this.setFileState(entry.ref.fileId, commit.run.errors.length
					? {
						state: "failed",
						code: commit.run.errors[0] ?? "slice.failed",
						message: "Slice failed.",
					}
					: { state: "ready" });
				this.fireSliceStateChange();
			}
		} finally {
			this.isSliceQueueRunning = false;
			if (this.queue.length) {
				this.startSliceQueue();
			}
		}
	}

	private isCurrentSlicePlan(plan: SlicePlan): boolean {
		if (plan.target.kind !== "rawTable") {
			return false;
		}
		const ref = plan.target.ref;
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		if (!file?.raw.tablesById[ref.rawTableId]) {
			return false;
		}
		if ((file.rawTableVersionsById[ref.rawTableId] ?? 0) !== plan.sourceRawTableVersion) {
			return false;
		}

		return true;
	}

	private canProcessQueuedSlices(): boolean {
		return this.queue.some(entry =>
			entry.kind === "uri"
				? Boolean(this.dataResourceService)
				: Boolean(this.rawTableRowsReaderService)
		);
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
			entry.plan.sourceTableModelSignature === this.createUriRequestPlan(entry.request)?.sourceTableModelSignature &&
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

	private async readRowsForPlan(
		plan: SlicePlan,
	): Promise<readonly (readonly unknown[])[] | null> {
		if (plan.target.kind !== "rawTable") {
			return null;
		}
		const ref = plan.target.ref;
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		const table = file?.raw.tablesById[ref.rawTableId];
		if (!file || !table || !this.rawTableRowsReaderService) {
			return null;
		}

		return this.rawTableRowsReaderService.readRawTableRows({
			fallbackFile: file.raw.file,
			fileName: file.raw.fileName,
			lastModified: file.raw.lastModified ?? null,
			rowStore: toRawTableRowsStore(table),
		});
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

	private isLatestAutoRunCurrent(ref: RawTableRef, plan: SlicePlan): boolean {
		const snapshot = this.sessionService.getSnapshot();
		const file = snapshot.filesById[ref.fileId];
		const run = file?.latestSliceRunId ? file.sliceRunsById?.[file.latestSliceRunId] : undefined;
		return Boolean(
			run &&
				run.mode === "auto" &&
				run.rawTableId === ref.rawTableId &&
				run.sourceRawTableVersion === plan.sourceRawTableVersion &&
				run.sourceTableModelSignature === plan.sourceTableModelSignature &&
				run.templateFingerprint === plan.templateFingerprint &&
				run.errors.length === 0,
		);
	}

	private isLatestUriAutoRunCurrent(request: SliceUriRequest, plan: SlicePlan): boolean {
		const result = this.uriResultsByCacheKey.get(createSliceUriCacheKey(request.target));
		if (!result) {
			return false;
		}

		const run = result.run;
		return run.mode === "auto" &&
			run.sourceTableModelSignature === plan.sourceTableModelSignature &&
			run.templateFingerprint === plan.templateFingerprint &&
			result.sourceModelVersion === request.sourceModelVersion &&
			result.sourceVersion === request.sourceVersion &&
			result.requestSignature === request.requestSignature &&
			run.errors.length === 0;
	}

	private setFileState(fileId: string, state: SliceFileState): boolean {
		const current = this.fileStates.get(fileId);
		if (isSameSliceFileState(current, state)) {
			return false;
		}

		this.fileStates.set(fileId, state);
		return true;
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

		return entry.kind === "uri"
			? this.setUriState(stateKey, state)
			: this.setFileState(stateKey, state);
	}

	private deleteQueueEntryState(entry: SliceQueueEntry): boolean {
		const stateKey = getSliceQueueEntryStateKey(entry);
		if (!stateKey) {
			return false;
		}

		if (entry.kind === "uri") {
			const didDeleteState = this.uriStatesByCacheKey.delete(stateKey);
			const didDeleteTarget = this.deleteUriTargetIfUnused(stateKey);
			return didDeleteState || didDeleteTarget;
		}

		return this.fileStates.delete(stateKey);
	}

	private deleteUriTargetIfUnused(cacheKey: string): boolean {
		if (this.uriResultsByCacheKey.has(cacheKey)) {
			return false;
		}

		return this.uriTargetsByCacheKey.delete(cacheKey);
	}

	private clearState(): void {
		const uriResultTargets = [...this.uriResultsByCacheKey.values()].map(result => result.target);
		const didChange = this.queue.length > 0 ||
			this.fileStates.size > 0 ||
			this.uriStatesByCacheKey.size > 0 ||
			this.uriTargetsByCacheKey.size > 0 ||
			this.uriResultsByCacheKey.size > 0 ||
			Object.keys(this.templateSelectionsByFileId).length > 0 ||
			this.activeFileId !== null ||
			this.activeQueueKey !== null;
		this.queue.length = 0;
		this.fileStates.clear();
		this.uriStatesByCacheKey.clear();
		this.uriTargetsByCacheKey.clear();
		this.uriResultsByCacheKey.clear();
		this.templateSelectionsByFileId = {};
		this.activeFileId = null;
		this.activeQueueKey = null;
		if (didChange) {
			for (const target of uriResultTargets) {
				this.fireUriSliceResultChange(target);
			}
			this.fireSliceStateChange();
		}
	}

	private removeFiles(fileIds: readonly string[]): void {
		const normalizedFileIds = new Set(fileIds.map(normalizeText).filter(Boolean));
		if (!normalizedFileIds.size) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			const fileId = entry ? getSliceQueueEntryStateKey(entry) : null;
			if (fileId && normalizedFileIds.has(fileId)) {
				this.queue.splice(index, 1);
				didChange = true;
			}
		}
		for (const fileId of normalizedFileIds) {
			didChange = this.fileStates.delete(fileId) || didChange;
			if (this.templateSelectionsByFileId[fileId]) {
				const { [fileId]: _removed, ...remainingSelections } = this.templateSelectionsByFileId;
				this.templateSelectionsByFileId = remainingSelections;
				didChange = true;
			}
			if (this.activeFileId === fileId) {
				this.activeFileId = null;
				didChange = true;
			}
			if (this.activeQueueKey === fileId) {
				this.activeQueueKey = null;
				didChange = true;
			}
		}
		if (didChange) {
			this.fireSliceStateChange();
		}
	}

	private removeUriResultsForResource(resource: URI): void {
		const cacheKey = normalizeResourceUri(resource);
		if (!cacheKey) {
			return;
		}

		let didChange = false;
		for (let index = this.queue.length - 1; index >= 0; index -= 1) {
			const entry = this.queue[index];
			if (entry?.kind === "uri" && normalizeResourceUri(entry.request.target.resource) === cacheKey) {
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

const createSliceCommit = ({
	execution,
	plan,
}: {
	readonly execution: SliceExecutionResult;
	readonly plan: SlicePlan;
}): SliceCommit => {
	if (plan.target.kind !== "rawTable") {
		throw new Error("Session slice commits require a raw-table plan target.");
	}

	const { ref } = plan.target;
	return {
		run: {
			...execution.run,
			fileId: ref.fileId,
			rawTableId: ref.rawTableId,
			sourceRawTableVersion: plan.sourceRawTableVersion ?? 0,
			inputRanges: execution.run.inputRanges.map(range => createSliceRawTableRangeRef(range, ref)),
		},
		series: execution.series.map(series => ({
			...series,
			fileId: ref.fileId,
			sheetId: ref.rawTableId,
		})),
		curves: execution.curves.map(curve => ({
			...curve,
			fileId: ref.fileId,
			lineage: {
				...curve.lineage,
				baseSeries: {
					fileId: ref.fileId,
					seriesId: curve.lineage.baseSeries.seriesId,
				},
			},
		})),
	};
};

const createSliceRawTableRangeRef = (
	range: SlicePlanRangeRef,
	ref: RawTableRef,
): SliceCommit["run"]["inputRanges"][number] => ({
	fileId: "fileId" in range ? range.fileId : ref.fileId,
	rawTableId: "rawTableId" in range ? range.rawTableId : ref.rawTableId,
	range: range.range,
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
	if (selection.kind === "inline" || selection.kind === "auto") {
		return selection;
	}

	return selection.templateId.trim()
		? { kind: "saved", templateId: selection.templateId.trim() }
		: { kind: "auto" };
};

const normalizeRawTableRef = (
	ref: RawTableRef,
): RawTableRef | null => {
	const fileId = normalizeText(ref?.fileId);
	const rawTableId = normalizeText(ref?.rawTableId);
	return fileId && rawTableId ? { fileId, rawTableId } : null;
};

const getSliceQueueEntryStateKey = (
	entry: SliceQueueEntry,
): string | null => entry.kind === "uri"
	? createSliceUriCacheKey(entry.request.target)
	: normalizeText(entry.ref.fileId);

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
): string => entry.kind === "uri"
	? `uri:${createSliceUriCacheKey(entry.request.target)}`
	: `session:${entry.ref.fileId}\u0000${entry.ref.rawTableId}`;

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

const uniqueRawTableRefs = (
	refs: readonly RawTableRef[],
): RawTableRef[] => {
	const result: RawTableRef[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const normalized = normalizeRawTableRef(ref);
		if (!normalized) {
			continue;
		}
		const key = `${normalized.fileId}\u0000${normalized.rawTableId}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(normalized);
	}
	return result;
};

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

const toRawTableRowsStore = (
	table: TableRecord,
): Parameters<IRawTableRowsReaderServiceType["readRawTableRows"]>[0]["rowStore"] => {
	if (!table.rowStore) {
		return null;
	}
	if (table.rowStore.kind === "memory") {
		return {
			kind: "memory",
			rows: table.rowStore.rows,
		};
	}

	return {
		kind: "external",
		normalizedCsvPath: table.rowStore.normalizedCsvPath ?? null,
	};
};

async function readRawTableRows(
	input: RawTableRowsReadInput,
): Promise<RawTableRows | null> {
	const rowStore = input.rowStore;
	if (!rowStore) {
		return null;
	}

	if (rowStore.kind === "memory") {
		return limitRows(rowStore.rows, input.maxRows).map(convertRowToStrings);
	}

	const fallbackFile = input.fallbackFile;
	if (!isTextReadableFile(fallbackFile)) {
		return null;
	}

	return parseCsvRows(await fallbackFile.text(), input.maxRows);
}

const isTextReadableFile = (value: unknown): value is { text(): Promise<string> } =>
	!!value && typeof value === "object" && typeof (value as { text?: unknown }).text === "function";

function parseCsvRows(text: string, maxRows?: number): RawTableRows {
	const preview = normalizeMaxRows(maxRows);
	const parsed = Papa.parse<unknown[]>(text, {
		...(preview !== undefined ? { preview } : {}),
		skipEmptyLines: false,
	});
	return parsed.data.map(convertRowToStrings);
}

function limitRows<T>(
	rows: readonly T[],
	maxRows: number | undefined,
): readonly T[] {
	const preview = normalizeMaxRows(maxRows);
	return preview === undefined ? rows : rows.slice(0, preview);
}

function normalizeMaxRows(value: number | undefined): number | undefined {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
}

function convertRowToStrings(row: readonly unknown[]): readonly string[] {
	return row.map(cell => cell == null ? "" : String(cell));
}

registerSingleton(
	IRawTableRowsReaderService,
	RawTableRowsReaderService as unknown as new (...services: BrandedService[]) => IRawTableRowsReaderServiceType,
	InstantiationType.Delayed,
);

registerSingleton(
	ISliceService,
	SliceService as unknown as new (...services: BrandedService[]) => ISliceServiceType,
	InstantiationType.Delayed,
);
