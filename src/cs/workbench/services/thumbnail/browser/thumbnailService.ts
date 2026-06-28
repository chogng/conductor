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
import { IPlotService, type PlotType } from "src/cs/workbench/services/plot/common/plot";
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
	readonly fileId?: string | null;
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
	private readonly statesByKey = new Map<string, ThumbnailPreviewState>();
	private readonly requestedPreviewPrioritiesByKey = new Map<string, ThumbnailPreviewPriority>();
	private readonly queuedPreviewPrioritiesByKey = new Map<string, ThumbnailPreviewPriority>();
	private readonly targetsByKey = new Map<string, NormalizedThumbnailPreviewTarget>();
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
		const normalizedTarget = normalizePreviewTarget(target);
		if (!normalizedTarget) {
			return { kind: "idle" };
		}

		this.rememberTarget(normalizedTarget);
		return this.statesByKey.get(normalizedTarget.key) ?? { kind: "idle" };
	}

	public request(target: ThumbnailPreviewTarget, priority: ThumbnailPreviewPriority): ThumbnailPreviewState {
		const normalizedTarget = normalizePreviewTarget(target);
		if (!normalizedTarget) {
			return { kind: "idle" };
		}

		this.rememberTarget(normalizedTarget);
		const endPerf = startPerf("thumbnailPreview.request", {
			fileId: normalizedTarget.fileId ?? null,
			priority,
			targetKey: normalizedTarget.key,
		});
		const previous = this.statesByKey.get(normalizedTarget.key);
		this.rememberRequestedPriority(normalizedTarget, priority);
		if (previous && previous.kind !== "idle") {
			this.prefetchPlotPreview(normalizedTarget, priority);
			if (previous.kind === "loading") {
				if (priority === "hover") {
					const next = this.updatePreviewState(normalizedTarget, {
						allowSynchronousCalculation: true,
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
			const next = this.createPreviewState(normalizedTarget, {
				allowSynchronousCalculation: true,
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

		this.prefetchPlotPreview(normalizedTarget, priority);
		const next = this.createPreviewState(normalizedTarget);
		this.statesByKey.set(normalizedTarget.key, next);
		this.syncRequestedPriorityForState(normalizedTarget, next);
		this.queuedPreviewPrioritiesByKey.delete(normalizedTarget.key);
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
		const normalizedTargets = targets
			?.map(normalizePreviewTarget)
			.filter((target): target is NormalizedThumbnailPreviewTarget => Boolean(target));
		const changedTargets: NormalizedThumbnailPreviewTarget[] = [];
		if (!normalizedTargets?.length) {
			for (const [key] of this.statesByKey) {
				changedTargets.push(this.targetsByKey.get(key) ?? { fileId: key, key });
			}
			this.statesByKey.clear();
			this.requestedPreviewPrioritiesByKey.clear();
			this.queuedPreviewPrioritiesByKey.clear();
			this.targetsByKey.clear();
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
			this.requestedPreviewPrioritiesByKey.delete(target.key);
			this.targetsByKey.delete(target.key);
			return false;
		}

		if (isReadyPreviewState(previous) && requestedPriority) {
			this.queuePreview(target, requestedPriority, { force: true });
			return false;
		}

		if (previous.kind !== "loading" || !requestedPriority) {
			this.statesByKey.delete(target.key);
			this.requestedPreviewPrioritiesByKey.delete(target.key);
			this.targetsByKey.delete(target.key);
			return true;
		}

		const next = this.createPreviewState(target, {
			allowSynchronousCalculation: requestedPriority === "hover",
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
		const target = normalizePreviewTarget(input);
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

			this.updatePreviewState(nextTarget);
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

		return nextKey ? this.targetsByKey.get(nextKey) ?? { fileId: nextKey, key: nextKey } : null;
	}

	private updatePreviewState(
		target: NormalizedThumbnailPreviewTarget,
		options: {
			readonly allowSynchronousCalculation?: boolean;
			readonly reason?: string;
		} = {},
	): ThumbnailPreviewState {
		this.queuedPreviewPrioritiesByKey.delete(target.key);
		const previous = this.statesByKey.get(target.key) ?? { kind: "idle" } satisfies ThumbnailPreviewState;
		const next = this.createPreviewState(target, options);
		const preserveReady = isReadyPreviewState(previous) && next.kind === "loading";
		const resolved = preserveReady ? previous : resolveReadyPreviewState(previous, next);
		logPerf("thumbnailPreview.update", {
			fileId: target.fileId ?? null,
			nextState: next.kind,
			previousState: previous.kind,
			preserveReady,
			reason: options.reason ?? "queue",
			resolvedState: resolved.kind,
			stateSource: getPreviewStateSource(resolved),
			targetKey: target.key,
		});
		if (isSamePreviewState(previous, resolved)) {
			return previous;
		}

		this.statesByKey.set(target.key, resolved);
		this.syncRequestedPriorityForState(target, resolved);
		this.fireDidChangePreview(target);
		return resolved;
	}

	private updatePreviewStateFromPlotCacheEvent(event: {
		readonly fileId?: string;
		readonly plotType: string;
		readonly target?: SliceUriTarget | null;
	}): void {
		const targets = this.resolveTargetsFromPlotCacheEvent(event);
		if (!targets.length) {
			return;
		}

		for (const target of targets) {
			const previous = this.statesByKey.get(target.key);
			if (
				(!previous || previous.kind === "idle" || previous.kind === "error") ||
				this.plotService.getState().activePlotType !== event.plotType
			) {
				continue;
			}

			this.updatePreviewState(target, {
				reason: "plotCacheChanged",
			});
		}
	}

	private createPreviewState(
		target: NormalizedThumbnailPreviewTarget,
		options: { readonly allowSynchronousCalculation?: boolean } = {},
	): ThumbnailPreviewState {
		const plotType = this.plotService.getState().activePlotType;
		const input = createPlotPreviewInput(target, plotType);
		const cachedCalculatedData = this.plotService.getCachedCalculatedData(input);
		const displayModel = cachedCalculatedData
			? this.plotService.getCachedPlotDisplayModel?.(input)
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
			? this.plotService.getCalculatedData(input)
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
			this.requestedPreviewPrioritiesByKey.delete(target.key);
			this.queuedPreviewPrioritiesByKey.delete(target.key);
			this.targetsByKey.delete(target.key);
		}
	}

	private rememberTarget(target: NormalizedThumbnailPreviewTarget): void {
		this.targetsByKey.set(target.key, target);
	}

	private resolveTargetsFromPlotCacheEvent(event: {
		readonly fileId?: string;
		readonly target?: SliceUriTarget | null;
	}): readonly NormalizedThumbnailPreviewTarget[] {
		if (event.target) {
			const key = createThumbnailPreviewTargetKey(event.target);
			const target = key ? this.targetsByKey.get(key) : null;
			return target ? [target] : [];
		}

		const fileId = normalizePreviewFileId(event.fileId);
		if (!fileId) {
			return [];
		}

		const target = this.targetsByKey.get(fileId);
		return target ? [target] : [{ fileId, key: fileId }];
	}

	private fireDidChangePreview(target: NormalizedThumbnailPreviewTarget): void {
		this.onDidChangePreviewEmitter.fire({
			...(target.fileId ? { fileId: target.fileId } : {}),
			...(target.target ? { target: target.target } : {}),
		});
	}

	private prefetchPlotPreview(target: NormalizedThumbnailPreviewTarget, priority: ThumbnailPreviewPriority): void {
		const plotType = this.plotService.getState().activePlotType;
		if (!target.target) {
			const fileId = normalizePreviewFileId(target.fileId);
			if (fileId) {
				this.plotService.prefetchCalculatedData([fileId], priority, plotType);
			}
		}
		this.plotService.prefetchPlotDisplayModel?.(
			createPlotPreviewInput(target, plotType),
			priority,
		);
	}
}

registerSingleton(IThumbnailPreviewService, BrowserThumbnailPreviewService, InstantiationType.Delayed);

const asThumbnailCanvas = (target: ThumbnailBitmapTarget): HTMLCanvasElement => {
	if (target instanceof HTMLCanvasElement) {
		return target;
	}

	throw new Error("Thumbnail rendering requires a browser canvas target.");
};

const createPlotPreviewInput = (
	target: NormalizedThumbnailPreviewTarget,
	plotType: PlotType,
) => target.target
	? {
		plotType,
		target: target.target,
	}
	: {
		fileId: normalizePreviewFileId(target.fileId),
		plotType,
	};

const normalizePreviewFileId = (fileId: unknown): string | null => {
	const normalized = String(fileId ?? "").trim();
	return normalized || null;
};

const normalizePreviewTarget = (
	target: ThumbnailPreviewTarget | NormalizedThumbnailPreviewTarget,
): NormalizedThumbnailPreviewTarget | null => {
	if (typeof target === "object" && "key" in target) {
		return target;
	}

	if (typeof target === "string") {
		const fileId = normalizePreviewFileId(target);
		return fileId ? { fileId, key: fileId } : null;
	}

	const key = createThumbnailPreviewTargetKey(target);
	if (!key) {
		return null;
	}

	return {
		key,
		target,
	};
};

const createThumbnailPreviewTargetKey = (
	target: SliceUriTarget,
): string | null => {
	const resourceKey = String(target.resource ?? "").trim();
	return resourceKey
		? `${resourceKey}::${String(target.sheetId ?? "")}`
		: null;
};

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
