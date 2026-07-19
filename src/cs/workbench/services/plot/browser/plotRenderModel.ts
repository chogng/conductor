/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotMainRenderModel,
	PlotMainRenderModelSource,
	PlotMainSeries,
} from "src/cs/workbench/services/plot/common/plotModel";
import { resolveSeriesPlotColor } from "src/cs/workbench/services/plot/common/plotColors";

export const createPlotMainRenderModel = (
	source: PlotMainRenderModelSource,
	colorSeriesList: readonly PlotMainSeries[] = source.seriesList,
): PlotMainRenderModel => {
	const seriesColors = createPlotSeriesColorMap(colorSeriesList);
	return {
		axisLabels: source.activeFile
			? {
				xLabel: source.activeFile.xLabel,
				yLabel: source.activeFile.yLabel,
			}
			: null,
		pointsCount: source.pointsCount,
		seriesList: source.seriesList.map(series => {
			const color = seriesColors.get(series.id);
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
	};
};

const createPlotSeriesColorMap = (
	seriesList: readonly PlotMainSeries[],
): ReadonlyMap<string, string> => new Map(
	seriesList.map((series, seriesIndex) => [
		series.id,
		resolveSeriesPlotColor(series, seriesIndex),
	]),
);
