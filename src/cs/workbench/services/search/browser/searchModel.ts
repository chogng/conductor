/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import type {
  SearchInterpolationMode,
  SearchPoint,
  SearchPointLookupModel,
  SearchPointStatus,
} from "src/cs/workbench/services/search/common/search";

export type SearchSeriesPoint = {
  readonly x?: unknown;
  readonly y?: unknown;
};

export type SearchSeriesInput = {
  readonly color?: string;
  readonly data: readonly SearchSeriesPoint[];
  readonly id?: string | null;
  readonly name?: string | null;
  readonly tooltipName?: string | null;
};

type FinitePoint = {
  readonly x: number;
  readonly y: number;
};

export const searchSeriesAtX = (
  seriesList: readonly SearchSeriesInput[],
  x: number,
  interpolationMode: SearchInterpolationMode = "linear",
): SearchPoint[] => {
  if (!Number.isFinite(x)) return [];

  return seriesList.map((series, index) => {
    const located = searchPoint(series.data, x, interpolationMode);
    return {
      color: series.color,
      seriesId: String(series.id || `series-${index + 1}`),
      seriesName: String(series.name || series.tooltipName || `Series ${index + 1}`),
      status: located.status,
      x,
      y: located.y,
    };
  });
};

export const createSearchPointLookupModelFromPlotDisplay = (
  plotDisplayModel: PlotDisplayModel | null,
  {
    includeInspector = false,
  }: {
    readonly includeInspector?: boolean;
  } = {},
): SearchPointLookupModel | null => {
  if (!plotDisplayModel) {
    return null;
  }

  return {
    panes: [
      {
        id: "main",
        model: plotDisplayModel.chart.model,
      },
      ...(includeInspector && plotDisplayModel.inspector ? [{
        id: "inspector" as const,
        model: plotDisplayModel.inspector.model,
      }] : []),
    ],
  };
};

const searchPoint = (
  points: readonly SearchSeriesPoint[],
  x: number,
  interpolationMode: SearchInterpolationMode,
): { readonly status: SearchPointStatus; readonly y: number | null } => {
  const finitePoints = getFinitePoints(points);
  if (!finitePoints.length) {
    return { status: "empty", y: null };
  }

  const exact = finitePoints.find((point) => point.x === x);
  if (exact) {
    return { status: "ready", y: exact.y };
  }

  const first = finitePoints[0]!;
  const last = finitePoints[finitePoints.length - 1]!;
  if (x < first.x || x > last.x) {
    return { status: "outOfRange", y: null };
  }

  if (interpolationMode === "none") {
    return { status: "noExactMatch", y: null };
  }

  for (let index = 0; index < finitePoints.length - 1; index += 1) {
    const left = finitePoints[index]!;
    const right = finitePoints[index + 1]!;
    if (x < left.x || x > right.x || left.x === right.x) continue;

    const ratio = (x - left.x) / (right.x - left.x);
    return {
      status: "ready",
      y: left.y + (right.y - left.y) * ratio,
    };
  }

  return { status: "outOfRange", y: null };
};

const getFinitePoints = (points: readonly SearchSeriesPoint[]): FinitePoint[] =>
  points
    .map((point) => {
      const x = point?.x;
      const y = point?.y;
      return isFiniteNumber(x) && isFiniteNumber(y) ? { x, y } : null;
    })
    .filter((point): point is FinitePoint => Boolean(point))
    .sort((left, right) => left.x - right.x);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
