/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import { computeCentralDerivative } from "src/cs/workbench/services/calculation/common/gm";
import {
  computeBaseCurrentMetrics,
  isOutputLikeFile,
  isTransferLikeFile,
} from "src/cs/workbench/services/calculation/common/ionIoff";
import {
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  resolveAutoSsSelection,
} from "src/cs/workbench/services/calculation/common/ss";
import { computeVthSqrtFits } from "src/cs/workbench/services/calculation/common/vth";
import {
  getCachedBaseCurrent,
  getCachedDerivativePoints,
  getCachedSsFitAuto,
} from "src/cs/workbench/services/calculation/common/calculationCacheAccess";
import { resolveOriginLogPositiveMinForRange } from "src/cs/workbench/services/export/common/originAxisRange";

type ProcessedNumberArrayLike = readonly number[] | Float64Array;

type OriginExportSeriesLike = {
  groupIndex?: number;
  id?: string;
  label?: string;
  name?: string;
  legendValue?: unknown;
  y?: ProcessedNumberArrayLike;
  yCol?: number;
};

type OriginExportFileLike = {
  calculationCache?: unknown;
  curveType?: string;
  fileId?: string;
  fileName?: string;
  originExportConfig?: unknown;
  originExportSourcePath?: string;
  xLabel?: string;
  xUnit?: string;
  xAxisRole?: string;
  xGroups?: readonly ProcessedNumberArrayLike[];
  series?: readonly OriginExportSeriesLike[];
  yLabel?: string;
  yUnit?: string;
  originExportPlotCommand?: string;
  originExportSkipDisplayRange?: boolean;
  originExportSkipAxisCommands?: boolean;
  originExportOmitIvCsvText?: boolean;
  originExportUseCurveYLongNames?: boolean;
  originExportYScaleFactor?: number;
  originExportYUnitLabel?: string;
  [key: string]: unknown;
};

export type OriginExportContentKey =
  | "iv"
  | "metrics"
  | "gm"
  | "gds"
  | "ss"
  | "vth";

type ResolveYScaleFactorForFile = (
  file: OriginExportFileLike | null | undefined,
) => number;
type ResolveXScaleFactorForFile = (
  file: OriginExportFileLike | null | undefined,
) => number;
type ResolveYUnitLabelForFile = (
  file: OriginExportFileLike | null | undefined,
) => string;
type ResolveCurveLabelForSeries = (
  file: OriginExportFileLike | null | undefined,
  series: OriginExportSeriesLike | null | undefined,
  index: number,
) => string;
type ResolveAxisTitleForFile = (
  file: OriginExportFileLike | null | undefined,
  axis: "x" | "y",
) => string | null | undefined;
type ResolveYValueForOriginFile = (
  file: OriginExportFileLike | null | undefined,
  y: number,
) => number;

export type OriginExportMode =
  | "merged"
  | "workbookBooks"
  | "workbookSheets"
  | "separate";

export type OriginImportMode =
  | "new-book"
  | "existing-book-new-sheet";

export type OriginYAxisScaleMode = "linear" | "log";

type OriginCurveEntry = {
  canvasLabel: string;
  fileId: string;
  label: string;
  rowCount: number;
  xArr: number[];
  yArr: number[];
  xLongName: string;
  xUnits: string;
  yLongName: string;
  yUnits: string;
};

export type OriginSelectionExport = {
  canvasCount: number;
  columnLayout?: "xy-pairs" | "shared-x" | "grouped-x";
  columnComments?: string[];
  columnDesignations?: string[];
  columnLongNames?: string[];
  columnUnits?: string[];
  csvName: string;
  csvPath?: string;
  csvText: string;
  curveCount: number;
  curveLabels: string[];
  fileIds: string[];
  importMode: OriginImportMode;
  sheetShortName?: string;
  sheetName: string;
  workbookName: string;
  xAxisTitle: string;
  xColumnComments?: string[];
  xColumnLongNames: string[];
  xColumnUnits: string[];
  xMax: number | null;
  xMin: number | null;
  xyPairCount: number;
  xyPairs: string;
  yAxisTitle: string;
  yColumnLongNames: string[];
  yColumnUnits: string[];
  yLinearMax: number | null;
  yLinearMin: number | null;
  yPositiveMax: number | null;
  yPositiveMin: number | null;
  yScaleMode?: OriginYAxisScaleMode;
  plotCommand?: string;
  skipPlot?: boolean;
  skipDisplayRange?: boolean;
  skipAxisCommands?: boolean;
};

export type OriginExportPlan = {
  mixedYScales: boolean;
  mode: OriginExportMode;
  payloads: OriginSelectionExport[];
  totalCanvasCount: number;
  totalCurveCount: number;
};

export const getRustOriginCsvDerivedContentKey = (
  payload: Pick<OriginSelectionExport, "csvName"> | null | undefined,
): "gm" | "gds" | "ss" | "vth" | null => {
  const csvName = String(payload?.csvName ?? "");
  if (/__gm__selected_curves\.csv$/i.test(csvName)) return "gm";
  if (/__gds__selected_curves\.csv$/i.test(csvName)) return "gds";
  if (/__SS__selected_curves\.csv$/i.test(csvName)) return "ss";
  if (/__Vth__selected_curves\.csv$/i.test(csvName)) return "vth";
  return null;
};

export const isRustOriginCsvEligiblePayload = (
  payload:
    | Pick<OriginSelectionExport, "csvName" | "fileIds" | "xColumnLongNames">
    | null
    | undefined,
): boolean => {
  const csvName = String(payload?.csvName ?? "");
  if (/__metrics\.csv$/i.test(csvName)) {
    return (
      Array.isArray(payload?.fileIds) &&
      payload.fileIds.length === 1 &&
      Array.isArray(payload?.xColumnLongNames) &&
      ((payload.xColumnLongNames.length === OUTPUT_METRICS_FIELDS.length &&
        OUTPUT_METRICS_FIELDS.every(
          (field, index) => payload.xColumnLongNames?.[index] === field,
        )) ||
        (payload.xColumnLongNames.length === TRANSFER_METRICS_FIELDS.length &&
          TRANSFER_METRICS_FIELDS.every(
            (field, index) => payload.xColumnLongNames?.[index] === field,
          )))
    );
  }
  return (
    Array.isArray(payload?.fileIds) &&
    payload.fileIds.length >= 1 &&
    !/__metrics/i.test(csvName)
  );
};

export const resolveRustOriginCsvYTransformForPayload = (
  payload: Pick<OriginSelectionExport, "csvName"> | null | undefined,
  fallbackTransform: "abs" | "none",
): "abs" | "derivative" | "sqrtAbs" | "none" => {
  const derivedContentKey = getRustOriginCsvDerivedContentKey(payload);
  if (derivedContentKey === "gm" || derivedContentKey === "gds") return "derivative";
  if (derivedContentKey === "ss") return "abs";
  if (derivedContentKey === "vth") return "sqrtAbs";
  return fallbackTransform;
};

const sanitizeExportFilename = (name: unknown): string =>
  String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeOriginDisplayName = (
  name: unknown,
  { max = 180, preserveUnderscore = false }: { max?: number; preserveUnderscore?: boolean } = {},
): string => {
  const raw = String(name || "")
    .replace(preserveUnderscore ? /[\\]+/g : /[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "export";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const ORIGIN_CONTENT_SHEET_BASE_NAMES: Record<OriginExportContentKey, string> = {
  gds: "gds",
  gm: "gm",
  iv: "IV",
  metrics: "Metrics",
  ss: "SS",
  vth: "Vth",
};

const ORIGIN_EXPORT_CONTENT_KEY_SET = new Set<OriginExportContentKey>([
  "iv",
  "metrics",
  "gm",
  "gds",
  "ss",
  "vth",
]);

const TRANSFER_METRICS_FIELDS = [
  "series",
  "gm_max_abs",
  "x_at_gm_max_abs",
  "vth",
  "vth_electron",
  "vth_hole",
  "ss",
  "ss_x1",
  "ss_x2",
  "ion",
  "x_at_ion",
  "ioff",
  "x_at_ioff",
  "ion_ioff",
];

const OUTPUT_METRICS_FIELDS = [
  "series",
  "gds_max_abs",
  "x_at_gds_max_abs",
];

const resolveOriginContentSheetName = (
  contentKey: OriginExportContentKey,
  index: number,
  total: number,
): string => {
  const base = ORIGIN_CONTENT_SHEET_BASE_NAMES[contentKey] ?? "Data";
  return total <= 1 ? base : `${base} ${index + 1}`;
};

const resolveOriginContentSheetShortName = (
  contentKey: OriginExportContentKey,
  index: number,
  total: number,
): string => {
  const base = ORIGIN_CONTENT_SHEET_BASE_NAMES[contentKey] ?? "Data";
  return total <= 1 ? base : `${base}${index + 1}`;
};

const applyOriginContentSheetName = (
  payload: OriginSelectionExport,
  contentKey: OriginExportContentKey,
  index: number,
  total: number,
  workbookName?: string,
): OriginSelectionExport => ({
  ...payload,
  workbookName: workbookName
    ? sanitizeOriginDisplayName(workbookName, { max: 32 })
    : payload.workbookName,
  sheetName: sanitizeOriginDisplayName(
    resolveOriginContentSheetName(contentKey, index, total),
    { max: 28 },
  ),
  sheetShortName: resolveOriginContentSheetShortName(contentKey, index, total),
});

const applyOriginSheetDisplayName = (
  payload: OriginSelectionExport,
  sheetName: string,
  sheetShortName: string,
  workbookName?: string,
): OriginSelectionExport => ({
  ...payload,
  workbookName: workbookName
    ? sanitizeOriginDisplayName(workbookName, { max: 32 })
    : payload.workbookName,
  sheetName: sanitizeOriginDisplayName(sheetName, {
    max: 28,
    preserveUnderscore: true,
  }),
  sheetShortName,
});

const resolveCanvasDisplayName = (
  value: unknown,
  { max = 80 }: { max?: number } = {},
): string =>
  sanitizeOriginDisplayName(String(value ?? "").replace(/\.csv$/i, ""), { max });

export const resolveSeriesLabel = (
  series: OriginExportSeriesLike | null | undefined,
  index: number,
): string => {
  const name = String(series?.name ?? "").trim();
  if (name && name.includes("=")) return name;

  const legendValue = String(series?.legendValue ?? "").trim();
  if (legendValue) return legendValue;

  if (name) return name;

  return `Curve ${index + 1}`;
};

const stripAxisUnitSuffix = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s*\([^()]+\)\s*$/, "")
    .trim();

const withAxisUnit = (labelRaw: unknown, unitRaw: unknown): string => {
  const label = String(labelRaw ?? "").trim();
  const unit = String(unitRaw ?? "").trim();
  if (!unit) return label;
  if (!label) return unit;
  if (label === unit) return label;
  if (/^[A-Za-z]+\s*\(/.test(label)) return label;
  if (/\([^()]+\)\s*$/.test(label)) {
    return label.replace(/\([^()]+\)\s*$/, `(${unit})`);
  }
  return `${label} (${unit})`;
};

const resolveAxisTitleWithUnit = (
  preferred: unknown,
  fallback: unknown,
  defaultTitle: string,
  unit?: unknown,
): string => {
  const preferredText = String(preferred ?? "").trim();
  if (preferredText) return withAxisUnit(preferredText, unit);
  const fallbackText = String(fallback ?? "").trim();
  if (fallbackText) return withAxisUnit(fallbackText, unit);
  return withAxisUnit(defaultTitle, unit);
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const mapNumberArray = (
  values: ProcessedNumberArrayLike,
  callback: (value: number) => number,
): number[] => Array.from(values, (value) => callback(Number(value)));

const buildPoints = (
  xArr?: ProcessedNumberArrayLike,
  yArr?: ProcessedNumberArrayLike,
): Array<{ x: number; y: number }> => {
  if (!xArr || !yArr) return [];

  const count = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (count <= 0) return [];

  const points = new Array<{ x: number; y: number }>(count);
  for (let index = 0; index < count; index += 1) {
    points[index] = { x: Number(xArr[index]), y: Number(yArr[index]) };
  }

  return points;
};

const dedupeCurveLabels = (
  curveEntries: OriginCurveEntry[],
): string[] => {
  const normalizedLabels = curveEntries.map((entry, index) => {
    const label = sanitizeOriginDisplayName(entry?.label ?? "", { max: 120 });
    return label || `Curve ${index + 1}`;
  });

  const duplicateCounts = new Map<string, number>();
  for (const label of normalizedLabels) {
    const key = label.toLowerCase();
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  return normalizedLabels.map((label, index) => {
    const duplicateCount = duplicateCounts.get(label.toLowerCase()) ?? 0;
    if (duplicateCount <= 1) return label;

    const canvasLabel = sanitizeOriginDisplayName(curveEntries[index]?.canvasLabel ?? "", {
      max: 64,
    });
    if (!canvasLabel) return label;
    return sanitizeOriginDisplayName(`${canvasLabel} | ${label}`, { max: 160 });
  });
};

const buildOriginPairGroupsExpr = (
  countRaw: unknown,
  resolvePair: (index: number) => [number, number],
): string => {
  const pairs: string[] = [];
  const count = Math.max(1, Number(countRaw) || 1);

  for (let index = 0; index < count; index += 1) {
    const [x, y] = resolvePair(index);
    pairs.push(`(${x},${y})`);
  }

  return `(${pairs.join(",")})`;
};

const buildOriginPairsExpr = (xyPairCount: unknown): string =>
  buildOriginPairGroupsExpr(xyPairCount, (index) => [index * 2 + 1, index * 2 + 2]);

const buildOriginSharedXPairsExpr = (curveCountRaw: unknown): string =>
  buildOriginPairGroupsExpr(curveCountRaw, (index) => [1, index + 2]);

const buildOriginPairsExprFromPairs = (
  pairs: Array<[number, number]>,
): string => {
  const normalizedPairs = pairs.length ? pairs : [[1, 2] as [number, number]];
  return `(${normalizedPairs.map(([x, y]) => `(${x},${y})`).join(",")})`;
};

const normalizeOriginXValueForKey = (value: unknown): string => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(Number(numeric.toPrecision(12)));
  return String(value ?? "");
};

const buildOriginXGroupKey = (entry: OriginCurveEntry): string =>
  [
    entry.fileId,
    entry.xLongName,
    entry.xUnits,
    entry.rowCount,
    entry.xArr.map(normalizeOriginXValueForKey).join(","),
  ].join("\u0001");

export const isOriginExportMode = (
  value: unknown,
): value is OriginExportMode =>
  value === "merged" ||
  value === "workbookBooks" ||
  value === "workbookSheets" ||
  value === "separate";

const resolveSelectedSeriesForOriginCanvas = (
  file: OriginExportFileLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined,
): OriginExportSeriesLike[] => {
  const allSeries = Array.isArray(file?.series) ? file.series : [];
  if (!allSeries.length) return [];

  const fileKey = String(file?.fileId ?? "");
  if (!fileKey) return allSeries;

  const liveSeriesKeys = allSeries
    .map((series) => String(series?.id ?? ""))
    .filter(Boolean);
  if (!liveSeriesKeys.length) return [];

  const stored = selectedSeriesIdsByFile?.[fileKey];
  if (!Array.isArray(stored)) return allSeries;

  const liveKeySet = new Set(liveSeriesKeys);
  const filteredKeys = stored
    .map((item) => String(item ?? ""))
    .filter((item) => liveKeySet.has(item));

  const selectedKeySet =
    filteredKeys.length === 0 && stored.length > 0
      ? new Set(liveSeriesKeys)
      : new Set(filteredKeys);

  return allSeries.filter((series) =>
    selectedKeySet.has(String(series?.id ?? "")),
  );
};

const buildOriginCurveEntriesForCanvas = (
  file: OriginExportFileLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined,
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): OriginCurveEntry[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const selectedSeries = resolveSelectedSeriesForOriginCanvas(
    file,
    selectedSeriesIdsByFile,
  );
  const canvasLabel = resolveCanvasDisplayName(file?.fileName ?? file?.fileId);
  const rawXScaleFactor = Number(resolveXScaleFactorForFile(file));
  const xScaleFactor =
    Number.isFinite(rawXScaleFactor) && rawXScaleFactor > 0 ? rawXScaleFactor : 1;
  const rawYScaleFactor = Number(resolveYScaleFactorForFile(file));
  const fileYScaleFactor = Number(file?.originExportYScaleFactor);
  const yScaleFactor = Number.isFinite(fileYScaleFactor) && fileYScaleFactor > 0
    ? fileYScaleFactor
    : Number.isFinite(rawYScaleFactor) && rawYScaleFactor > 0
      ? rawYScaleFactor
      : 1;
  const xLongName =
    stripAxisUnitSuffix(resolveAxisTitleForFile(file, "x")) ||
    stripAxisUnitSuffix(file?.xLabel) ||
    "X";
  const xUnits = String(file?.xUnit ?? "").trim();
  const yAxisLongName =
    stripAxisUnitSuffix(resolveAxisTitleForFile(file, "y")) ||
    stripAxisUnitSuffix(file?.yLabel) ||
    "Y";
  const yUnits = String(
    file?.originExportYUnitLabel ?? resolveYUnitLabelForFile(file) ?? "",
  ).trim();
  const useCurveLabelAsYLongName =
    selectedSeries.length > 1 || Boolean(file?.originExportUseCurveYLongNames);
  const resolveCurveLabel = (series: OriginExportSeriesLike, index: number): string =>
    resolveCurveLabelForSeries(file, series, index);

  return selectedSeries
    .map((series, index) => {
      const groupIndex = Number(series?.groupIndex);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
      if (!xArr || !yArr || rowCount <= 0) return null;
      const scaledYArr = mapNumberArray(
        yArr,
        (value) => value * yScaleFactor,
      );
      const exportYArr = scaledYArr.map((value) =>
        Number.isFinite(value) ? resolveYValueForOriginFile(file, value) : value,
      );
      return {
        canvasLabel,
        fileId: String(file?.fileId ?? canvasLabel),
        label: resolveCurveLabel(series, index),
        rowCount,
        xArr: mapNumberArray(
          xArr,
          (value) => value * xScaleFactor,
        ),
        yArr: exportYArr,
        xLongName,
        xUnits,
        yLongName: useCurveLabelAsYLongName
          ? resolveCurveLabel(series, index)
          : yAxisLongName,
        yUnits,
      };
    })
    .filter((entry): entry is OriginCurveEntry => Boolean(entry));
};

const buildWorksheetExport = ({
  canvases,
  curveEntries,
  csvBase,
  importMode = "new-book",
  sheetName,
  workbookName,
  xAxisTitle,
  yAxisTitle,
}: {
  canvases: OriginExportFileLike[];
  curveEntries: OriginCurveEntry[];
  csvBase: string;
  importMode?: OriginImportMode;
  sheetName: string;
  workbookName: string;
  xAxisTitle: string;
  yAxisTitle: string;
}): OriginSelectionExport | null => {
  if (!curveEntries.length) return null;
  const xGroups: Array<{
    entries: OriginCurveEntry[];
    key: string;
  }> = [];
  const xGroupByKey = new Map<string, number>();
  for (const entry of curveEntries) {
    const key = buildOriginXGroupKey(entry);
    const groupIndex = xGroupByKey.get(key);
    if (groupIndex === undefined) {
      xGroupByKey.set(key, xGroups.length);
      xGroups.push({ entries: [entry], key });
    } else {
      xGroups[groupIndex]!.entries.push(entry);
    }
  }
  const useSharedXLayout = xGroups.length === 1 && curveEntries.length > 1;
  const useGroupedXLayout = xGroups.length > 1 && xGroups.some((group) => group.entries.length > 1);

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yLinearMin = Number.POSITIVE_INFINITY;
  let yLinearMax = Number.NEGATIVE_INFINITY;
  let yPositiveMin = Number.POSITIVE_INFINITY;
  let yPositiveMax = Number.NEGATIVE_INFINITY;
  const yPositiveValues: number[] = [];

  for (const entry of curveEntries) {
    for (let idx = 0; idx < entry.rowCount; idx += 1) {
      const x = Number(entry.xArr[idx]);
      const y = Number(entry.yArr[idx]);

      if (Number.isFinite(x)) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
      if (!Number.isFinite(y)) continue;

      if (y < yLinearMin) yLinearMin = y;
      if (y > yLinearMax) yLinearMax = y;
      if (y > 0) {
        if (y < yPositiveMin) yPositiveMin = y;
        if (y > yPositiveMax) yPositiveMax = y;
        yPositiveValues.push(y);
      }
    }
  }

  const maxRowCount = curveEntries.reduce(
    (max, entry) => Math.max(max, entry.rowCount),
    0,
  );
  const omitCsvText =
    canvases.length > 0 &&
    canvases.every((canvas) => Boolean(canvas?.originExportOmitIvCsvText));
  const columnLongNames: string[] = [];
  const columnUnits: string[] = [];
  const columnComments: string[] = [];
  const columnDesignations: string[] = [];
  const xyPairs: Array<[number, number]> = [];
  if (useGroupedXLayout) {
    let columnIndex = 1;
    for (const group of xGroups) {
      const sharedXEntry = group.entries[0]!;
      columnLongNames.push(sharedXEntry.xLongName);
      columnUnits.push(sharedXEntry.xUnits);
      columnComments.push(sharedXEntry.canvasLabel);
      columnDesignations.push("x");
      const xColumnIndex = columnIndex;
      columnIndex += 1;
      for (const entry of group.entries) {
        columnLongNames.push(entry.yLongName);
        columnUnits.push(entry.yUnits);
        columnComments.push("");
        columnDesignations.push("y");
        xyPairs.push([xColumnIndex, columnIndex]);
        columnIndex += 1;
      }
    }
  }
  const rows = omitCsvText ? [] : new Array<Array<number | string>>(maxRowCount);
  if (!omitCsvText) {
    for (let rowIndex = 0; rowIndex < maxRowCount; rowIndex += 1) {
      const row: Array<number | string> = [];
      if (useSharedXLayout) {
        const sharedXEntry = curveEntries[0];
        row.push(rowIndex < sharedXEntry.rowCount ? (sharedXEntry.xArr[rowIndex] ?? "") : "");
        for (const entry of curveEntries) {
          row.push(rowIndex < entry.rowCount ? (entry.yArr[rowIndex] ?? "") : "");
        }
      } else if (useGroupedXLayout) {
        for (const group of xGroups) {
          const sharedXEntry = group.entries[0]!;
          row.push(rowIndex < sharedXEntry.rowCount ? (sharedXEntry.xArr[rowIndex] ?? "") : "");
          for (const entry of group.entries) {
            row.push(rowIndex < entry.rowCount ? (entry.yArr[rowIndex] ?? "") : "");
          }
        }
      } else {
        for (const entry of curveEntries) {
          row.push(
            rowIndex < entry.rowCount ? (entry.xArr[rowIndex] ?? "") : "",
            rowIndex < entry.rowCount ? (entry.yArr[rowIndex] ?? "") : "",
          );
        }
      }
      rows[rowIndex] = row;
    }
  }

  const resolvedPositiveMin = Number.isFinite(yPositiveMin)
    ? resolveOriginLogPositiveMinForRange(yPositiveValues, yPositiveMin)
    : null;
  const curveLabels = dedupeCurveLabels(curveEntries);
  const sharedXEntry = curveEntries[0];

  return {
    canvasCount: canvases.length,
    columnComments: useGroupedXLayout ? columnComments : undefined,
    columnDesignations: useGroupedXLayout ? columnDesignations : undefined,
    columnLayout: useSharedXLayout ? "shared-x" : useGroupedXLayout ? "grouped-x" : "xy-pairs",
    columnLongNames: useGroupedXLayout ? columnLongNames : undefined,
    columnUnits: useGroupedXLayout ? columnUnits : undefined,
    csvName: `${csvBase}.csv`,
    csvText: omitCsvText ? "" : "\uFEFF" + Papa.unparse(rows),
    curveCount: curveEntries.length,
    curveLabels,
    fileIds: canvases
      .map((canvas) => String(canvas?.fileId ?? ""))
      .filter(Boolean),
    importMode,
    sheetName,
    workbookName,
    xAxisTitle,
    xColumnLongNames: useGroupedXLayout
      ? xGroups.map((group) => group.entries[0]!.xLongName)
      : useSharedXLayout
      ? [sharedXEntry.xLongName]
      : curveEntries.map((entry) => entry.xLongName),
    xColumnUnits: useGroupedXLayout
      ? xGroups.map((group) => group.entries[0]!.xUnits)
      : useSharedXLayout
      ? [sharedXEntry.xUnits]
      : curveEntries.map((entry) => entry.xUnits),
    xMax: Number.isFinite(xMax) ? xMax : null,
    xMin: Number.isFinite(xMin) ? xMin : null,
    xyPairCount: curveEntries.length,
    xyPairs: useGroupedXLayout
      ? buildOriginPairsExprFromPairs(xyPairs)
      : useSharedXLayout
      ? buildOriginSharedXPairsExpr(curveEntries.length)
      : buildOriginPairsExpr(curveEntries.length),
    yAxisTitle,
    yColumnLongNames: curveEntries.map((entry) => entry.yLongName),
    yColumnUnits: curveEntries.map((entry) => entry.yUnits),
    yLinearMax: Number.isFinite(yLinearMax) ? yLinearMax : null,
    yLinearMin: Number.isFinite(yLinearMin) ? yLinearMin : null,
    yPositiveMax: Number.isFinite(yPositiveMax) ? yPositiveMax : null,
    yPositiveMin: resolvedPositiveMin,
    plotCommand: canvases.find((canvas) =>
      String(canvas?.originExportPlotCommand ?? "").trim(),
    )?.originExportPlotCommand,
    skipDisplayRange: canvases.some((canvas) =>
      Boolean(canvas?.originExportSkipDisplayRange),
    ),
    skipAxisCommands: canvases.some((canvas) =>
      Boolean(canvas?.originExportSkipAxisCommands),
    ),
  };
};

export const buildOriginCanvasExport = (
  canvas: OriginExportFileLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): OriginSelectionExport | null => {
  if (!canvas) return null;

  const curveEntries = buildOriginCurveEntriesForCanvas(
    canvas,
    selectedSeriesIdsByFile,
    resolveXScaleFactorForFile,
    resolveYScaleFactorForFile,
    resolveYUnitLabelForFile,
    resolveCurveLabelForSeries,
    resolveAxisTitleForFile,
    resolveYValueForOriginFile,
  );
  if (!curveEntries.length) return null;

  const canvasName = String(canvas?.fileName ?? "export");
  const csvBase = `${sanitizeExportFilename(canvasName)
    .replace(/\.csv$/i, "")
    .trim() || "export"}__selected_curves`;
  const xAxisTitle = resolveAxisTitleWithUnit(
    resolveAxisTitleForFile(canvas, "x"),
    canvas?.xLabel,
    "X",
    curveEntries[0]?.xUnits,
  );
  const yAxisTitle = resolveAxisTitleWithUnit(
    resolveAxisTitleForFile(canvas, "y"),
    canvas?.yLabel,
    "Y",
    curveEntries[0]?.yUnits,
  );

  return buildWorksheetExport({
    canvases: [canvas],
    curveEntries,
    csvBase,
    sheetName: sanitizeOriginDisplayName(canvasName.replace(/\.csv$/i, "")),
    workbookName: sanitizeOriginDisplayName(canvasName.replace(/\.csv$/i, "")),
    xAxisTitle,
    yAxisTitle,
  });
};

export const buildOriginSelectionExport = (
  selectedCanvases: OriginExportFileLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): OriginSelectionExport | null => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is OriginExportFileLike => Boolean(file),
  );
  if (!liveCanvases.length) return null;

  const curveEntries = liveCanvases.flatMap((file) =>
    buildOriginCurveEntriesForCanvas(
      file,
      selectedSeriesIdsByFile,
      resolveXScaleFactorForFile,
      resolveYScaleFactorForFile,
      resolveYUnitLabelForFile,
      resolveCurveLabelForSeries,
      resolveAxisTitleForFile,
      resolveYValueForOriginFile,
    ),
  );
  if (!curveEntries.length) return null;

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "export");
  const sanitizedFirstBase = sanitizeExportFilename(firstCanvasName)
    .replace(/\.csv$/i, "")
    .trim();
  const canvasCount = liveCanvases.length;
  const curveCount = curveEntries.length;
  const csvBase =
    canvasCount === 1
      ? `${sanitizedFirstBase || "export"}__selected_curves`
      : `${canvasCount}files_${curveCount}curves`;
  const workbookName =
    canvasCount === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "workbook")
      : sanitizeOriginDisplayName(
          `Merged curves ${canvasCount} files ${curveCount} curves`,
        );
  const firstCanvas = liveCanvases[0] ?? null;
  const xAxisTitle = resolveAxisTitleWithUnit(
    resolveAxisTitleForFile(firstCanvas, "x"),
    firstCanvas?.xLabel,
    "X",
    curveEntries[0]?.xUnits,
  );
  const yAxisTitle = resolveAxisTitleWithUnit(
    resolveAxisTitleForFile(firstCanvas, "y"),
    firstCanvas?.yLabel,
    "Y",
    curveEntries[0]?.yUnits,
  );

  return buildWorksheetExport({
    canvases: liveCanvases,
    curveEntries,
    csvBase,
    sheetName: workbookName,
    workbookName,
    xAxisTitle,
    yAxisTitle,
  });
};

const buildOriginWorkbookSheetsExports = (
  selectedCanvases: OriginExportFileLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): OriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is OriginExportFileLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "export");
  const sanitizedFirstBase = sanitizeExportFilename(firstCanvasName)
    .replace(/\.csv$/i, "")
    .trim();
  const workbookName =
    liveCanvases.length === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "workbook")
      : sanitizeOriginDisplayName(
          `Selected thumbnails ${liveCanvases.length} sheets`,
        );

  return liveCanvases
    .map((canvas): OriginSelectionExport | null => {
      const exportPayload = buildOriginCanvasExport(
        canvas,
        selectedSeriesIdsByFile,
        resolveXScaleFactorForFile,
        resolveYScaleFactorForFile,
        resolveYUnitLabelForFile,
        resolveCurveLabelForSeries,
        resolveAxisTitleForFile,
        resolveYValueForOriginFile,
      );
      if (!exportPayload) return null;
      return {
        ...exportPayload,
        importMode: "new-book" as const,
        sheetName: sanitizeOriginDisplayName(
          String(canvas?.fileName ?? exportPayload.sheetName).replace(/\.csv$/i, ""),
        ),
        workbookName,
      };
    })
    .filter((item): item is OriginSelectionExport => Boolean(item));
};

const cloneSeriesWithDerivedY = (
  series: OriginExportSeriesLike,
  y: number[],
): OriginExportSeriesLike => ({
  ...series,
  y,
});

const buildDerivedSeriesList = (
  file: OriginExportFileLike,
  xGroups: readonly ProcessedNumberArrayLike[],
  seriesList: readonly OriginExportSeriesLike[],
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
  deriveY: (
    series: OriginExportSeriesLike,
    points: Array<{ x: number; y: number }>,
  ) => number[],
  hasUsableY: (values: number[]) => boolean,
): OriginExportSeriesLike[] =>
  seriesList
    .map((series) => {
      const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
      const derivedY = deriveY(series, points);
      if (!hasUsableY(derivedY)) return null;
      return cloneSeriesWithDerivedY(
        {
          ...series,
          name: resolveCurveLabelForSeries(file, series, 0),
        },
        derivedY,
      );
    })
    .filter((series): series is OriginExportSeriesLike => series !== null);

const hasFiniteValue = (values: number[]): boolean =>
  values.some((value) => Number.isFinite(value));

const hasPositiveFiniteValue = (values: number[]): boolean =>
  values.some((value) => Number.isFinite(value) && value > 0);

const withDerivedOriginFileSemantics = (
  file: OriginExportFileLike,
  {
    baseName,
    fileSuffix,
    originExportYUnitLabel,
    omitCsvText = false,
    series,
    yLabel,
    yUnit,
  }: {
    baseName: string;
    fileSuffix: string;
    originExportYUnitLabel: string;
    omitCsvText?: boolean;
    series: OriginExportSeriesLike[];
    yLabel: string;
    yUnit: string;
  },
): OriginExportFileLike => ({
  ...file,
  fileName: `${baseName}__${fileSuffix}.csv`,
  series,
  yLabel,
  yUnit,
  originExportOmitIvCsvText: omitCsvText,
  originExportUseCurveYLongNames: true,
  originExportSkipDisplayRange: true,
  originExportYScaleFactor: 1,
  originExportYUnitLabel,
});

const buildDerivedCurveFile = (
  file: OriginExportFileLike,
  contentKey: Exclude<OriginExportContentKey, "iv" | "metrics">,
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
): OriginExportFileLike | null => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const seriesList = Array.isArray(file?.series) ? file.series : [];
  if (!xGroups.length || !seriesList.length) return null;

  const isTransfer = isTransferLikeFile(file as any);
  const isOutput = isOutputLikeFile(file as any);
  const baseName = String(file?.fileName ?? "export").replace(/\.csv$/i, "");

  if (contentKey === "gm" || contentKey === "gds") {
    if (contentKey === "gm" && !isTransfer) return null;
    if (contentKey === "gds" && !isOutput) return null;
    const derivativeLabel = contentKey === "gm" ? "gm" : "gds";
    const derivedSeries = buildDerivedSeriesList(
      file,
      xGroups,
      seriesList,
      resolveCurveLabelForSeries,
      (series, points) => {
        const cachedDerivative = getCachedDerivativePoints(file, series);
        const derivative = cachedDerivative ?? computeCentralDerivative(points);
        return derivative.map((point: any) =>
          isFiniteNumber(point?.y) ? point.y : NaN,
        );
      },
      hasFiniteValue,
    );
    if (!derivedSeries.length) return null;
    const denom = String(file?.xUnit ?? "V").trim() || "V";
    return withDerivedOriginFileSemantics(file, {
      baseName,
      fileSuffix: derivativeLabel,
      omitCsvText: Boolean(file?.originExportOmitIvCsvText),
      series: derivedSeries,
      yLabel: derivativeLabel,
      yUnit: `A/${denom}`,
      originExportYUnitLabel: `A/${denom}`,
    });
  }

  if (contentKey === "ss") {
    if (!isTransfer) return null;
    const derivedSeries = buildDerivedSeriesList(
      file,
      xGroups,
      seriesList,
      resolveCurveLabelForSeries,
      (_series, points) => points.map((point) =>
        isFiniteNumber(point?.y) ? Math.abs(point.y) : NaN,
      ),
      hasPositiveFiniteValue,
    );
    if (!derivedSeries.length) return null;
    return withDerivedOriginFileSemantics(file, {
      baseName,
      fileSuffix: "SS",
      omitCsvText: Boolean(file?.originExportOmitIvCsvText),
      series: derivedSeries,
      yLabel: "|I|",
      yUnit: String(file?.yUnit ?? "A").trim() || "A",
      originExportYUnitLabel: String(file?.originExportYUnitLabel ?? file?.yUnit ?? "A").trim() || "A",
    });
  }

  if (contentKey === "vth") {
    if (!isTransfer) return null;
    const derivedSeries = buildDerivedSeriesList(
      file,
      xGroups,
      seriesList,
      resolveCurveLabelForSeries,
      (_series, points) => points.map((point) =>
        isFiniteNumber(point?.y) ? Math.sqrt(Math.abs(point.y)) : NaN,
      ),
      hasFiniteValue,
    );
    if (!derivedSeries.length) return null;
    return withDerivedOriginFileSemantics(file, {
      baseName,
      fileSuffix: "Vth",
      omitCsvText: Boolean(file?.originExportOmitIvCsvText),
      series: derivedSeries,
      yLabel: "sqrt(|I|)",
      yUnit: "sqrt(A)",
      originExportYUnitLabel: "sqrt(A)",
    });
  }

  return null;
};

const buildMetricsWorksheetExports = (
  selectedCanvases: OriginExportFileLike[],
  selectedSeriesIdsByFile: Record<string, string[] | undefined> | null | undefined,
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
): OriginSelectionExport[] => {
  return selectedCanvases
    .map((file): OriginSelectionExport | null => {
      const rows: Array<Record<string, number | string>> = [];
    const supportsTransfer = isTransferLikeFile(file as any);
    const supportsOutput = isOutputLikeFile(file as any);
    const fields = supportsTransfer ? TRANSFER_METRICS_FIELDS : supportsOutput ? OUTPUT_METRICS_FIELDS : TRANSFER_METRICS_FIELDS;
    const selectedSeries = resolveSelectedSeriesForOriginCanvas(
      file,
      selectedSeriesIdsByFile,
    );
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    for (const [index, series] of selectedSeries.entries()) {
      const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
      if (!points.length) continue;
      const derivative =
        getCachedDerivativePoints(file, series) ?? computeCentralDerivative(points);
      let derivativeMaxAbs = Number.NEGATIVE_INFINITY;
      let xAtDerivativeMaxAbs: number | null = null;
      for (const point of derivative as any[]) {
        const y = Number(point?.y);
        const x = Number(point?.x);
        if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
        const abs = Math.abs(y);
        if (abs > derivativeMaxAbs) {
          derivativeMaxAbs = abs;
          xAtDerivativeMaxAbs = x;
        }
      }
      const vthFits = supportsTransfer ? computeVthSqrtFits(points) : [];
      const electronVth = vthFits.find((fit) => fit.branch === "electron")?.vth ?? null;
      const holeVth = vthFits.find((fit) => fit.branch === "hole")?.vth ?? null;
      const ssSelection = supportsTransfer
        ? resolveAutoSsSelection(
            (getCachedSsFitAuto(file, series) ??
              computeSubthresholdSwingFitAuto(points)) as any,
          )
        : null;
      const ssFit = ssSelection?.fit as any;
      const baseMetrics =
        (getCachedBaseCurrent(file, series, supportsTransfer) as any) ??
        (computeBaseCurrentMetrics({
          points,
          sourceFile: file,
        } as any) as any);
      const row: Record<string, number | string> = {
        ion: isFiniteNumber(baseMetrics?.ion) ? baseMetrics.ion : "",
        ion_ioff: isFiniteNumber(baseMetrics?.ionIoff) ? baseMetrics.ionIoff : "",
        ioff: isFiniteNumber(baseMetrics?.ioff) ? baseMetrics.ioff : "",
        series: resolveCurveLabelForSeries(file, series, index),
        ss: Boolean(ssSelection?.classification?.ss_ok) && isFiniteNumber(ssFit?.ss)
          ? ssFit.ss
          : "",
        ss_x1: Boolean(ssSelection?.classification?.ss_ok) && isFiniteNumber(ssFit?.x1)
          ? ssFit.x1
          : "",
        ss_x2: Boolean(ssSelection?.classification?.ss_ok) && isFiniteNumber(ssFit?.x2)
          ? ssFit.x2
          : "",
        vth: isFiniteNumber(electronVth) ? electronVth : isFiniteNumber(holeVth) ? holeVth : "",
        vth_electron: isFiniteNumber(electronVth) ? electronVth : "",
        vth_hole: isFiniteNumber(holeVth) ? holeVth : "",
        x_at_ion: isFiniteNumber(baseMetrics?.xAtIon) ? baseMetrics.xAtIon : "",
        x_at_ioff: isFiniteNumber(baseMetrics?.xAtIoff) ? baseMetrics.xAtIoff : "",
      };
      if (supportsOutput && !supportsTransfer) {
        row.gds_max_abs = Number.isFinite(derivativeMaxAbs) ? derivativeMaxAbs : "";
        row.x_at_gds_max_abs = isFiniteNumber(xAtDerivativeMaxAbs) ? xAtDerivativeMaxAbs : "";
      } else {
        row.gm_max_abs = Number.isFinite(derivativeMaxAbs) ? derivativeMaxAbs : "";
        row.x_at_gm_max_abs = isFiniteNumber(xAtDerivativeMaxAbs) ? xAtDerivativeMaxAbs : "";
      }
      rows.push(row);
    }

      if (!rows.length) return null;
      const csvRows = rows.map((row) =>
        fields.map((field) => row[field] ?? ""),
      );
      const omitCsvText =
        (supportsOutput || supportsTransfer) &&
        Boolean(file?.originExportOmitIvCsvText);
      const csvText = omitCsvText ? "" : "\uFEFF" + Papa.unparse(csvRows);
      const fileName = sanitizeExportFilename(file?.fileName ?? "export")
        .replace(/\.csv$/i, "")
        .trim();
      const workbookName = sanitizeOriginDisplayName(fileName || "workbook");
      const comments = fields.map((_, index) =>
        index === 0 ? String(file?.fileName ?? "") : "",
      );
      return {
        canvasCount: 1,
        columnLayout: "xy-pairs",
        csvName: `${fileName || "export"}__metrics.csv`,
        csvText,
        curveCount: 0,
        curveLabels: rows.map((row) => String(row.series ?? "")),
        fileIds: [String(file?.fileId ?? "")].filter(Boolean),
        importMode: "new-book",
        sheetName: "Metrics",
        skipPlot: true,
        skipAxisCommands: true,
        workbookName,
        xAxisTitle: "",
        xColumnComments: comments,
        xColumnLongNames: fields,
        xColumnUnits: fields.map(() => ""),
        xMax: null,
        xMin: null,
        xyPairCount: 0,
        xyPairs: "((1,2))",
        yAxisTitle: "",
        yColumnLongNames: [],
        yColumnUnits: [],
        yLinearMax: null,
        yLinearMin: null,
        yPositiveMax: null,
        yPositiveMin: null,
      };
    })
    .filter((payload): payload is OriginSelectionExport => payload !== null);
};

const normalizeOriginExportContentKeys = (
  contentKeys?: readonly OriginExportContentKey[] | null,
): OriginExportContentKey[] => {
  const keys = (Array.isArray(contentKeys) ? contentKeys : ["iv"])
    .filter((key): key is OriginExportContentKey => ORIGIN_EXPORT_CONTENT_KEY_SET.has(key));
  return keys.length ? Array.from(new Set(keys)) : ["iv"];
};

const buildIvOriginExportGroups = (
  canvases: OriginExportFileLike[],
): Array<{
  canvases: OriginExportFileLike[];
  sheetName: string;
  sheetShortName: string;
}> => {
  const transferCanvases = canvases.filter((canvas) =>
    isTransferLikeFile(canvas as any),
  );
  const outputCanvases = canvases.filter((canvas) =>
    isOutputLikeFile(canvas as any),
  );
  const groupedIds = new Set(
    [...transferCanvases, ...outputCanvases].map((canvas) => canvas),
  );
  const otherCanvases = canvases.filter((canvas) => !groupedIds.has(canvas));
  const groups: Array<{
    canvases: OriginExportFileLike[];
    sheetName: string;
    sheetShortName: string;
  }> = [];
  if (transferCanvases.length) {
    groups.push({
      canvases: transferCanvases,
      sheetName: "IV_Trans",
      sheetShortName: "IVTrans",
    });
  }
  if (outputCanvases.length) {
    groups.push({
      canvases: outputCanvases,
      sheetName: "IV_Output",
      sheetShortName: "IVOutput",
    });
  }
  if (otherCanvases.length) {
    groups.push({
      canvases: otherCanvases,
      sheetName: groups.length ? "IV_Other" : "IV",
      sheetShortName: groups.length ? "IVOther" : "IV",
    });
  }
  return groups.length ? groups : [{ canvases, sheetName: "IV", sheetShortName: "IV" }];
};

export const buildOriginExportsByMode = (
  selectedCanvases: OriginExportFileLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  exportMode: OriginExportMode = "merged",
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): OriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is OriginExportFileLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  if (exportMode === "workbookSheets") {
    return buildOriginWorkbookSheetsExports(
      liveCanvases,
      selectedSeriesIdsByFile,
      resolveXScaleFactorForFile,
      resolveYScaleFactorForFile,
      resolveYUnitLabelForFile,
      resolveCurveLabelForSeries,
      resolveAxisTitleForFile,
      resolveYValueForOriginFile,
    );
  }

  if (exportMode === "workbookBooks" || exportMode === "separate") {
    return liveCanvases
      .map((canvas) =>
        buildOriginCanvasExport(
          canvas,
          selectedSeriesIdsByFile,
          resolveXScaleFactorForFile,
          resolveYScaleFactorForFile,
          resolveYUnitLabelForFile,
          resolveCurveLabelForSeries,
          resolveAxisTitleForFile,
          resolveYValueForOriginFile,
        ),
      )
      .filter((item): item is OriginSelectionExport => Boolean(item));
  }

  const merged = buildOriginSelectionExport(
    liveCanvases,
    selectedSeriesIdsByFile,
    resolveXScaleFactorForFile,
    resolveYScaleFactorForFile,
    resolveYUnitLabelForFile,
    resolveCurveLabelForSeries,
    resolveAxisTitleForFile,
    resolveYValueForOriginFile,
  );
  return merged ? [merged] : [];
};

const resolveNormalizedOriginYScale = (
  value: unknown,
): OriginYAxisScaleMode =>
  String(value ?? "").trim().toLowerCase() === "log" ? "log" : "linear";

const appendOriginScaleSuffix = (
  value: unknown,
  scaleMode: OriginYAxisScaleMode,
): string => {
  const base = sanitizeOriginDisplayName(value, { max: 140 });
  const suffix = scaleMode === "log" ? "Log" : "Linear";
  return sanitizeOriginDisplayName(`${base || "Merged curves"} ${suffix}`, {
    max: 160,
  });
};

export const buildOriginExportPlan = (
  selectedCanvases: OriginExportFileLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  exportMode: OriginExportMode = "merged",
  resolveYScaleForFile: (
    file: OriginExportFileLike | null | undefined,
  ) => OriginYAxisScaleMode = () => "linear",
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
  contentKeys: readonly OriginExportContentKey[] = ["iv"],
  buildingIvGroup = false,
): OriginExportPlan => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is OriginExportFileLike => Boolean(file),
  );
  if (!liveCanvases.length) {
    return {
      mixedYScales: false,
      mode: exportMode,
      payloads: [],
      totalCanvasCount: 0,
      totalCurveCount: 0,
    };
  }
  const normalizedContentKeys = normalizeOriginExportContentKeys(contentKeys);
  const ivGroups = buildIvOriginExportGroups(liveCanvases);
  if (
    normalizedContentKeys.length > 1 ||
    normalizedContentKeys[0] !== "iv" ||
    ivGroups.length > 1 ||
    (!buildingIvGroup && ivGroups.length === 1 && ivGroups[0]?.sheetName !== "IV")
  ) {
    const entries: Array<{
      contentKey: OriginExportContentKey;
      payload: OriginSelectionExport;
    }> = [];
    for (const contentKey of normalizedContentKeys) {
      if (contentKey === "metrics") {
        const metricsPayloads = buildMetricsWorksheetExports(
          liveCanvases,
          selectedSeriesIdsByFile,
          resolveCurveLabelForSeries,
        );
        entries.push(
          ...metricsPayloads.map((payload) => ({ contentKey, payload })),
        );
        continue;
      }

      if (contentKey === "iv") {
        for (const group of ivGroups) {
          const nextPayloads = buildOriginExportPlan(
            group.canvases,
            selectedSeriesIdsByFile,
            exportMode,
            resolveYScaleForFile,
            resolveXScaleFactorForFile,
            resolveYScaleFactorForFile,
            resolveYUnitLabelForFile,
            resolveCurveLabelForSeries,
            resolveAxisTitleForFile,
            resolveYValueForOriginFile,
            ["iv"],
            true,
          ).payloads;
          entries.push(
            ...nextPayloads.map((payload) => ({
              contentKey,
              payload: applyOriginSheetDisplayName(
                payload,
                group.sheetName,
                group.sheetShortName,
              ),
            })),
          );
        }
        continue;
      }

      const derivedCanvases = liveCanvases
        .map((canvas) =>
          buildDerivedCurveFile(canvas, contentKey, resolveCurveLabelForSeries),
        )
        .filter((canvas): canvas is OriginExportFileLike => canvas !== null);
      if (!derivedCanvases.length) continue;
      const nextPayloads = buildOriginExportPlan(
          derivedCanvases,
          selectedSeriesIdsByFile,
          exportMode,
          contentKey === "ss" || contentKey === "vth" ? () => "linear" : resolveYScaleForFile,
          resolveXScaleFactorForFile,
          resolveYScaleFactorForFile,
          resolveYUnitLabelForFile,
          resolveCurveLabelForSeries,
          resolveAxisTitleForFile,
          (_file, y) => y,
          ["iv"],
        ).payloads;
      entries.push(
        ...nextPayloads.map((payload) => ({ contentKey, payload })),
      );
    }
    const contentCounts = entries.reduce((counts, entry) => {
      counts.set(entry.contentKey, (counts.get(entry.contentKey) ?? 0) + 1);
      return counts;
    }, new Map<OriginExportContentKey, number>());
    const contentSeen = new Map<OriginExportContentKey, number>();
    const contentWorkbookName =
      (liveCanvases.length === 1
        ? "Analysis"
        : `Analysis ${liveCanvases.length} files`);
    const payloads = entries.map((entry) => {
      if (entry.contentKey === "iv" && entry.payload.sheetShortName) {
        return applyOriginSheetDisplayName(
          entry.payload,
          entry.payload.sheetName,
          entry.payload.sheetShortName,
          contentWorkbookName,
        );
      }
      const seen = contentSeen.get(entry.contentKey) ?? 0;
      contentSeen.set(entry.contentKey, seen + 1);
      return applyOriginContentSheetName(
        entry.payload,
        entry.contentKey,
        seen,
        contentCounts.get(entry.contentKey) ?? 1,
        contentWorkbookName,
      );
    });

    return {
      mixedYScales: false,
      mode: payloads.length > 1 ? "workbookSheets" : exportMode,
      payloads,
      totalCanvasCount: liveCanvases.length,
      totalCurveCount: payloads.reduce(
        (sum, payload) => sum + Number(payload?.curveCount ?? 0),
        0,
      ),
    };
  }

  if (exportMode !== "merged") {
    const payloads = buildOriginExportsByMode(
      liveCanvases,
      selectedSeriesIdsByFile,
      exportMode,
      resolveXScaleFactorForFile,
      resolveYScaleFactorForFile,
      resolveYUnitLabelForFile,
      resolveCurveLabelForSeries,
      resolveAxisTitleForFile,
      resolveYValueForOriginFile,
    ).map((payload) => ({
      ...payload,
      yScaleMode: resolveNormalizedOriginYScale(
        resolveYScaleForFile(
          liveCanvases.find(
            (file) => String(file?.fileId ?? "") === String(payload.fileIds?.[0] ?? ""),
          ) ?? null,
        ),
      ),
    }));
    return {
      mixedYScales: false,
      mode: exportMode,
      payloads,
      totalCanvasCount: liveCanvases.length,
      totalCurveCount: payloads.reduce(
        (sum, payload) => sum + Number(payload?.curveCount ?? 0),
        0,
      ),
    };
  }

  const groupedCanvases = new Map<
    OriginYAxisScaleMode,
    OriginExportFileLike[]
  >();
  for (const canvas of liveCanvases) {
    const scaleMode = resolveNormalizedOriginYScale(resolveYScaleForFile(canvas));
    const existing = groupedCanvases.get(scaleMode);
    if (existing) {
      existing.push(canvas);
    } else {
      groupedCanvases.set(scaleMode, [canvas]);
    }
  }

  if (groupedCanvases.size <= 1) {
    const payloads = buildOriginExportsByMode(
      liveCanvases,
      selectedSeriesIdsByFile,
      "merged",
      resolveXScaleFactorForFile,
      resolveYScaleFactorForFile,
      resolveYUnitLabelForFile,
      resolveCurveLabelForSeries,
      resolveAxisTitleForFile,
      resolveYValueForOriginFile,
    ).map((payload) => ({
      ...payload,
      yScaleMode: resolveNormalizedOriginYScale(resolveYScaleForFile(liveCanvases[0] ?? null)),
    }));
    return {
      mixedYScales: false,
      mode: "merged",
      payloads,
      totalCanvasCount: liveCanvases.length,
      totalCurveCount: payloads.reduce(
        (sum, payload) => sum + Number(payload?.curveCount ?? 0),
        0,
      ),
    };
  }

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "export");
  const workbookName = sanitizeOriginDisplayName(
    `Mixed-scale export ${sanitizeExportFilename(firstCanvasName).replace(/\.csv$/i, "").trim() || "export"}`,
  );
  const payloads = Array.from(groupedCanvases.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scaleMode, canvases]): OriginSelectionExport | null => {
      const payload = buildOriginSelectionExport(
        canvases,
        selectedSeriesIdsByFile,
        resolveXScaleFactorForFile,
        resolveYScaleFactorForFile,
        resolveYUnitLabelForFile,
        resolveCurveLabelForSeries,
        resolveAxisTitleForFile,
        resolveYValueForOriginFile,
      );
      if (!payload) return null;
      const suffix = scaleMode === "log" ? "log" : "linear";
      return {
        ...payload,
        csvName: `${String(payload.csvName || "export").replace(/\.csv$/i, "")}__${suffix}.csv`,
        sheetName: appendOriginScaleSuffix(payload.sheetName, scaleMode),
        workbookName,
        yScaleMode: scaleMode,
      };
    })
    .filter((payload): payload is OriginSelectionExport => payload !== null);

  return {
    mixedYScales: true,
    mode: "workbookSheets",
    payloads,
    totalCanvasCount: liveCanvases.length,
    totalCurveCount: payloads.reduce(
      (sum, payload) => sum + Number(payload?.curveCount ?? 0),
      0,
    ),
  };
};
