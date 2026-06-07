import {
  calculateGmPoints,
  calculateIvPoints,
  calculateSsPoints,
  calculateVthPoints,
} from "src/cs/workbench/contrib/calculation/common/firstCalculation";
import { createSecondDerivativeResult } from "src/cs/workbench/contrib/calculation/common/secondCalculation";
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

export type CalculatedDataKind = PlotType | "secondDerivative";

export type CalculatedSeries = {
  kind: CalculatedDataKind;
  id: string;
  name: string;
  data: CalculatedPoint[];
};

export type CalculatedDataSource = {
  readonly fileId: string | null;
  readonly inputKind: "cleaned" | PlotType;
};

export type CalculatedData = {
  readonly activeFile: CleanedEntry | null;
  readonly kind: CalculatedDataKind;
  readonly pointsCount: number;
  readonly seriesList: CalculatedSeries[];
  readonly signature: string;
  readonly source: CalculatedDataSource;
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
        fileId,
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
  fileId,
  plotType,
}: {
  readonly file: CleanedEntry | null;
  readonly fileId?: string | null;
  readonly plotType: PlotType;
}): CalculatedData => {
  const activeFile = file;
  const seriesList = createCalculatedSeries(activeFile, plotType);
  const points = seriesList.flatMap((series) => series.data);
  const source = {
    fileId: fileId ?? resolveSourceFileId(activeFile),
    inputKind: "cleaned" as const,
  };
  const xDomain = getFiniteDomain(points.map((point) => Number(point.x)), [0, 1]);
  const xUnitLabel = String(activeFile?.xUnit ?? "");
  const yDomain = getFiniteDomain(points.map((point) => Number(point.y)), [0, 1]);
  const yUnitLabel = getCalculatedYUnitLabel(plotType, activeFile);
  return {
    activeFile,
    kind: plotType,
    pointsCount: points.length,
    seriesList,
    signature: createCalculatedDataSignature({
      activeFile,
      kind: plotType,
      pointsCount: points.length,
      seriesList,
      source,
      xDomain,
      xUnitLabel,
      yDomain,
      yUnitLabel,
    }),
    source,
    xDomain,
    xUnitLabel,
    yDomain,
    yUnitLabel,
  };
};

const getCalculatedFileId = (file: CleanedEntry, index: number): string => {
  const fileId = String(file?.fileId ?? "").trim();
  return fileId || `file-${index}`;
};

const resolveSourceFileId = (file: CleanedEntry | null): string | null => {
  const fileId = String(file?.fileId ?? "").trim();
  return fileId || null;
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
  const usedIds = new Set<string>();
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: CleanedSeries, index: number): CalculatedSeries | null => {
      if (!isArrayLike(xGroups[Number(series?.groupIndex)])) {
        return null;
      }

      const data = resolveCalculatedPoints(plotType, createSourcePoints(file, series));
      if (!data.length) {
        return null;
      }

      const id = resolveUniqueSeriesId(resolveSeriesId(file, series, index), index, usedIds);
      return {
        kind: plotType,
        id,
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

export const createSecondCalculatedData = (
  sourceData: CalculatedData,
): CalculatedData => {
  const sourceKind = resolveSecondSourceKind(sourceData.kind);
  const seriesList = sourceData.seriesList
    .map((series): CalculatedSeries | null => {
      const result = createSecondDerivativeResult({
        fileId: sourceData.source.fileId,
        inputKind: sourceKind,
        points: series.data.map(({ x, y }) => ({ x, y })),
      });
      const data = result.points.map(toCalculatedPoint);
      if (!data.length) {
        return null;
      }

      return {
        data,
        id: `${series.id}:second-derivative`,
        kind: "secondDerivative",
        name: series.name,
      };
    })
    .filter((series): series is CalculatedSeries => series !== null);
  const points = seriesList.flatMap((series) => series.data);
  const source = {
    fileId: sourceData.source.fileId,
    inputKind: sourceKind,
  };
  const xDomain = getFiniteDomain(points.map((point) => Number(point.x)), sourceData.xDomain);
  const yDomain = getFiniteDomain(points.map((point) => Number(point.y)), [0, 1]);
  const yUnitLabel = getSecondCalculatedYUnitLabel(sourceData);

  return {
    activeFile: sourceData.activeFile,
    kind: "secondDerivative",
    pointsCount: points.length,
    seriesList,
    signature: createCalculatedDataSignature({
      activeFile: sourceData.activeFile,
      kind: "secondDerivative",
      pointsCount: points.length,
      seriesList,
      source,
      xDomain,
      xUnitLabel: sourceData.xUnitLabel,
      yDomain,
      yUnitLabel,
    }),
    source,
    xDomain,
    xUnitLabel: sourceData.xUnitLabel,
    yDomain,
    yUnitLabel,
  };
};

export const createCalculatedDataSignature = ({
  activeFile,
  kind,
  pointsCount,
  seriesList,
  source,
  xDomain,
  xUnitLabel,
  yDomain,
  yUnitLabel,
}: {
  readonly activeFile: CleanedEntry | null;
  readonly kind: CalculatedDataKind;
  readonly pointsCount: number;
  readonly seriesList: readonly CalculatedSeries[];
  readonly source: CalculatedDataSource;
  readonly xDomain: readonly [number, number];
  readonly xUnitLabel: string;
  readonly yDomain: readonly [number, number];
  readonly yUnitLabel: string;
}): string => {
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

  add(kind);
  add(pointsCount);
  add(source.fileId);
  add(source.inputKind);
  add(activeFile?.xLabel);
  add(activeFile?.yLabel);
  add(xDomain[0]);
  add(xDomain[1]);
  add(xUnitLabel);
  add(yDomain[0]);
  add(yDomain[1]);
  add(yUnitLabel);

  for (const series of seriesList) {
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

const resolveUniqueSeriesId = (
  id: string,
  index: number,
  usedIds: Set<string>,
): string => {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }

  let suffix = index;
  let next = `${id}:${suffix}`;
  while (usedIds.has(next)) {
    suffix += 1;
    next = `${id}:${suffix}`;
  }
  usedIds.add(next);
  return next;
};

const resolveSecondSourceKind = (kind: CalculatedDataKind): PlotType =>
  kind === "secondDerivative" ? "gm" : kind;

const getSecondCalculatedYUnitLabel = (sourceData: CalculatedData): string => {
  const unit = String(sourceData.yUnitLabel ?? "").trim();
  return unit ? `d(${unit})/dx` : "dY/dx";
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
    // 一次计算区域：从清洗后的源数据直接得到 gm、SS、Vth 曲线。
    case "gm":
      return calculateGmPoints(sourcePoints).map(toCalculatedPoint);
    case "ss":
      return calculateSsPoints(sourcePoints).map(toCalculatedPoint);
    case "vth":
      return calculateVthPoints(sourcePoints).map(toCalculatedPoint);
    // 一次计算区域：IV 只做绘图点格式归一，不额外派生。
    case "iv":
    default:
      return calculateIvPoints(sourcePoints).map(toCalculatedPoint);
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
