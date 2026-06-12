/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";

export const IChartService = createDecorator<IChartService>("chartService");
export const ChartContributionId = "workbench.contrib.chart";
export const ChartViewId = "workbench.chart";
export const EDIT_CHART_X_AXIS_TITLE_COMMAND_ID = "workbench.chart.editXAxisTitle";
export const EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID = "workbench.chart.editYAxisTitle";

export type ChartDetailPane = "inspector";
export type ChartAxisTitlePane = "chart" | "inspector";
export type ChartAxis = "x" | "y";

export type ChartAxisTitleEditRequest = {
	readonly axis: ChartAxis;
	readonly pane: ChartAxisTitlePane;
};

export type ChartState = {
	readonly visibleDetailPanes: readonly ChartDetailPane[];
	readonly hiddenLegendKeysByContext: Readonly<Record<string, readonly string[]>>;
	readonly legendPopoverContextKey: string | null;
};

export interface IChartService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeChartState: Event<ChartState>;
	readonly onDidChangeChartViewInput: Event<void>;

	getState(): ChartState;
	getViewInput(): ChartViewInput | null;
	updateViewInput(input: ChartViewInput): void;
	toggleDetailPane(pane: ChartDetailPane): void;
	setLegendPopoverContextKey(contextKey: string | null): void;
	getHiddenLegendKeys(contextKey: string, liveLegendKeys: readonly string[]): readonly string[];
	toggleHiddenLegendKey(contextKey: string, legendKey: string, liveLegendKeys: readonly string[]): void;
}
