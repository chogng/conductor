/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
	IPlotService,
	PlotAxisSettingsByFileId,
	PlotDisplayModelRequest,
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";

export type CreateChartViewInputOptions = {
	readonly activeFileId: string | null;
	readonly activePlotType: PlotType;
	readonly axisSettings?: PlotAxisSettingsByFileId;
	readonly chartFileOptions: readonly ChartFileOption[];
	readonly legendLabels?: Readonly<Record<string, string>>;
	readonly onActiveFileIdChange?: (nextFileId: string | null) => void;
	readonly onOriginOpenPlotOptionsChange?: (updates: Partial<OriginPlotOptions>) => Promise<void> | void;
	readonly onPlotAxisSettingsChange?: (updates: Record<string, unknown>) => Promise<void> | void;
	readonly onPlotUnitChange?: (
		fileId: string,
		axis: "x" | "y",
		unit: XUnit | YUnit,
	) => Promise<unknown> | void;
	readonly onPlotYScaleChange?: (
		fileId: string,
		scale: "linear" | "log",
	) => Promise<unknown> | void;
	readonly originOpenPlotOptions?: OriginPlotOptions;
	readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
	readonly plotService: IPlotService;
	readonly processingStatus?: Partial<ProcessingStatus>;
	readonly showFileSelect?: boolean;
	readonly shouldMountCharts?: boolean;
};

export const createChartViewInput = (
	options: CreateChartViewInputOptions,
): ChartViewInput => {
	const {
		activeFileId,
		axisSettings,
		plotService,
	} = options;

	return {
		activeFileId,
		activePlotType: options.activePlotType,
		chartFileOptions: options.chartFileOptions,
		createPlotDisplayModel: (request: PlotDisplayModelRequest) =>
			plotService.getPlotDisplayModel({
				...request,
				axisSettings,
				fileId: activeFileId,
			}),
		hasChartData: Boolean(activeFileId),
		legendLabels: options.legendLabels,
		onActiveFileIdChange: options.onActiveFileIdChange,
		onOriginOpenPlotOptionsChange: options.onOriginOpenPlotOptionsChange,
		onPlotAxisSettingsChange: options.onPlotAxisSettingsChange,
		onPlotUnitChange: options.onPlotUnitChange,
		onPlotYScaleChange: options.onPlotYScaleChange,
		originOpenPlotOptions: options.originOpenPlotOptions,
		plotAxisSettings: options.plotAxisSettings,
		plotLegendModel: plotService.getPlotLegendModel({
			fileId: activeFileId,
		}),
		processingStatus: options.processingStatus,
		showFileSelect: options.showFileSelect,
		shouldMountCharts: options.shouldMountCharts,
	};
};
