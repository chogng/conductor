/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event } from "src/cs/base/common/event";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IThumbnailPreviewService,
	IThumbnailService,
	type IThumbnailPreviewService as IThumbnailPreviewServiceType,
	type ThumbnailPreviewChangeEvent,
	type ThumbnailPreviewPriority,
	type ThumbnailPreviewState,
	type IThumbnailService as IThumbnailServiceType,
	type ThumbnailBitmapOptions,
	type ThumbnailBitmapTarget,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { logPerf, startPerf } from "src/cs/workbench/common/perf";
import {
	createThumbnailBitmapCache,
	drawThumbnailBitmap,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailBitmap";

const PREVIEW_PRIORITY_ORDER: Readonly<Record<ThumbnailPreviewPriority, number>> = {
	hover: 0,
	visible: 1,
	nearby: 2,
	idle: 3,
};
const PREVIEW_BATCH_LIMIT = 4;
const PREVIEW_FRAME_BUDGET_MS = 6;

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
	private cancelQueuedPreviewFlush: (() => void) | null = null;

	constructor(
		@IPlotService private readonly plotService: IPlotService,
		@ISessionService private readonly sessionService: ISessionService,
	) {
		super();

		this._register(this.plotService.onDidChangeCalculatedDataCache(event => {
			this.updatePreviewStateFromPlotCacheEvent(event.fileId, event.plotType);
		}));
		this._register((this.plotService.onDidChangePlotDisplayModelCache ?? Event.None)(event => {
			this.updatePreviewStateFromPlotCacheEvent(event.fileId, event.plotType);
		}));
		this._register(this.plotService.onDidChangePlotState(() => this.invalidate()));
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason === "sessionCleared" || !event.fileIds?.length) {
				this.invalidate();
				return;
			}

			this.invalidate(event.fileIds);
		}));
		this._register({ dispose: () => this.cancelScheduledPreviewFlush() });
	}

	public get(fileId: string): ThumbnailPreviewState {
		const normalizedFileId = normalizePreviewFileId(fileId);
		if (!normalizedFileId) {
			return { kind: "idle" };
		}

		return this.statesByFileId.get(normalizedFileId) ?? { kind: "idle" };
	}

	public request(fileId: string, priority: ThumbnailPreviewPriority): ThumbnailPreviewState {
		const normalizedFileId = normalizePreviewFileId(fileId);
		if (!normalizedFileId) {
			return { kind: "idle" };
		}

		const endPerf = startPerf("thumbnailPreview.request", {
			fileId: normalizedFileId,
			priority,
		});
		const previous = this.statesByFileId.get(normalizedFileId);
		this.rememberRequestedPriority(normalizedFileId, priority);
		if (previous && previous.kind !== "idle") {
			this.prefetchPlotPreview(normalizedFileId, priority);
			if (previous.kind === "loading") {
				if (priority === "hover") {
					const next = this.updatePreviewState(normalizedFileId, {
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
				this.queuePreview(normalizedFileId, priority);
			}
			endPerf({
				cacheHit: true,
				state: previous.kind,
				stateSource: getPreviewStateSource(previous),
			});
			return previous;
		}

		if (priority === "hover") {
			this.rememberRequestedPriority(normalizedFileId, priority);
			const next = this.createPreviewState(normalizedFileId, {
				allowSynchronousCalculation: true,
			});
			this.statesByFileId.set(normalizedFileId, next);
			this.syncRequestedPriorityForState(normalizedFileId, next);
			if (next.kind === "loading") {
				this.queuePreview(normalizedFileId, priority);
			} else {
				this.queuedPreviewPrioritiesByFileId.delete(normalizedFileId);
			}
			this.onDidChangePreviewEmitter.fire({ fileId: normalizedFileId });
			endPerf({
				cacheHit: false,
				deferred: next.kind === "loading",
				state: next.kind,
				stateSource: getPreviewStateSource(next),
				synchronous: next.kind === "ready",
			});
			return next;
		}

		this.prefetchPlotPreview(normalizedFileId, priority);
		const next = this.createPreviewState(normalizedFileId);
		this.statesByFileId.set(normalizedFileId, next);
		this.syncRequestedPriorityForState(normalizedFileId, next);
		this.queuedPreviewPrioritiesByFileId.delete(normalizedFileId);
		if (next.kind === "loading") {
			this.queuePreview(normalizedFileId, priority);
		}
		this.onDidChangePreviewEmitter.fire({ fileId: normalizedFileId });
		endPerf({
			cacheHit: false,
			state: next.kind,
			stateSource: getPreviewStateSource(next),
		});
		return next;
	}

	public prefetch(fileIds: readonly string[], priority: "visible" | "nearby" | "idle"): void {
		const endPerf = startPerf(`thumbnailPreview.prefetch.${priority}`, {
			fileCount: fileIds.length,
		});
		for (const fileId of fileIds) {
			this.queuePreview(fileId, priority);
		}
		endPerf();
	}

	public invalidate(fileIds?: readonly string[]): void {
		const normalizedFileIds = fileIds
			?.map(normalizePreviewFileId)
			.filter((fileId): fileId is string => Boolean(fileId));
		const changedFileIds: string[] = [];
		if (!normalizedFileIds?.length) {
			changedFileIds.push(...this.statesByFileId.keys());
			this.statesByFileId.clear();
			this.requestedPreviewPrioritiesByFileId.clear();
			this.queuedPreviewPrioritiesByFileId.clear();
			this.cancelScheduledPreviewFlush();
		} else {
			for (const fileId of normalizedFileIds) {
				if (this.invalidateTargetedPreview(fileId)) {
					changedFileIds.push(fileId);
				}
			}
		}
		for (const fileId of changedFileIds) {
			this.onDidChangePreviewEmitter.fire({ fileId });
		}
	}

	private invalidateTargetedPreview(fileId: string): boolean {
		const previous = this.statesByFileId.get(fileId);
		const requestedPriority = this.requestedPreviewPrioritiesByFileId.get(fileId);
		this.queuedPreviewPrioritiesByFileId.delete(fileId);
		if (!previous) {
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
			return false;
		}

		if (isReadyPreviewState(previous) && requestedPriority) {
			this.queuePreview(fileId, requestedPriority, { force: true });
			return false;
		}

		if (previous?.kind !== "loading" || !requestedPriority) {
			this.statesByFileId.delete(fileId);
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
			return true;
		}

		const next = this.createPreviewState(fileId, {
			allowSynchronousCalculation: requestedPriority === "hover",
		});
		if (next.kind === "loading") {
			this.statesByFileId.set(fileId, next);
			this.queuePreview(fileId, requestedPriority);
			return false;
		}

		this.statesByFileId.set(fileId, next);
		this.syncRequestedPriorityForState(fileId, next);
		return true;
	}

	private queuePreview(
		fileId: string,
		priority: ThumbnailPreviewPriority,
		options: { readonly force?: boolean } = {},
	): void {
		const normalizedFileId = normalizePreviewFileId(fileId);
		if (!normalizedFileId) {
			return;
		}

		this.rememberRequestedPriority(normalizedFileId, priority);
		const previous = this.statesByFileId.get(normalizedFileId);
		if (!options.force && previous && previous.kind !== "idle" && previous.kind !== "loading") {
			return;
		}
		this.prefetchPlotPreview(normalizedFileId, priority);

		const queuedPriority = this.queuedPreviewPrioritiesByFileId.get(normalizedFileId);
		if (
			!queuedPriority ||
			PREVIEW_PRIORITY_ORDER[priority] < PREVIEW_PRIORITY_ORDER[queuedPriority]
		) {
			this.queuedPreviewPrioritiesByFileId.set(normalizedFileId, priority);
		}
		this.schedulePreviewFlush();
	}

	private schedulePreviewFlush(): void {
		if (this.cancelQueuedPreviewFlush || !this.queuedPreviewPrioritiesByFileId.size) {
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
		while (this.queuedPreviewPrioritiesByFileId.size && processed < PREVIEW_BATCH_LIMIT) {
			const nextFileId = this.dequeueNextPreviewFileId();
			if (!nextFileId) {
				break;
			}

			this.updatePreviewState(nextFileId);
			processed += 1;
			if (Date.now() - startedAt >= PREVIEW_FRAME_BUDGET_MS) {
				break;
			}
		}

		if (this.queuedPreviewPrioritiesByFileId.size) {
			this.schedulePreviewFlush();
		}
	}

	private dequeueNextPreviewFileId(): string | null {
		let nextFileId: string | null = null;
		let nextPriority = Number.POSITIVE_INFINITY;
		for (const [fileId, priority] of this.queuedPreviewPrioritiesByFileId) {
			const order = PREVIEW_PRIORITY_ORDER[priority];
			if (order < nextPriority) {
				nextFileId = fileId;
				nextPriority = order;
			}
		}

		return nextFileId;
	}

	private updatePreviewState(
		fileId: string,
		options: {
			readonly allowSynchronousCalculation?: boolean;
			readonly reason?: string;
		} = {},
	): ThumbnailPreviewState {
		this.queuedPreviewPrioritiesByFileId.delete(fileId);
		const previous = this.statesByFileId.get(fileId) ?? { kind: "idle" } satisfies ThumbnailPreviewState;
		const next = this.createPreviewState(fileId, options);
		const preserveReady = isReadyPreviewState(previous) && next.kind === "loading";
		const resolved = preserveReady ? previous : resolveReadyPreviewState(previous, next);
		logPerf("thumbnailPreview.update", {
			fileId,
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

		this.statesByFileId.set(fileId, resolved);
		this.syncRequestedPriorityForState(fileId, resolved);
		this.onDidChangePreviewEmitter.fire({ fileId });
		return resolved;
	}

	private updatePreviewStateFromPlotCacheEvent(fileId: string, plotType: string): void {
		const normalizedFileId = normalizePreviewFileId(fileId);
		if (!normalizedFileId) {
			return;
		}

		const previous = this.statesByFileId.get(normalizedFileId);
		if (
			(!previous || previous.kind === "idle" || previous.kind === "error") ||
			this.plotService.getState().activePlotType !== plotType
		) {
			return;
		}

		this.updatePreviewState(normalizedFileId, {
			reason: "plotCacheChanged",
		});
	}

	private createPreviewState(
		fileId: string,
		options: { readonly allowSynchronousCalculation?: boolean } = {},
	): ThumbnailPreviewState {
		const snapshot = this.sessionService.getSnapshot();
		if (!snapshot.filesById[fileId]) {
			return {
				kind: "error",
				message: localize("thumbnail.preview.fileUnavailable", "File is no longer available."),
			};
		}

		const plotType = this.plotService.getState().activePlotType;
		const cachedCalculatedData = this.plotService.getCachedCalculatedData({
			fileId,
			plotType,
			snapshot,
		});
		const displayModel = cachedCalculatedData
			? this.plotService.getCachedPlotDisplayModel?.({
				fileId,
				plotType,
				snapshot,
			})
			: null;
		if (displayModel) {
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
				fileId,
				plotType,
				snapshot,
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

	private rememberRequestedPriority(fileId: string, priority: ThumbnailPreviewPriority): void {
		const previous = this.requestedPreviewPrioritiesByFileId.get(fileId);
		if (
			!previous ||
			PREVIEW_PRIORITY_ORDER[priority] < PREVIEW_PRIORITY_ORDER[previous]
		) {
			this.requestedPreviewPrioritiesByFileId.set(fileId, priority);
		}
	}

	private syncRequestedPriorityForState(fileId: string, state: ThumbnailPreviewState): void {
		if (state.kind === "error" || state.kind === "idle") {
			this.requestedPreviewPrioritiesByFileId.delete(fileId);
		}
	}

	private prefetchPlotPreview(fileId: string, priority: ThumbnailPreviewPriority): void {
		const plotType = this.plotService.getState().activePlotType;
		this.plotService.prefetchCalculatedData([fileId], priority, plotType);
		this.plotService.prefetchPlotDisplayModel?.({
			fileId,
			plotType,
		}, priority);
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
