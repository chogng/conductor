/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotMainRenderModel,
	PlotMainRenderModelSource,
} from "src/cs/workbench/services/plot/common/plotModel";
import {
	getPlotSeriesColor,
	type PlotSeriesColorMap,
} from "src/cs/workbench/services/plot/common/plotColors";

export const createPlotMainRenderModel = (
	source: PlotMainRenderModelSource,
	seriesColors: PlotSeriesColorMap,
): PlotMainRenderModel => ({
	axisLabels: source.activeFile
		? {
			xLabel: source.activeFile.xLabel,
			yLabel: source.activeFile.yLabel,
		}
		: null,
	pointsCount: source.pointsCount,
	seriesList: source.seriesList.map(series => {
		const color = getPlotSeriesColor(seriesColors, series);
		return color
			? {
				...series,
				color,
			}
			: series;
	}),
	xDomain: source.xDomain,
	xUnitLabel: source.xUnitLabel,
	yDomain: source.yDomain,
	yUnitLabel: source.yUnitLabel,
});
