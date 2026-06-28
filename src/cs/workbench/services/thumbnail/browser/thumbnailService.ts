/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event } from "src/cs/base/common/event";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IThumbnailPreviewService,
	IThumbnailService,
	type IThumbnailPreviewService as IThumbnailPreviewServiceType,
	type ThumbnailPreviewChangeEvent,
	type ThumbnailPreviewPriority,
	type ThumbnailPreviewState,
	type ThumbnailPreviewTarget,
	type IThumbnailService as IThumbnailServiceType,
	type ThumbnailBitmapOptions,
	type ThumbnailBitmapTarget,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { SliceUriTarget } from "src/cs/workbench/services/slice/common/slice";
import { logPerf, startPerf } from "src/cs/workbench/common/perf";
import {
	createThumbnailBitmapCache,
	drawThumbnailBitmap,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailBitmap";

const PREVIEW_PRIORITY_ORDER: Readonly<Record<ThumbnailPreviewPriority, number>> = {
	hover: 0,
	visible: 1,
	recent: 2,
	nearby: 3,
	idle: 4,
};
const PREVIEW_BATCH_LIMIT = 4;
const PREVIEW_FRAME_BUDGET_MS = 6;

type NormalizedThumbnailPreviewTarget = {
	readonly fileId: string;
	readonly key: string;
	readonly target?: SliceUriTarget | null;
};

export class BrowserThumbnailService extends Disposable implements IThumbnailServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly bitmapCache = createThumbnailBitmapCache();

	public clear(): void {
		this.bitmapCache.clear();
	}

	public drawPlotThumbnail(target: ThumbnailBitmapTarget, options: ThumbnailBitmapOptions): void {
		drawThumbnailBitmap({
			cache: this.bitmapCache,
			canvas: asThumbnailCanvas(target),
			options,
		});
	}

	public warmPlotThumbnail(options: ThumbnailBitmapOptions): void {
		this.bitmapCache.get(options);
	}

	public override dispose(): void {
		this.bitmapCache.dispose();
		super.dispose();
	}
}

registerSingleton(IThumbnailService, BrowserThumbnailService, InstantiationType.Delayed);

export class BrowserThumbnailPreviewService extends Disposable implements IThumbnailPreviewServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangePreviewEmitter = this._register(new Emitter<ThumbnailPreviewChangeEvent>());
	public readonly onDidChangePreview = this.onDidChangePreviewEmitter.event;
	private readonly statesByFileId = new Map<string, ThumbnailPreviewState>();
	private readonly requestedPreviewPrioritiesByFileId = new Map<string, ThumbnailPreviewPriority>();
	private readonly queuedPreviewPrioritiesByFileId = new Map<string, ThumbnailPreviewPriority>();
	private readonly targetsByFileId = new Map<string, SliceUriTarget>();
	private cancelQueuedPreviewFlush: (() => void) | null = null;

	constructor(
		@IPlotService private readonly plotService: IPlotService,
	) {
		super();

		this._register(this.plotService.onDidChangeCalculatedDataCache(event => {
			this.updatePreviewStateFromPlotCacheEvent(event);
		}));
		this._register((this.plotService.onDidChangePlotDisplayModelCache ?? Event.None)(event => {
			this.updatePreviewStateFromPlotCacheEvent(event);
		}));
		this._register(this.plotService.onDidChangePlotState(() => this.invalidate()));
		this._register({ dispose: () => this.cancelScheduledPreviewFlush() });
	}

	public get(target: ThumbnailPreviewTarget): ThumbnailPreviewState {
		const resolvedTarget = normalizePreviewTarget(target);
		if (!resolvedTarget) {
			return { kind: "idle" };
		}

		this.rememberPreviewTarget(resolvedTarget);
		return this.statesByFileId.get(resolvedTarget.fileId) ?? { kind: "idle" };
	}

	public request(target: ThumbnailPreviewTarget, priority: ThumbnailPreviewPriority): ThumbnailPreviewState {
		const resolvedTarget = normalizePreviewTarget(target);
		if (!resolvedTarget) {
			return { kind: "idle" };
		}

		this.rememberPreviewTarget(resolvedTarget);
		const normalizedFileId = resolvedTarget.fileId;
		const endPerf = startPerf("thumbnailPreview.request", {
			fileId: normalizedTarget.fileId,
			priority,
			targetKey: normalizedTarget.key,
		});
		const previous = this.statesByKey.get(normalizedTarget.key);
		this.rememberRequestedPriority(normalizedTarget, priority);
		if (previous && previous.kind !== "idle") {
			this.prefetchPlotPreview(normalizedFileId, priority, resolvedTarget.target);
			if (previous.kind === "loading") {
				if (priority === "hover") {
					const next = this.updatePreviewState(normalizedTarget, {
						allowSynchronousCalculation: true,
						target: resolvedTarget.target,
						reason: "hoverRetry",
					});
					endPerf({
						cacheHit: true,
						retried: true,
						state: next.kind,
						stateSource: getPreviewStateSource(next),
						synchronous: next.kind === "ready",
					});
					return next;
				}
				this.queuePreview(normalizedTarget, priority);
			}
			endPerf({
				cacheHit: true,
				state: previous.kind,
				stateSource: getPreviewStateSource(previous),
			});
			return previous;
		}

		if (priority === "hover") {
			this.rememberRequestedPriority(normalizedTarget, priority);
			const next = this.createPreviewState(normalizedTarget, {
				allowSynchronousCalculation: true,
				target: resolvedTarget.target,
			});
			this.statesByKey.set(normalizedTarget.key, next);
			this.syncRequestedPriorityForState(normalizedTarget, next);
			if (next.kind === "loading") {
				this.queuePreview(normalizedTarget, priority);
			} else {
				this.queuedPreviewPrioritiesByKey.delete(normalizedTarget.key);
			}
			this.fireDidChangePreview(normalizedTarget);
			endPerf({
				cacheHit: false,
				deferred: next.kind === "loading",
				state: next.kind,
				stateSource: getPreviewStateSource(next),
				synchronous: next.kind === "ready",
			});
			return next;
		}

		this.prefetchPlotPreview(normalizedFileId, priority, resolvedTarget.target);
		const next = this.createPreviewState(normalizedFileId, { target: resolvedTarget.target });
		this.statesByFileId.set(normalizedFileId, next);
		this.syncRequestedPriorityForState(normalizedFileId, next);
		this.queuedPreviewPrioritiesByFileId.delete(normalizedFileId);
		if (next.kind === "loading") {
			this.queuePreview(normalizedTarget, priority);
		}
		this.fireDidChangePreview(normalizedTarget);
		endPerf({
			cacheHit: false,
			state: next.kind,
			stateSource: getPreviewStateSource(next),
		});
		return next;
	}

	public prefetch(targets: readonly ThumbnailPreviewTarget[], priority: "visible" | "recent" | "nearby" | "idle"): void {
		const endPerf = startPerf(`thumbnailPreview.prefetch.${priority}`, {
			fileCount: targets.length,
		});
		for (const target of targets) {
			this.queuePreview(target, priority);
		}
		endPerf();
	}

	public invalidate(targets?: readonly ThumbnailPreviewTarget[]): void {
		const normalizedFileIds = targets
			?.map(normalizePreviewTarget)
			.filter((target): target is ResolvedThumbnailPreviewTarget => Boolean(target))
			.map(target => target.fileId);
		const changedFileIds: string[] = [];
		if (!normalizedFileIds?.length) {
			changedFileIds.push(...this.statesByFileId.keys());
			this.statesByFileId.clear();
			this.requestedPreviewPrioritiesByFileId.clear();
			this.queuedPreviewPrioritiesByFileId.clear();
			this.targetsByFileId.clear();
			this.cancelScheduledPreviewFlush();
		} else {
			for (const target of normalizedTargets) {
				this.rememberTarget(target);
				if (this.invalidateTargetedPreview(target)) {
					changedTargets.push(target);
				}
			}
		}
		for (const target of changedTargets) {
			this.fireDidChangePreview(target);
		}
	}

	private invalidateTargetedPreview(target: NormalizedThumbnailPreviewTarget): boolean {
		const previous = this.statesByKey.get(target.key);
		const requestedPriority = this.requestedPreviewPrioritiesByKey.get(target.key);
		this.queuedPreviewPrioritiesByKey.delete(target.key);
		if (!previous) {
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
			this.targetsByFileId.delete(fileId);
			return false;
		}

		if (isReadyPreviewState(previous) && requestedPriority) {
			this.queuePreview(target, requestedPriority, { force: true });
			return false;
		}

		if (previous?.kind !== "loading" || !requestedPriority) {
			this.statesByFileId.delete(fileId);
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
			this.targetsByFileId.delete(fileId);
			return true;
		}

		const next = this.createPreviewState(target, {
			allowSynchronousCalculation: requestedPriority === "hover",
			target: this.targetsByFileId.get(fileId),
		});
		if (next.kind === "loading") {
			this.statesByKey.set(target.key, next);
			this.queuePreview(target, requestedPriority);
			return false;
		}

		this.statesByKey.set(target.key, next);
		this.syncRequestedPriorityForState(target, next);
		return true;
	}

	private queuePreview(
		input: ThumbnailPreviewTarget | NormalizedThumbnailPreviewTarget,
		priority: ThumbnailPreviewPriority,
		options: { readonly force?: boolean } = {},
	): void {
		const target = this.normalizeTarget(input);
		if (!target) {
			return;
		}

		this.rememberTarget(target);
		this.rememberRequestedPriority(target, priority);
		const previous = this.statesByKey.get(target.key);
		if (!options.force && previous && previous.kind !== "idle" && previous.kind !== "loading") {
			return;
		}
		this.prefetchPlotPreview(target, priority);

		const queuedPriority = this.queuedPreviewPrioritiesByKey.get(target.key);
		if (
			!queuedPriority ||
			PREVIEW_PRIORITY_ORDER[priority] < PREVIEW_PRIORITY_ORDER[queuedPriority]
		) {
			this.queuedPreviewPrioritiesByKey.set(target.key, priority);
		}
		this.schedulePreviewFlush();
	}

	private schedulePreviewFlush(): void {
		if (this.cancelQueuedPreviewFlush || !this.queuedPreviewPrioritiesByKey.size) {
			return;
		}

		const run = (): void => {
			this.cancelQueuedPreviewFlush = null;
			this.flushQueuedPreviews();
		};
		if (typeof globalThis.requestAnimationFrame === "function") {
			const handle = globalThis.requestAnimationFrame(run);
			this.cancelQueuedPreviewFlush = () => {
				globalThis.cancelAnimationFrame(handle);
			};
			return;
		}

		const handle = globalThis.setTimeout(run, 0);
		this.cancelQueuedPreviewFlush = () => {
			globalThis.clearTimeout(handle);
		};
	}

	private cancelScheduledPreviewFlush(): void {
		this.cancelQueuedPreviewFlush?.();
		this.cancelQueuedPreviewFlush = null;
	}

	private flushQueuedPreviews(): void {
		const startedAt = Date.now();
		let processed = 0;
		while (this.queuedPreviewPrioritiesByKey.size && processed < PREVIEW_BATCH_LIMIT) {
			const nextTarget = this.dequeueNextPreviewTarget();
			if (!nextTarget) {
				break;
			}

			this.updatePreviewState(nextFileId, { target: this.targetsByFileId.get(nextFileId) });
			processed += 1;
			if (Date.now() - startedAt >= PREVIEW_FRAME_BUDGET_MS) {
				break;
			}
		}

		if (this.queuedPreviewPrioritiesByKey.size) {
			this.schedulePreviewFlush();
		}
	}

	private dequeueNextPreviewTarget(): NormalizedThumbnailPreviewTarget | null {
		let nextKey: string | null = null;
		let nextPriority = Number.POSITIVE_INFINITY;
		for (const [key, priority] of this.queuedPreviewPrioritiesByKey) {
			const order = PREVIEW_PRIORITY_ORDER[priority];
			if (order < nextPriority) {
				nextKey = key;
				nextPriority = order;
			}
		}

		return nextKey ? this.targetsByKey.get(nextKey) ?? null : null;
	}

	private updatePreviewState(
		target: NormalizedThumbnailPreviewTarget,
		options: {
			readonly allowSynchronousCalculation?: boolean;
			readonly reason?: string;
			readonly target?: SliceUriTarget | null;
		} = {},
	): ThumbnailPreviewState {
		this.queuedPreviewPrioritiesByKey.delete(target.key);
		const previous = this.statesByKey.get(target.key) ?? { kind: "idle" } satisfies ThumbnailPreviewState;
		const next = this.createPreviewState(target, options);
		const preserveReady = isReadyPreviewState(previous) && next.kind === "loading";
		const resolved = preserveReady ? previous : resolveReadyPreviewState(previous, next);
		logPerf("thumbnailPreview.update", {
			fileId: target.fileId,
			nextState: next.kind,
			previousState: previous.kind,
			preserveReady,
			reason: options.reason ?? "queue",
			resolvedState: resolved.kind,
			stateSource: getPreviewStateSource(resolved),
		});
		if (isSamePreviewState(previous, resolved)) {
			return previous;
		}

		this.statesByKey.set(target.key, resolved);
		this.syncRequestedPriorityForState(target, resolved);
		this.fireDidChangePreview(target);
		return resolved;
	}

	private updatePreviewStateFromPlotCacheEvent(target: NormalizedThumbnailPreviewTarget, plotType: string): void {
		const previous = this.statesByKey.get(target.key);
		if (
			(!previous || previous.kind === "idle" || previous.kind === "error") ||
			this.plotService.getState().activePlotType !== plotType
		) {
			return;
		}

		this.updatePreviewState(target, {
			reason: "plotCacheChanged",
		});
	}

	private createPreviewState(
		target: NormalizedThumbnailPreviewTarget,
		options: { readonly allowSynchronousCalculation?: boolean } = {},
	): ThumbnailPreviewState {
		const plotType = this.plotService.getState().activePlotType;
		const cachedCalculatedData = this.plotService.getCachedCalculatedData({
			fileId: target.fileId,
			plotType,
			target: target.target,
		});
		const displayModel = cachedCalculatedData
			? this.plotService.getCachedPlotDisplayModel?.({
				fileId: target.fileId,
				plotType,
				target: target.target,
			})
			: null;
		if (cachedCalculatedData && displayModel) {
			return {
				kind: "fastReady",
				model: {
					...displayModel.chart.model,
					signature: cachedCalculatedData.signature,
				},
				signature: cachedCalculatedData.signature,
			};
		}

		const model = cachedCalculatedData ?? (options.allowSynchronousCalculation
			? this.plotService.getCalculatedData({
				fileId: target.fileId,
				plotType,
				target: target.target,
			})
			: null);
		if (!model) {
			return { kind: "loading" };
		}

		return {
			kind: "ready",
			model,
			signature: model.signature,
		};
	}

	private rememberRequestedPriority(target: NormalizedThumbnailPreviewTarget, priority: ThumbnailPreviewPriority): void {
		const previous = this.requestedPreviewPrioritiesByKey.get(target.key);
		if (
			!previous ||
			PREVIEW_PRIORITY_ORDER[priority] < PREVIEW_PRIORITY_ORDER[previous]
		) {
			this.requestedPreviewPrioritiesByKey.set(target.key, priority);
		}
	}

	private syncRequestedPriorityForState(target: NormalizedThumbnailPreviewTarget, state: ThumbnailPreviewState): void {
		if (state.kind === "error" || state.kind === "idle") {
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
			this.targetsByFileId.delete(fileId);
		}
	}

	private prefetchPlotPreview(fileId: string, priority: ThumbnailPreviewPriority, target?: SliceUriTarget | null): void {
		const plotType = this.plotService.getState().activePlotType;
		if (!target) {
			this.plotService.prefetchCalculatedData([fileId], priority, plotType);
		}
		this.plotService.prefetchPlotDisplayModel?.({
			fileId,
			key: targetKey ?? fileId,
			target: input.target ?? null,
		};
	}

	private rememberTarget(target: NormalizedThumbnailPreviewTarget): void {
		this.targetsByKey.set(target.key, target);
	}

	private resolveTargetFromPlotCacheEvent(event: {
		readonly fileId?: string;
		readonly target?: SliceUriTarget | null;
	}): NormalizedThumbnailPreviewTarget | null {
		if (event.target) {
			const key = createThumbnailPreviewTargetKey(event.target);
			return key ? this.targetsByKey.get(key) ?? null : null;
		}

		const fileId = normalizePreviewFileId(event.fileId);
		return fileId ? this.targetsByKey.get(fileId) ?? { fileId, key: fileId } : null;
	}

	private fireDidChangePreview(target: NormalizedThumbnailPreviewTarget): void {
		this.onDidChangePreviewEmitter.fire({
			fileId: target.fileId,
			...(target.target ? { target: target.target } : {}),
		});
	}

	private prefetchPlotPreview(target: NormalizedThumbnailPreviewTarget, priority: ThumbnailPreviewPriority): void {
		const plotType = this.plotService.getState().activePlotType;
		if (!target.target) {
			this.plotService.prefetchCalculatedData([target.fileId], priority, plotType);
		}
		this.plotService.prefetchPlotDisplayModel?.({
			fileId: target.fileId,
			plotType,
			target,
		}, priority);
	}

	private rememberPreviewTarget(target: ResolvedThumbnailPreviewTarget): void {
		if (target.target) {
			this.targetsByFileId.set(target.fileId, target.target);
		} else {
			this.targetsByFileId.delete(target.fileId);
		}
	}

	private getFileIdsForPlotCacheEvent(event: { readonly fileId?: string; readonly target?: SliceUriTarget | null }): string[] {
		const fileId = normalizePreviewFileId(event.fileId);
		if (fileId) {
			return [fileId];
		}
		if (!event.target) {
			return [];
		}
		const result: string[] = [];
		for (const [candidateFileId, target] of this.targetsByFileId) {
			if (isSameSliceUriTarget(target, event.target)) {
				result.push(candidateFileId);
			}
		}
		return result;
	}
}

registerSingleton(IThumbnailPreviewService, BrowserThumbnailPreviewService, InstantiationType.Delayed);

const asThumbnailCanvas = (target: ThumbnailBitmapTarget): HTMLCanvasElement => {
	if (target instanceof HTMLCanvasElement) {
		return target;
	}

	throw new Error("Thumbnail rendering requires a browser canvas target.");
};

const normalizePreviewFileId = (fileId: unknown): string | null => {
	const normalized = String(fileId ?? "").trim();
	return normalized || null;
};

type ResolvedThumbnailPreviewTarget = {
	readonly fileId: string;
	readonly target?: SliceUriTarget | null;
};

const normalizePreviewTarget = (
	target: ThumbnailPreviewTarget,
): ResolvedThumbnailPreviewTarget | null => {
	if (typeof target === "string") {
		const fileId = normalizePreviewFileId(target);
		return fileId ? { fileId } : null;
	}

	const fileId = normalizePreviewFileId(target.fileId);
	return fileId
		? { fileId, target: target.target }
		: null;
};

const isSameSliceUriTarget = (
	first: SliceUriTarget,
	second: SliceUriTarget,
): boolean =>
	getSliceUriTargetKey(first) === getSliceUriTargetKey(second);

const getSliceUriTargetKey = (target: SliceUriTarget): string =>
	`${String(target.resource)}::${String(target.sheetId ?? "")}`;

const isSamePreviewState = (
	previous: ThumbnailPreviewState,
	next: ThumbnailPreviewState,
): boolean => {
	if (isReadyPreviewState(previous) && isReadyPreviewState(next)) {
		return previous.kind === next.kind && previous.signature === next.signature;
	}

	if (previous.kind !== next.kind) {
		return false;
	}

	switch (next.kind) {
		case "fastReady":
		case "ready":
		case "rawReady":
			return "signature" in previous && previous.signature === next.signature;
		case "error":
			return "message" in previous && previous.message === next.message;
		default:
			return true;
	}
};

const isReadyPreviewState = (
	state: ThumbnailPreviewState | undefined,
): state is Extract<ThumbnailPreviewState, { readonly kind: "fastReady" | "rawReady" | "ready" }> =>
	state?.kind === "fastReady" || state?.kind === "rawReady" || state?.kind === "ready";

const resolveReadyPreviewState = (
	previous: ThumbnailPreviewState,
	next: ThumbnailPreviewState,
): ThumbnailPreviewState => {
	if (
		!isReadyPreviewState(previous) ||
		!isReadyPreviewState(next) ||
		previous.signature !== next.signature
	) {
		return next;
	}

	return getPreviewReadyRank(next) > getPreviewReadyRank(previous)
		? next
		: previous;
};

const getPreviewReadyRank = (
	state: Extract<ThumbnailPreviewState, { readonly kind: "fastReady" | "rawReady" | "ready" }>,
): number => {
	switch (state.kind) {
		case "fastReady":
			return 2;
		case "rawReady":
		case "ready":
			return 1;
	}
};

const getPreviewStateSource = (state: ThumbnailPreviewState): string => {
	switch (state.kind) {
		case "fastReady":
			return "displayCache";
		case "ready":
		case "rawReady":
			return "calculatedData";
		default:
			return state.kind;
	}
};
