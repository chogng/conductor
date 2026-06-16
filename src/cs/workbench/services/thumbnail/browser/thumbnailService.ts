/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { Emitter } from "src/cs/base/common/event";
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
import { startPerf } from "src/cs/workbench/common/perf";
import {
	createThumbnailBitmapCache,
	drawThumbnailBitmap,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailBitmap";

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

	constructor(
		@IPlotService private readonly plotService: IPlotService,
		@ISessionService private readonly sessionService: ISessionService,
	) {
		super();

		this._register(this.plotService.onDidChangePlotState(() => this.invalidate()));
		this._register(this.sessionService.onDidChangeSession(() => this.invalidate()));
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
		if (previous && previous.kind !== "idle") {
			endPerf({ cacheHit: true, state: previous.kind });
			return previous;
		}

		const next = this.createPreviewState(normalizedFileId);
		this.statesByFileId.set(normalizedFileId, next);
		this.onDidChangePreviewEmitter.fire({ fileId: normalizedFileId });
		endPerf({ cacheHit: false, state: next.kind });
		return next;
	}

	public prefetch(fileIds: readonly string[], priority: "visible" | "nearby" | "idle"): void {
		const endPerf = startPerf(`thumbnailPreview.prefetch.${priority}`, {
			fileCount: fileIds.length,
		});
		for (const fileId of fileIds) {
			this.request(fileId, priority);
		}
		endPerf();
	}

	public invalidate(fileIds?: readonly string[]): void {
		const normalizedFileIds = fileIds
			?.map(normalizePreviewFileId)
			.filter((fileId): fileId is string => Boolean(fileId));
		const changedFileIds = normalizedFileIds?.length
			? normalizedFileIds.filter(fileId => this.statesByFileId.delete(fileId))
			: [...this.statesByFileId.keys()];
		if (!normalizedFileIds?.length) {
			this.statesByFileId.clear();
		}
		for (const fileId of changedFileIds) {
			this.onDidChangePreviewEmitter.fire({ fileId });
		}
	}

	private createPreviewState(fileId: string): ThumbnailPreviewState {
		const snapshot = this.sessionService.getSnapshot();
		if (!snapshot.filesById[fileId]) {
			return {
				kind: "error",
				message: localize("thumbnail.preview.fileUnavailable", "File is no longer available."),
			};
		}

		const model = this.plotService.getCalculatedData({
			fileId,
			plotType: this.plotService.getState().activePlotType,
			snapshot,
		});
		if (!model) {
			return { kind: "loading" };
		}

		return {
			kind: "ready",
			model,
			signature: model.signature,
		};
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
