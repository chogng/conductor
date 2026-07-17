/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import {
  executeCalculation,
} from "src/cs/workbench/services/calculation/common/calculationExecutor";
import { startPerf } from "src/cs/workbench/common/perf";
import type { URI } from "src/cs/base/common/uri";
import { createSecondDerivativeResult } from "src/cs/workbench/services/calculation/common/gm";
import {
  CalculationKinds,
  type CalculatedDataKind,
  type CalculationKind,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
import {
  createCalculationResourceId,
  type CalculationResourceResult,
} from "src/cs/workbench/services/calculation/common/calculation";
import type {
  CalculationCurveRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

type CalculationSourceNumberArray = readonly number[] | Float64Array;

type CalculationSourceDomain = {
  x?: readonly [number, number];
  y?: readonly [number, number];
};

export type CalculationSourceSeries = {
  id?: string;
  name?: string;
  groupIndex?: number;
  yCol?: number;
  y?: CalculationSourceNumberArray;
  legendValue?: unknown;
  [key: string]: unknown;
};

export type CalculationSourceFile = {
  fileId?: string;
  fileName?: string;
  curveType?: string;
  xAxisRole?: "vg" | "vd" | null;
  supportsSs?: boolean;
  calculationCache?: unknown;
  xUnit?: string;
  yUnit?: string;
  xLabel?: string;
  yLabel?: string;
  xGroups?: readonly CalculationSourceNumberArray[];
  series?: readonly CalculationSourceSeries[];
  domain?: CalculationSourceDomain;
  [key: string]: unknown;
};

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
  kind: CalculatedDataKind;
  id: string;
  name: string;
  data: CalculatedPoint[];
};

export type CalculatedDataSource = {
  readonly fileId: string | null;
  readonly inputKind: "source" | "canonical" | "calculationResource" | CalculationKind;
  readonly resource?: URI | null;
  readonly sheetId?: string | null;
};

export type CalculatedData = {
  readonly activeFile: CalculationSourceFile | null;
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

export type CalculatedPlotsByKey = Record<string, CalculatedData>;

export const createCalculatedDataKey = ({
  fileId,
  plotType,
}: {
  readonly fileId: string;
  readonly plotType: CalculationKind;
}): string => `${plotType}:${fileId}`;

export const createCalculatedPlotsByKey = (
  sourceFiles: readonly CalculationSourceFile[],
): CalculatedPlotsByKey => {
  const next: CalculatedPlotsByKey = {};
  for (const [index, file] of sourceFiles.entries()) {
    const fileId = getCalculatedFileId(file, index);
    for (const plotType of CalculationKinds) {
      next[createCalculatedDataKey({ fileId, plotType })] = createCalculatedDataForFile({
        file,
        fileId,
        plotType,
      });
    }
  }
  return next;
};

export const createCalculatedDataForCalculationResourceResult = ({
  plotType,
  result,
}: {
  readonly plotType: CalculationKind;
  readonly result: CalculationResourceResult;
}): CalculatedData => {
  const curves = collectCalculationResultCurves(result, plotType);
  const activeFile = createCalculationSourceFileFromCalculationResourceResult(result, curves);
  const usedIds = new Set<string>();
  const seriesList = curves
    .map((curve, index): CalculatedSeries | null => {
      const data = curve.points.map(toCalculatedPoint);
      if (!data.length) {
        return null;
      }

      const id = resolveUniqueSeriesId(curve.seriesId || `series-${index + 1}`, index, usedIds);
      const series = result.seriesById[curve.seriesId];
      return {
        data,
        id,
        kind: plotType,
        name: String(series?.labelOverride ?? series?.name ?? series?.legendValue ?? `Series ${index + 1}`),
      };
    })
    .filter((series): series is CalculatedSeries => Boolean(series));
  const points = seriesList.flatMap(series => series.data);
  const source = {
    fileId: createCalculationResourceId(result.resource, result.sheetId),
    inputKind: "calculationResource" as const,
    resource: result.resource,
    sheetId: result.sheetId ?? null,
  };
  const xDomain = getFiniteDomain(points.map(point => Number(point.x)), [0, 1]);
  const xUnitLabel = String(activeFile?.xUnit ?? "");
  const yDomain = getFiniteDomain(points.map(point => Number(point.y)), [0, 1]);
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

export const getCalculatedData = (
  calculatedPlotsByKey: CalculatedPlotsByKey | undefined,
  plotType: CalculationKind,
  fileId?: string | null,
): CalculatedData | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  if (normalizedFileId) {
    return calculatedPlotsByKey?.[createCalculatedDataKey({
      fileId: normalizedFileId,
      plotType,
    })] ?? null;
  }

  const prefix = `${plotType}:`;
  return Object.entries(calculatedPlotsByKey ?? {}).find(([key]) =>
    key.startsWith(prefix)
  )?.[1] ?? null;
};

export const createCalculatedData = ({
  activeFileId,
  plotType,
  sourceFiles,
}: {
  readonly activeFileId?: string | null;
  readonly plotType: CalculationKind;
  readonly sourceFiles?: readonly CalculationSourceFile[];
}): CalculatedData => {
  const activeFile = resolveCalculatedFile(sourceFiles ?? [], activeFileId);
  return createCalculatedDataForFile({
    file: activeFile,
    plotType,
  });
};

export const createCalculatedDataForFile = ({
  file,
  fileId,
  inputKind = "source",
  plotType,
}: {
  readonly file: CalculationSourceFile | null;
  readonly fileId?: string | null;
  readonly inputKind?: "canonical" | "source";
  readonly plotType: CalculationKind;
}): CalculatedData => {
  const activeFile = file;
  const seriesList = createCalculatedSeries(activeFile, plotType);
  const points = seriesList.flatMap((series) => series.data);
  const source = {
    fileId: fileId ?? resolveSourceFileId(activeFile),
    inputKind,
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

export const createCalculationSourceFileFromCalculationResourceResult = (
  result: CalculationResourceResult,
  curves: readonly CalculationCurveRecord[],
): CalculationSourceFile => {
  const xValues = curves.flatMap(curve => curve.points.map(point => point.x));
  const yValues = curves.flatMap(curve => curve.points.map(point => point.y));
  return {
    curveType: getCalculationResultCurveType(curves[0]),
    domain: curves.length
      ? {
        x: getFiniteDomain(xValues, [0, 1]),
        y: getFiniteDomain(yValues, [0, 1]),
      }
      : undefined,
    fileId: createCalculationResourceId(result.resource, result.sheetId),
    fileName: result.resource.path.split(/[\\/]/).filter(Boolean).pop() ?? createCalculationResourceId(result.resource, result.sheetId),
    series: createCalculationSourceSeriesFromCalculationResourceResult(result, curves),
    supportsSs: curves.some(curve => curve.curveFamily === "iv" && curve.ivMode === "transfer"),
    xAxisRole: result.axis.xAxisRole,
    xGroups: curves.map(curve => curve.points.map(point => point.x)),
    xLabel: result.axis.xLabel,
    xUnit: result.axis.xUnit,
    yLabel: result.axis.yLabel,
    yUnit: result.axis.yUnit,
  };
};

const createCalculationSourceSeriesFromCalculationResourceResult = (
  result: CalculationResourceResult,
  curves: readonly CalculationCurveRecord[],
): CalculationSourceSeries[] => {
  return curves.map((curve, index): CalculationSourceSeries => {
    const series = result.seriesById[curve.seriesId];
    return {
      groupIndex: index,
      id: curve.seriesId || `series-${index + 1}`,
      legendValue: series?.legendValue,
      name: series?.labelOverride ?? series?.name ?? series?.legendValue,
      y: curve.points.map(point => point.y),
      yCol: Number.isInteger(Number(series?.yCol)) ? series?.yCol : index + 1,
    };
  });
};

const getCalculationResultCurveType = (
  curve: CalculationCurveRecord | undefined,
): string | undefined => {
  if (!curve) {
    return undefined;
  }
  if (curve.curveFamily === "iv" && curve.ivMode) {
    return curve.ivMode;
  }
  if (curve.curveFamily === "it" && curve.itMode) {
    return curve.itMode;
  }
  return curve.curveFamily;
};

const collectCalculationResultCurves = (
  result: CalculationResourceResult,
  plotType: CalculationKind,
): CalculationCurveRecord[] =>
  Object.values(result.curvesByKey).filter(curve => {
    switch (plotType) {
      case "iv":
        return curve.curveGeneration === "base";
      case "gm":
        return curve.curveGeneration === "derived" && curve.curveFamily === "gm";
      case "ss":
        return curve.curveGeneration === "derived" && curve.curveFamily === "localSs";
      case "vth":
        return curve.curveGeneration === "derived" && curve.curveFamily === "thresholdFit";
    }
  });

const getCalculatedFileId = (file: CalculationSourceFile, index: number): string => {
  const fileId = String(file?.fileId ?? "").trim();
  return fileId || `file-${index}`;
};

const resolveSourceFileId = (file: CalculationSourceFile | null): string | null => {
  const fileId = String(file?.fileId ?? "").trim();
  return fileId || null;
};

export const resolveCalculatedFile = (
  sourceFiles: readonly CalculationSourceFile[],
  activeFileId?: string | null,
): CalculationSourceFile | null => {
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    sourceFiles.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    sourceFiles[0] ??
    null
  );
};

export const createCalculatedSeries = (
  file: CalculationSourceFile | null,
  plotType: CalculationKind,
): CalculatedSeries[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const usedIds = new Set<string>();
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: CalculationSourceSeries, index: number): CalculatedSeries | null => {
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
  plotType: CalculationKind,
  activeFile: CalculationSourceFile | null,
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
  readonly activeFile: CalculationSourceFile | null;
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
  file: CalculationSourceFile | null,
  series: CalculationSourceSeries,
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

const resolveSecondSourceKind = (kind: CalculatedDataKind): CalculationKind =>
  kind === "secondDerivative" ? "gm" : kind;

const getSecondCalculatedYUnitLabel = (sourceData: CalculatedData): string => {
  const unit = String(sourceData.yUnitLabel ?? "").trim();
  return unit ? `d(${unit})/dx` : "dY/dx";
};

const createSourcePoints = (
  file: CalculationSourceFile | null,
  series: CalculationSourceSeries,
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
  plotType: CalculationKind,
  sourcePoints: readonly SourcePoint[],
): CalculatedPoint[] =>
  executeCalculation({
    kind: plotType,
    points: sourcePoints,
  }).map(toCalculatedPoint);

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
