/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotMainRenderModel,
	PlotMainRenderModelSource,
} from "src/cs/workbench/services/plot/common/plotModel";

export const createPlotMainRenderModel = (
	source: PlotMainRenderModelSource,
): PlotMainRenderModel => ({
	axisLabels: source.activeFile
		? {
			xLabel: source.activeFile.xLabel,
			yLabel: source.activeFile.yLabel,
		}
		: null,
	pointsCount: source.pointsCount,
	seriesList: source.seriesList,
	xDomain: source.xDomain,
	xUnitLabel: source.xUnitLabel,
	yDomain: source.yDomain,
	yUnitLabel: source.yUnitLabel,
});
