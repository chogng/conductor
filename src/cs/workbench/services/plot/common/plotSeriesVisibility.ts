/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type PlotSeriesVisibilityPoint = {
  readonly x?: unknown;
  readonly y?: unknown;
  readonly yPositive?: unknown;
  readonly yAbsPositive?: unknown;
  readonly [key: string]: unknown;
};

export type PlotSeriesVisibilitySeries = {
  readonly data: readonly PlotSeriesVisibilityPoint[];
  readonly id: string;
  readonly kind?: unknown;
  readonly name?: unknown;
  readonly [key: string]: unknown;
};

export type PlotSeriesVisibilityModel = {
  readonly activeFile?: {
    readonly xLabel?: unknown;
    readonly yLabel?: unknown;
    readonly [key: string]: unknown;
  } | null;
  readonly kind?: unknown;
  readonly pointsCount: number;
  readonly seriesList: readonly PlotSeriesVisibilitySeries[];
  readonly signature: string;
  readonly source?: {
    readonly fileId?: unknown;
    readonly inputKind?: unknown;
  } | null;
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
  readonly [key: string]: unknown;
};

export const filterCalculatedDataSeries = <T extends PlotSeriesVisibilityModel>(
  model: T,
  hiddenLegendKeys: readonly string[],
): T => {
  if (!hiddenLegendKeys.length) {
    return model;
  }

  const hidden = new Set(hiddenLegendKeys);
  const seriesList = model.seriesList.filter((series) => !hidden.has(series.id));
  if (seriesList.length === model.seriesList.length) {
    return model;
  }

  const points = seriesList.flatMap((series) => series.data);
  const xDomain = getFiniteDomain(points.map((point) => Number(point.x)), model.xDomain);
  const yDomain = getFiniteDomain(points.map((point) => Number(point.y)), model.yDomain);
  const nextModel = {
    ...model,
    pointsCount: points.length,
    seriesList,
    xDomain,
    yDomain,
  };
  return {
    ...nextModel,
    signature: createPlotSeriesVisibilitySignature(nextModel),
  } as T;
};

const getFiniteDomain = (
  values: readonly number[],
  fallback: [number, number],
): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return fallback;
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return min === max ? [min - 0.5, max + 0.5] : [min, max];
};

const createPlotSeriesVisibilitySignature = (
  model: PlotSeriesVisibilityModel,
): string => {
  let hash = 0x811c9dc5;
  const add = (value: unknown): void => {
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 31;
    hash = Math.imul(hash, 0x01000193);
  };

  add(model.kind);
  add(model.pointsCount);
  add(model.source?.fileId);
  add(model.source?.inputKind);
  add(model.activeFile?.xLabel);
  add(model.activeFile?.yLabel);
  add(model.xDomain[0]);
  add(model.xDomain[1]);
  add(model.xUnitLabel);
  add(model.yDomain[0]);
  add(model.yDomain[1]);
  add(model.yUnitLabel);

  for (const series of model.seriesList) {
    add(series.kind);
    add(series.id);
    add(series.name);
    add(series.data.length);
    for (const point of series.data) {
      add(point.x);
      add(point.y);
      add(point.yPositive);
      add(point.yAbsPositive);
    }
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};
