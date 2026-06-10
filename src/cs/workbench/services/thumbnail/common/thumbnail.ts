/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";

export const IThumbnailService = createDecorator<IThumbnailService>("thumbnailService");
export const ThumbnailContributionId = "workbench.contrib.thumbnail";

export type ThumbnailRequest = {
	readonly fileId: string;
	readonly height: number;
	readonly plotType: PlotType;
	readonly settingsSignature: string;
	readonly width: number;
};

export type ThumbnailCacheKey = {
	readonly fileId: string;
	readonly plotModelSignature: string;
	readonly size: {
		readonly height: number;
		readonly width: number;
	};
	readonly theme?: string;
};

export type ThumbnailResult = {
	readonly createdAt: number;
	readonly diagnostics: readonly string[];
	readonly key: ThumbnailCacheKey;
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
}
