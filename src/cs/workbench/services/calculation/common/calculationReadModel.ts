/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import {
  executeCalculation,
} from "src/cs/workbench/services/calculation/common/calculationExecutor";
import { startPerf } from "src/cs/workbench/common/perf";
import { createSecondDerivativeResult } from "src/cs/workbench/services/calculation/common/gm";
import {
  CalculationKinds,
  type CalculatedDataKind,
  type CalculationKind,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  collectFileRecordBaseCurves,
  fileRecordSupportsSs,
  getFileRecordAxisProjection,
  getFileRecordCurveType,
  getFileRecordDomain,
  getFileRecordXGroups,
} from "src/cs/workbench/services/calculation/common/canonicalFileProjection";
import type { SliceUriResult, SliceUriTarget } from "src/cs/workbench/services/slice/common/slice";

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
  readonly inputKind: "source" | "canonical" | "sliceUri" | CalculationKind;
  readonly target?: SliceUriTarget | null;
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

export const createCalculatedDataInputSignature = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): string => {
  const parts: string[] = [];
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    if (!hasFileRecordChartData(file)) {
      continue;
    }

    parts.push("file", file.id);
    const axis = getFileRecordAxisProjection(file);
    parts.push("x", axis.xUnit ?? "");
    parts.push("y", axis.yUnit ?? "");
    for (const curve of collectFileRecordBaseCurves(file)) {
      parts.push(
        "curve",
        curve.seriesId,
        curve.curveFamily,
        curve.ivMode ?? "",
        curve.itMode ?? "",
        curve.signature,
      );
    }
  }

  return parts.join("\u001f");
};

export const createCalculatedDataForCanonicalFile = ({
  file,
  plotType,
}: {
  readonly file: FileRecord;
  readonly plotType: CalculationKind;
}): CalculatedData => {
  const activeFile = createCalculationSourceFileFromCanonicalFile(file);
  const seriesList = createCalculatedSeriesFromCanonicalFile(file, plotType);
  const points = seriesList.flatMap((series) => series.data);
  const source = {
    fileId: file.id,
    inputKind: "canonical" as const,
  };
  const xDomain = getFiniteDomain(points.map((point) => Number(point.x)), [0, 1]);
  const xUnitLabel = String(getFileRecordAxisProjection(file).xUnit ?? "");
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

export const createCalculatedDataForSliceUriResult = ({
  plotType,
  result,
}: {
  readonly plotType: CalculationKind;
  readonly result: SliceUriResult;
}): CalculatedData => {
  const curves = result.curves;
  const activeFile = createCalculationSourceFileFromSliceUriResult(result, curves);
  const seriesById = new Map(result.series.map(series => [series.id, series]));
  const usedIds = new Set<string>();
  const seriesList = curves
    .map((curve, index): CalculatedSeries | null => {
      const data = resolveCalculatedPoints(plotType, curve.points);
      if (!data.length) {
        return null;
      }

      const id = resolveUniqueSeriesId(curve.seriesId || `series-${index + 1}`, index, usedIds);
      const series = seriesById.get(curve.seriesId);
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
    fileId: createSliceUriTargetId(result.target),
    inputKind: "sliceUri" as const,
    target: result.target,
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
  plotType,
}: {
  readonly file: CalculationSourceFile | null;
  readonly fileId?: string | null;
  readonly plotType: CalculationKind;
}): CalculatedData => {
  const activeFile = file;
  const seriesList = createCalculatedSeries(activeFile, plotType);
  const points = seriesList.flatMap((series) => series.data);
  const source = {
    fileId: fileId ?? resolveSourceFileId(activeFile),
    inputKind: "source" as const,
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

const getOrderedFileRecords = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): FileRecord[] => {
  const seen = new Set<FileId>();
  const files: FileRecord[] = [];
  const pushFile = (fileId: FileId): void => {
    if (seen.has(fileId)) {
      return;
    }
    seen.add(fileId);

    const file = filesById[fileId];
    if (file) {
      files.push(file);
    }
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }

  return files;
};

const hasFileRecordChartData = (file: FileRecord): boolean =>
  collectFileRecordBaseCurves(file).length > 0;

const createCalculatedSeriesFromCanonicalFile = (
  file: FileRecord,
  plotType: CalculationKind,
): CalculatedSeries[] => {
  const curves = collectFileRecordBaseCurves(file);
  if (!curves.length) {
    return createCalculatedSeries(createCalculationSourceFileFromCanonicalFile(file), plotType);
  }

  const usedIds = new Set<string>();
  return curves
    .map((curve, index): CalculatedSeries | null => {
      const data = resolveCalculatedPoints(plotType, curve.points);
      if (!data.length) {
        return null;
      }

      const id = resolveUniqueSeriesId(String(curve.seriesId), index, usedIds);
      return {
        data,
        id,
        kind: plotType,
        name: resolveCanonicalFileSeriesName(file, curve.seriesId, index),
      };
    })
    .filter((series): series is CalculatedSeries => Boolean(series));
};

const createCalculationSourceFileFromCanonicalFile = (file: FileRecord): CalculationSourceFile => {
  const axis = getFileRecordAxisProjection(file);
  const domain = getFileRecordDomain(file);
  return {
    curveType: getFileRecordCurveType(file),
    domain: domain
      ? {
        x: domain.x,
        y: domain.y,
      }
      : undefined,
    fileId: file.id,
    fileName: file.raw.fileName,
    series: createCalculationSourceSeriesFromFileRecord(file),
    supportsSs: fileRecordSupportsSs(file),
    xAxisRole: axis.xAxisRole,
    xGroups: getFileRecordXGroups(file),
    xUnit: axis.xUnit,
    yUnit: axis.yUnit,
    xLabel: axis.xLabel,
    yLabel: axis.yLabel,
  };
};

const createCalculationSourceFileFromSliceUriResult = (
  result: SliceUriResult,
  curves: SliceUriResult["curves"],
): CalculationSourceFile => {
  const xValues = curves.flatMap(curve => curve.points.map(point => point.x));
  const yValues = curves.flatMap(curve => curve.points.map(point => point.y));
  return {
    curveType: getSliceUriCurveType(curves[0]),
    domain: curves.length
      ? {
        x: getFiniteDomain(xValues, [0, 1]),
        y: getFiniteDomain(yValues, [0, 1]),
      }
      : undefined,
    fileId: createSliceUriTargetId(result.target),
    fileName: result.target.resource.path.split(/[\\/]/).filter(Boolean).pop() ?? createSliceUriTargetId(result.target),
    series: createCalculationSourceSeriesFromSliceUriResult(result, curves),
    supportsSs: curves.some(curve => curve.curveFamily === "iv" && curve.ivMode === "transfer"),
    xAxisRole: getSliceUriXAxisRole(curves[0]),
    xGroups: curves.map(curve => curve.points.map(point => point.x)),
    xLabel: getSliceTemplateBlockText(result, block => block.titles?.bottom),
    xUnit: getSliceTemplateBlockText(result, block => block.x.unit),
    yLabel: getSliceTemplateBlockText(result, block => block.titles?.left),
    yUnit: getSliceTemplateBlockText(result, block => block.y.unit),
  };
};

const createCalculationSourceSeriesFromSliceUriResult = (
  result: SliceUriResult,
  curves: SliceUriResult["curves"],
): CalculationSourceSeries[] => {
  const seriesById = new Map(result.series.map(series => [series.id, series]));
  return curves.map((curve, index): CalculationSourceSeries => {
    const series = seriesById.get(curve.seriesId);
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

const createCalculationSourceSeriesFromFileRecord = (
  file: FileRecord,
): CalculationSourceSeries[] =>
  collectFileRecordBaseCurves(file).map((curve, index): CalculationSourceSeries => {
    const series = file.seriesById[curve.seriesId];
    return {
      groupIndex: index,
      id: curve.seriesId || `series-${index + 1}`,
      legendValue: series?.legendValue,
      name: series?.labelOverride ?? series?.name ?? series?.legendValue,
      y: curve.points.map((point) => point.y),
      yCol: Number.isInteger(Number(series?.yCol)) ? series?.yCol : index + 1,
    };
  });

const getSliceUriCurveType = (
  curve: SliceUriResult["curves"][number] | undefined,
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

const getSliceUriXAxisRole = (
  curve: SliceUriResult["curves"][number] | undefined,
): CalculationSourceFile["xAxisRole"] => {
  if (curve?.curveFamily === "iv" && curve.ivMode === "transfer") {
    return "vg";
  }
  if (curve?.curveFamily === "iv" && curve.ivMode === "output") {
    return "vd";
  }
  return null;
};

const getSliceTemplateBlockText = (
  result: SliceUriResult,
  readValue: (block: SliceUriResult["run"]["template"]["blocks"][number]) => string | undefined,
): string | undefined => {
  for (const block of result.run.template.blocks) {
    const text = String(readValue(block) ?? "").trim();
    if (text) {
      return text;
    }
  }
  return undefined;
};

const createSliceUriTargetId = (
  target: SliceUriTarget,
): string => {
  const resource = getTargetResourceKey(target.resource);
  const sheetId = String(target.sheetId ?? "").trim();
  return sheetId ? `${resource}\u0000${sheetId}` : resource;
};

const getTargetResourceKey = (resource: unknown): string => {
  const text = getTargetResourceString(resource);
  if (text) {
    return text.replace(/\\/g, "/");
  }

  const components = resource as {
    readonly authority?: unknown;
    readonly fragment?: unknown;
    readonly path?: unknown;
    readonly query?: unknown;
    readonly scheme?: unknown;
  } | null | undefined;
  const path = String(components?.path ?? "").trim();
  if (!path) {
    return "";
  }

  const scheme = String(components?.scheme ?? "").trim();
  const authority = String(components?.authority ?? "").trim();
  const query = String(components?.query ?? "").trim();
  const fragment = String(components?.fragment ?? "").trim();
  if (scheme === "file") {
    return [
      "file://",
      authority,
      path,
      query ? `?${query}` : "",
      fragment ? `#${fragment}` : "",
    ].join("").replace(/\\/g, "/");
  }

  return [
    scheme ? `${scheme}:` : "",
    authority ? `//${authority}` : "",
    path,
    query ? `?${query}` : "",
    fragment ? `#${fragment}` : "",
  ].join("").replace(/\\/g, "/");
};

const getTargetResourceString = (resource: unknown): string => {
  const toString = (resource as { readonly toString?: unknown } | null | undefined)?.toString;
  if (typeof toString !== "function") {
    return "";
  }

  const text = String(toString.call(resource) ?? "").trim();
  return text === "[object Object]" ? "" : text;
};

const resolveCanonicalFileSeriesName = (
  file: FileRecord,
  seriesId: string,
  index: number,
): string => {
  const series = file.seriesById[seriesId];
  return String(
    series?.labelOverride ??
      series?.legendValue ??
      series?.name ??
      `Series ${index + 1}`,
  );
};

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
