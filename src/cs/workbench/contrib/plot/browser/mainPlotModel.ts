import {
  computeCentralDerivative,
  computeSubthresholdSwing,
} from "../../diagnostics/common/analysisMath.ts";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "../../session/common/sessionTypes.ts";
import type { PlotType } from "../common/plot.ts";
import type { MainPlotPoint, MainPlotSeries } from "./MainPlotChart.ts";

type SourcePoint = {
  readonly x: number;
  readonly y: number;
};

export type MainPlotModel = {
  readonly activeFile: ProcessedEntry | null;
  readonly pointsCount: number;
  readonly seriesList: MainPlotSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
};

export const createMainPlotModel = ({
  activeFileId,
  plotType,
  processedData,
}: {
  readonly activeFileId?: string | null;
  readonly plotType: PlotType;
  readonly processedData: readonly ProcessedEntry[];
}): MainPlotModel => {
  const activeFile = resolveMainPlotFile(processedData, activeFileId);
  const seriesList = createMainPlotSeries(activeFile, plotType);
  const points = seriesList.flatMap((series) => series.data);
  return {
    activeFile,
    pointsCount: points.length,
    seriesList,
    xDomain: getFiniteDomain(points.map((point) => Number(point.x)), [0, 1]),
    xUnitLabel: String(activeFile?.xUnit ?? ""),
    yDomain: getFiniteDomain(points.map((point) => Number(point.y)), [0, 1]),
    yUnitLabel: getMainPlotYUnitLabel(plotType, activeFile),
  };
};

export const resolveMainPlotFile = (
  processedData: readonly ProcessedEntry[],
  activeFileId?: string | null,
): ProcessedEntry | null => {
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    processedData.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    processedData[0] ??
    null
  );
};

export const createMainPlotSeries = (
  file: ProcessedEntry | null,
  plotType: PlotType,
): MainPlotSeries[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: ProcessedSeries, index: number) => {
      if (!isArrayLike(xGroups[Number(series?.groupIndex)])) {
        return null;
      }

      const data = resolveMainPlotPoints(plotType, createSourcePoints(file, series));
      if (!data.length) {
        return null;
      }

      return {
        id: resolveSeriesId(file, series, index),
        name: String(series?.name ?? series?.legendValue ?? `Series ${index + 1}`),
        data,
      };
    })
    .filter((series): series is MainPlotSeries => Boolean(series));
};

const resolveSeriesId = (
  file: ProcessedEntry | null,
  series: ProcessedSeries,
  index: number,
): string => {
  const explicitId = String(series?.id ?? "").trim();
  if (explicitId) {
    return explicitId;
  }

  const fileId = String(file?.fileId ?? "file").trim() || "file";
  const groupIndex = Number(series?.groupIndex);
  const yCol = Number(series?.yCol);
  return [
    fileId,
    Number.isInteger(groupIndex) ? `x${groupIndex}` : "x",
    Number.isInteger(yCol) ? `y${yCol}` : `series${index}`,
  ].join(":");
};

export const getMainPlotYUnitLabel = (
  plotType: PlotType,
  activeFile: ProcessedEntry | null,
): string => {
  switch (plotType) {
    case "gm":
      return "gm";
    case "ss":
      return "SS";
    case "vth":
      return "sqrt(|I|)";
    case "iv":
    default:
      return String(activeFile?.yUnit ?? "");
  }
};

const createSourcePoints = (
  file: ProcessedEntry | null,
  series: ProcessedSeries,
): SourcePoint[] => {
  const xValues = Array.isArray(file?.xGroups)
    ? file.xGroups[Number(series?.groupIndex)] ?? []
    : [];
  const yValues = isArrayLike(series?.y) ? series.y : [];
  const count = Math.min(xValues.length, yValues.length);
  const points: SourcePoint[] = [];
  for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
    const x = Number(xValues[pointIndex]);
    const y = Number(yValues[pointIndex]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }
  return points;
};

const isArrayLike = (value: unknown): value is ArrayLike<unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  Number.isFinite(Number((value as ArrayLike<unknown>).length));

const resolveMainPlotPoints = (
  plotType: PlotType,
  sourcePoints: readonly SourcePoint[],
): MainPlotPoint[] => {
  switch (plotType) {
    case "gm":
      return toSourcePoints(computeCentralDerivative(sourcePoints)).map(toMainPlotPoint);
    case "ss":
      return toSourcePoints(computeSubthresholdSwing(sourcePoints)).map(toMainPlotPoint);
    case "vth":
      return sourcePoints.map((point) => toMainPlotPoint({
        x: point.x,
        y: Math.sqrt(Math.abs(point.y)),
      }));
    case "iv":
    default:
      return sourcePoints.map(toMainPlotPoint);
  }
};

const toMainPlotPoint = ({ x, y }: SourcePoint): MainPlotPoint => ({
  x,
  y,
  yPositive: y > 0 ? y : null,
  yAbsPositive: y !== 0 ? Math.abs(y) : null,
});

const toSourcePoints = (points: unknown): SourcePoint[] => {
  if (!Array.isArray(points)) {
    return [];
  }

  const sourcePoints: SourcePoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") {
      continue;
    }

    const value = point as Record<string, unknown>;
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sourcePoints.push({ x, y });
    }
  }
  return sourcePoints;
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
