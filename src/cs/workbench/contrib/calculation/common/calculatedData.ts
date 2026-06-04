import { calculateGmPoints } from "src/cs/workbench/contrib/calculation/common/gm";
import { calculateSsPoints } from "src/cs/workbench/contrib/calculation/common/ss";
import { calculateVthPoints } from "src/cs/workbench/contrib/calculation/common/vth";
import { PlotTypes, type PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

export type SourcePoint = {
  readonly x: number;
  readonly y: number;
};

export type CalculatedPoint = {
  x: number;
  y: number;
  yPositive: number | null;
  yAbsPositive: number | null;
};

export type CalculatedSeries = {
  id: string;
  name: string;
  data: CalculatedPoint[];
};

export type CalculatedData = {
  readonly activeFile: CleanedEntry | null;
  readonly pointsCount: number;
  readonly seriesList: CalculatedSeries[];
  readonly xDomain: [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: [number, number];
  readonly yUnitLabel: string;
};

export type CalculatedDataByKey = Record<string, CalculatedData>;

export const createCalculatedDataKey = ({
  fileId,
  plotType,
}: {
  readonly fileId: string;
  readonly plotType: PlotType;
}): string => `${plotType}:${fileId}`;

export const createCalculatedDataByKey = (
  cleanedData: readonly CleanedEntry[],
): CalculatedDataByKey => {
  const next: CalculatedDataByKey = {};
  for (const [index, file] of cleanedData.entries()) {
    const fileId = getCalculatedFileId(file, index);
    for (const plotType of PlotTypes) {
      next[createCalculatedDataKey({ fileId, plotType })] = createCalculatedDataForFile({
        file,
        plotType,
      });
    }
  }
  return next;
};

export const getCalculatedData = (
  calculatedDataByKey: CalculatedDataByKey | undefined,
  plotType: PlotType,
  fileId?: string | null,
): CalculatedData | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  if (normalizedFileId) {
    return calculatedDataByKey?.[createCalculatedDataKey({
      fileId: normalizedFileId,
      plotType,
    })] ?? null;
  }

  const prefix = `${plotType}:`;
  return Object.entries(calculatedDataByKey ?? {}).find(([key]) =>
    key.startsWith(prefix)
  )?.[1] ?? null;
};

export const createCalculatedData = ({
  activeFileId,
  plotType,
  cleanedData,
}: {
  readonly activeFileId?: string | null;
  readonly plotType: PlotType;
  readonly cleanedData: readonly CleanedEntry[];
}): CalculatedData => {
  const activeFile = resolveCalculatedFile(cleanedData, activeFileId);
  return createCalculatedDataForFile({
    file: activeFile,
    plotType,
  });
};

export const createCalculatedDataForFile = ({
  file,
  plotType,
}: {
  readonly file: CleanedEntry | null;
  readonly plotType: PlotType;
}): CalculatedData => {
  const activeFile = file;
  const seriesList = createCalculatedSeries(activeFile, plotType);
  const points = seriesList.flatMap((series) => series.data);
  return {
    activeFile,
    pointsCount: points.length,
    seriesList,
    xDomain: getFiniteDomain(points.map((point) => Number(point.x)), [0, 1]),
    xUnitLabel: String(activeFile?.xUnit ?? ""),
    yDomain: getFiniteDomain(points.map((point) => Number(point.y)), [0, 1]),
    yUnitLabel: getCalculatedYUnitLabel(plotType, activeFile),
  };
};

const getCalculatedFileId = (file: CleanedEntry, index: number): string => {
  const fileId = String(file?.fileId ?? "").trim();
  return fileId || `file-${index}`;
};

export const resolveCalculatedFile = (
  cleanedData: readonly CleanedEntry[],
  activeFileId?: string | null,
): CleanedEntry | null => {
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    cleanedData.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    cleanedData[0] ??
    null
  );
};

export const createCalculatedSeries = (
  file: CleanedEntry | null,
  plotType: PlotType,
): CalculatedSeries[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: CleanedSeries, index: number) => {
      if (!isArrayLike(xGroups[Number(series?.groupIndex)])) {
        return null;
      }

      const data = resolveCalculatedPoints(plotType, createSourcePoints(file, series));
      if (!data.length) {
        return null;
      }

      return {
        id: resolveSeriesId(file, series, index),
        name: String(series?.name ?? series?.legendValue ?? `Series ${index + 1}`),
        data,
      };
    })
    .filter((series): series is CalculatedSeries => Boolean(series));
};

export const getCalculatedYUnitLabel = (
  plotType: PlotType,
  activeFile: CleanedEntry | null,
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

const resolveSeriesId = (
  file: CleanedEntry | null,
  series: CleanedSeries,
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

const createSourcePoints = (
  file: CleanedEntry | null,
  series: CleanedSeries,
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

const resolveCalculatedPoints = (
  plotType: PlotType,
  sourcePoints: readonly SourcePoint[],
): CalculatedPoint[] => {
  switch (plotType) {
    case "gm":
      return calculateGmPoints(sourcePoints).map(toCalculatedPoint);
    case "ss":
      return calculateSsPoints(sourcePoints).map(toCalculatedPoint);
    case "vth":
      return calculateVthPoints(sourcePoints).map(toCalculatedPoint);
    case "iv":
    default:
      return sourcePoints.map(toCalculatedPoint);
  }
};

const toCalculatedPoint = ({ x, y }: SourcePoint): CalculatedPoint => ({
  x,
  y,
  yPositive: y > 0 ? y : null,
  yAbsPositive: y !== 0 ? Math.abs(y) : null,
});

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
