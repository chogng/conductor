/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
	PlotAxisTitleContext,
	PlotDisplayModel,
	PlotDisplayModelRequest,
	PlotLegendModel,
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";

export type ChartPane = "chart" | "inspector";

export type ChartViewInput = {
	readonly visiblePanes?: readonly ChartPane[];
	readonly activePlotType?: PlotType;
	readonly onActivePlotTypeChange?: (next: PlotType) => void;
	readonly hasAnalysisData?: boolean;
	readonly chartFileOptions?: readonly ChartFileOption[];
	readonly createPlotDisplayModel?: (request: PlotDisplayModelRequest) => PlotDisplayModel | null;
	readonly plotDisplayModel?: PlotDisplayModel | null;
	readonly plotLegendModel?: PlotLegendModel | null;
	readonly processingStatus?: Partial<ProcessingStatus>;
	readonly activeFileId?: string | null;
	readonly onActiveFileIdChange?: (nextFileId: string | null) => void;
	readonly showFileSelect?: boolean;
	readonly onPlotUnitChange?: (
		fileId: string,
		axis: "x" | "y",
		unit: XUnit | YUnit,
	) => Promise<unknown> | void;
	readonly onPlotYScaleChange?: (
		fileId: string,
		scale: "linear" | "log",
	) => Promise<unknown> | void;
	readonly onPlotAxisTitleChange?: (
		context: PlotAxisTitleContext,
		title: string,
		defaultTitle: string,
	) => void;
	readonly hiddenLegendKeys?: readonly string[];
	readonly legendLabels?: Readonly<Record<string, string>>;
	readonly onLegendLabelChange?: (
		fileId: string,
		seriesId: string,
		label: string | null,
	) => void;
	readonly inspectorXAxisLabelOverride?: string;
	readonly inspectorYAxisLabelOverride?: string;
	readonly onInspectorXAxisLabelChange?: (nextLabel: string) => void;
	readonly onInspectorYAxisLabelChange?: (nextLabel: string) => void;
	readonly onXAxisLabelChange?: (nextLabel: string) => void;
	readonly onYAxisLabelChange?: (nextLabel: string) => void;
	readonly xAxisLabelOverride?: string;
	readonly yAxisLabelOverride?: string;
	readonly originOpenPlotOptions?: OriginPlotOptions;
	readonly onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
	readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
	readonly onPlotAxisSettingsChange?: (updates: unknown) => Promise<unknown> | void;
	readonly shouldMountCharts?: boolean;
};
