/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";
import type {
	ChartProcessingStatus,
	ChartViewInput,
} from "src/cs/workbench/services/chart/common/chartViewInput";
import type { URI } from "src/cs/base/common/uri";

export type CreateChartViewInputOptions = {
	readonly activeFileId: string | null;
	readonly activeResource?: URI | null;
	readonly activeSheetId?: string | null;
	readonly activePlotType: PlotType;
	readonly chartFileOptions: readonly ChartFileOption[];
	readonly hasChartData?: boolean;
	readonly processingStatus?: Partial<ChartProcessingStatus>;
	readonly showFileSelect?: boolean;
	readonly shouldMountCharts?: boolean;
};

export const createChartViewInput = (
	options: CreateChartViewInputOptions,
): ChartViewInput => {
	const { activeFileId } = options;
	const derivedHasChartData = Boolean(
		activeFileId &&
			options.chartFileOptions.some(option => option.fileId === activeFileId),
	);
	const hasChartData = options.hasChartData ?? derivedHasChartData;
	const chartFileOptions = options.showFileSelect === false && hasChartData
		? options.chartFileOptions.filter(option => option.fileId === activeFileId)
		: options.chartFileOptions;

	return {
		activeFileId,
		activeResource: options.activeResource ?? null,
		activeSheetId: options.activeSheetId ?? null,
		activePlotType: options.activePlotType,
		chartFileOptions,
		hasChartData,
		processingStatus: hasChartData ? undefined : options.processingStatus,
		showFileSelect: options.showFileSelect,
		shouldMountCharts: options.shouldMountCharts,
	};
};
