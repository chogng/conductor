/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Event } from "src/cs/base/common/event";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";

export const IThumbnailService = createDecorator<IThumbnailService>("thumbnailService");
export const IThumbnailPreviewService = createDecorator<IThumbnailPreviewService>("thumbnailPreviewService");
export const ThumbnailContributionId = "workbench.contrib.thumbnail";

export type ThumbnailPreviewPriority = "hover" | "visible" | "recent" | "nearby" | "idle";

export type ThumbnailPreviewPlotModel = PlotMainRenderModelSource & {
	readonly signature: string;
};

export type ThumbnailPreviewState =
	| { readonly kind: "idle" }
	| { readonly kind: "loading" }
	| { readonly kind: "fastReady"; readonly model: ThumbnailPreviewPlotModel; readonly signature: string }
	| { readonly kind: "rawReady"; readonly model: ThumbnailPreviewPlotModel; readonly signature: string }
	| { readonly kind: "ready"; readonly model: ThumbnailPreviewPlotModel; readonly signature: string }
	| { readonly kind: "error"; readonly message: string };

export type ThumbnailPreviewChangeEvent = {
	readonly fileId: string;
};

export type ThumbnailBitmapOptions = {
	readonly model: PlotMainRenderModelSource & {
		readonly signature: string;
	};
	readonly originOpenPlotOptions?: {
		readonly lineWidth?: unknown;
		readonly type?: unknown;
	};
	readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
	readonly plotType: PlotType;
};

export type ThumbnailBitmapTarget = object;

export interface IThumbnailService {
	readonly _serviceBrand: undefined;

	clear(): void;
	drawPlotThumbnail(target: ThumbnailBitmapTarget, options: ThumbnailBitmapOptions): void;
	warmPlotThumbnail(options: ThumbnailBitmapOptions): void;
}

export interface IThumbnailPreviewService {
	readonly _serviceBrand: undefined;
	readonly onDidChangePreview: Event<ThumbnailPreviewChangeEvent>;

	get(fileId: string): ThumbnailPreviewState;
	request(fileId: string, priority: ThumbnailPreviewPriority): ThumbnailPreviewState;
	prefetch(fileIds: readonly string[], priority: "visible" | "recent" | "nearby" | "idle"): void;
	invalidate(fileIds?: readonly string[]): void;
}
