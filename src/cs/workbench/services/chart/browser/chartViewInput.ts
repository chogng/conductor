/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";

export type CreateChartViewInputOptions = {
	readonly activeFileId: string | null;
	readonly activePlotType: PlotType;
	readonly chartFileOptions: readonly ChartFileOption[];
	readonly processingStatus?: Partial<ProcessingStatus>;
	readonly showFileSelect?: boolean;
	readonly shouldMountCharts?: boolean;
};

export const createChartViewInput = (
	options: CreateChartViewInputOptions,
): ChartViewInput => {
	const { activeFileId } = options;
	const hasChartData = Boolean(
		activeFileId &&
			options.chartFileOptions.some(option => option.fileId === activeFileId),
	);
	const chartFileOptions = options.showFileSelect === false && hasChartData
		? options.chartFileOptions.filter(option => option.fileId === activeFileId)
		: options.chartFileOptions;

	return {
		activeFileId,
		activePlotType: options.activePlotType,
		chartFileOptions,
		hasChartData,
		processingStatus: hasChartData ? undefined : options.processingStatus,
		showFileSelect: options.showFileSelect,
		shouldMountCharts: options.shouldMountCharts,
	};
};
