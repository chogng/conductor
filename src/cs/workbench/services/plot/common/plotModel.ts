/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type PlotMainPoint = {
	readonly x?: number | null;
	readonly y?: number | null;
	readonly yPositive?: number | null;
	readonly yAbsPositive?: number | null;
	readonly ySignedLogPositive?: number | null;
	readonly [key: string]: number | string | null | undefined;
};

export type PlotMainSeries = {
	readonly id: string;
	readonly name: string;
	readonly tooltipName?: string;
	readonly color?: string;
	readonly data: readonly PlotMainPoint[];
	readonly [key: string]: unknown;
};

export type PlotMainAxisLabels = {
	readonly [key: string]: unknown;
	readonly xLabel?: unknown;
	readonly yLabel?: unknown;
};

export type PlotMainRenderModel = {
	readonly axisLabels: PlotMainAxisLabels | null;
	readonly pointsCount: number;
	readonly seriesList: readonly PlotMainSeries[];
	readonly xDomain: [number, number];
	readonly xUnitLabel: string;
	readonly yDomain: [number, number];
	readonly yUnitLabel: string;
};

export type PlotMainRenderModelSource = {
	readonly activeFile?: PlotMainAxisLabels | null;
	readonly pointsCount: number;
	readonly seriesList: readonly PlotMainSeries[];
	readonly xDomain: [number, number];
	readonly xUnitLabel: string;
	readonly yDomain: [number, number];
	readonly yUnitLabel: string;
};
