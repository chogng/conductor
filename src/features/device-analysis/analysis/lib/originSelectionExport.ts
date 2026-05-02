import Papa from "papaparse";
import {
  computeCentralDerivative,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  resolveAutoSsSelection,
} from "./analysisMath.ts";
import {
  computeBaseCurrentMetrics,
  isOutputLikeDeviceAnalysisFile,
  isTransferLikeDeviceAnalysisFile,
} from "./deviceAnalysisMetrics.ts";
import { resolveOriginLogPositiveMinForRange } from "./originAxisCommands.ts";

type ProcessedSeriesLike = {
  id?: string;
  name?: string;
  legendValue?: unknown;
  groupIndex?: number;
  y?: number[];
};

type ProcessedEntryLike = {
  fileId?: string;
  fileName?: string;
  xLabel?: string;
  xUnit?: string;
  xGroups?: number[][];
  series?: ProcessedSeriesLike[];
  yLabel?: string;
  yUnit?: string;
  originExportPlotCommand?: string;
  originExportSkipDisplayRange?: boolean;
  originExportSkipAxisCommands?: boolean;
  originExportUseCurveYLongNames?: boolean;
  originExportYScaleFactor?: number;
  originExportYUnitLabel?: string;
};

export type DeviceAnalysisOriginExportContentKey =
  | "iv"
  | "metrics"
  | "gm"
  | "gds"
  | "ss"
  | "vth";

type ResolveYScaleFactorForFile = (
  file: ProcessedEntryLike | null | undefined,
) => number;
type ResolveXScaleFactorForFile = (
  file: ProcessedEntryLike | null | undefined,
) => number;
type ResolveYUnitLabelForFile = (
  file: ProcessedEntryLike | null | undefined,
) => string;
type ResolveCurveLabelForSeries = (
  file: ProcessedEntryLike | null | undefined,
  series: ProcessedSeriesLike | null | undefined,
  index: number,
) => string;
type ResolveAxisTitleForFile = (
  file: ProcessedEntryLike | null | undefined,
  axis: "x" | "y",
) => string | null | undefined;
type ResolveYValueForOriginFile = (
  file: ProcessedEntryLike | null | undefined,
  y: number,
) => number;

export type DeviceAnalysisOriginExportMode =
  | "merged"
  | "workbookBooks"
  | "workbookSheets"
  | "separate";

export type DeviceAnalysisOriginImportMode =
  | "new-book"
  | "existing-book-new-sheet";

export type DeviceAnalysisOriginYAxisScaleMode = "linear" | "log";

type DeviceAnalysisOriginCurveEntry = {
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

export type DeviceAnalysisOriginSelectionExport = {
  canvasCount: number;
  columnLayout?: "xy-pairs" | "shared-x" | "grouped-x";
  columnComments?: string[];
  columnDesignations?: string[];
  columnLongNames?: string[];
  columnUnits?: string[];
  csvName: string;
  csvText: string;
  curveCount: number;
  curveLabels: string[];
  fileIds: string[];
  importMode: DeviceAnalysisOriginImportMode;
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
  yScaleMode?: DeviceAnalysisOriginYAxisScaleMode;
  plotCommand?: string;
  skipPlot?: boolean;
  skipDisplayRange?: boolean;
  skipAxisCommands?: boolean;
};

export type DeviceAnalysisOriginExportPlan = {
  mixedYScales: boolean;
  mode: DeviceAnalysisOriginExportMode;
  payloads: DeviceAnalysisOriginSelectionExport[];
  totalCanvasCount: number;
  totalCurveCount: number;
};

const sanitizeDeviceAnalysisFilename = (name: unknown): string =>
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
  if (!raw) return "device analysis";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const ORIGIN_CONTENT_SHEET_BASE_NAMES: Record<DeviceAnalysisOriginExportContentKey, string> = {
  gds: "gds",
  gm: "gm",
  iv: "IV",
  metrics: "Metrics",
  ss: "SS",
  vth: "Vth",
};

const ORIGIN_EXPORT_CONTENT_KEY_SET = new Set<DeviceAnalysisOriginExportContentKey>([
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
  contentKey: DeviceAnalysisOriginExportContentKey,
  index: number,
  total: number,
): string => {
  const base = ORIGIN_CONTENT_SHEET_BASE_NAMES[contentKey] ?? "Data";
  return total <= 1 ? base : `${base} ${index + 1}`;
};

const resolveOriginContentSheetShortName = (
  contentKey: DeviceAnalysisOriginExportContentKey,
  index: number,
  total: number,
): string => {
  const base = ORIGIN_CONTENT_SHEET_BASE_NAMES[contentKey] ?? "Data";
  return total <= 1 ? base : `${base}${index + 1}`;
};

const applyOriginContentSheetName = (
  payload: DeviceAnalysisOriginSelectionExport,
  contentKey: DeviceAnalysisOriginExportContentKey,
  index: number,
  total: number,
  workbookName?: string,
): DeviceAnalysisOriginSelectionExport => ({
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
  payload: DeviceAnalysisOriginSelectionExport,
  sheetName: string,
  sheetShortName: string,
  workbookName?: string,
): DeviceAnalysisOriginSelectionExport => ({
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

export const resolveDeviceAnalysisSeriesLabel = (
  series: ProcessedSeriesLike | null | undefined,
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

const buildPoints = (
  xArr?: number[],
  yArr?: number[],
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

type VthFitResult = {
  branch: "electron" | "hole";
  intercept: number;
  r2: number;
  slope: number;
  vth: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

const toSqrtCurrentPoints = (points: Array<{ x: number; y: number }>) =>
  (Array.isArray(points) ? points : [])
    .map((point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y: Math.sqrt(Math.abs(y)) };
    })
    .filter((point): point is { x: number; y: number } => point !== null);

const linearRegression = (points: Array<{ x: number; y: number }>) => {
  const n = points.length;
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  let sumYY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXX += point.x * point.x;
    sumXY += point.x * point.y;
    sumYY += point.y * point.y;
  }
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const ssTot = sumYY - (sumY * sumY) / n;
  let ssRes = 0;
  for (const point of points) {
    const residual = point.y - (slope * point.x + intercept);
    ssRes += residual * residual;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { intercept, r2, slope };
};

const fitLinear = linearRegression;

const pickVthLinearFit = (
  points: Array<{ x: number; y: number }>,
  branch: "electron" | "hole",
): VthFitResult | null => {
  const sorted = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.y > 0)
    .slice()
    .sort((a, b) => a.x - b.x);
  if (sorted.length < 5) return null;
  const minWindow = Math.min(5, sorted.length);
  const maxWindow = Math.min(16, sorted.length);
  const maxY = Math.max(...sorted.map((point) => point.y));
  let best: (VthFitResult & { score: number }) | null = null;
  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
    for (let start = 0; start <= sorted.length - windowSize; start += 1) {
      const window = sorted.slice(start, start + windowSize);
      const fit = fitLinear(window);
      if (!fit) continue;
      if (branch === "electron" && fit.slope <= 0) continue;
      if (branch === "hole" && fit.slope >= 0) continue;
      const ys = window.map((point) => point.y);
      const ySpan = Math.max(...ys) - Math.min(...ys);
      if (maxY > 0 && ySpan / maxY < 0.12) continue;
      const vth = -fit.intercept / fit.slope;
      if (!Number.isFinite(vth)) continue;
      const x1 = window[0]!.x;
      const x2 = window[window.length - 1]!.x;
      const y1 = fit.slope * x1 + fit.intercept;
      const y2 = fit.slope * x2 + fit.intercept;
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      const score =
        fit.r2 +
        Math.min(0.08, ySpan / Math.max(maxY, 1e-300) * 0.08) +
        windowSize * 0.002;
      if (!best || score > best.score) {
        best = {
          branch,
          intercept: fit.intercept,
          r2: fit.r2,
          score,
          slope: fit.slope,
          vth,
          x1,
          x2,
          y1,
          y2,
        };
      }
    }
  }
  if (!best) return null;
  const { score: _score, ...fit } = best;
  return fit;
};

const computeVthSqrtFits = (points: Array<{ x: number; y: number }>): VthFitResult[] => {
  const sqrtPoints = toSqrtCurrentPoints(points);
  if (sqrtPoints.length < 5) return [];
  const valley = sqrtPoints.reduce(
    (best, point) => point.y < best.y ? point : best,
    sqrtPoints[0]!,
  );
  const holePoints = sqrtPoints.filter((point) => point.x <= valley.x);
  const electronPoints = sqrtPoints.filter((point) => point.x >= valley.x);
  return [
    pickVthLinearFit(holePoints, "hole"),
    pickVthLinearFit(electronPoints, "electron"),
  ].filter((fit): fit is VthFitResult => fit !== null);
};

const dedupeCurveLabels = (
  curveEntries: DeviceAnalysisOriginCurveEntry[],
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

const buildOriginPairsExpr = (
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

const buildDeviceAnalysisOriginPairsExpr = (xyPairCount: unknown): string =>
  buildOriginPairsExpr(xyPairCount, (index) => [index * 2 + 1, index * 2 + 2]);

const buildDeviceAnalysisOriginSharedXPairsExpr = (curveCountRaw: unknown): string =>
  buildOriginPairsExpr(curveCountRaw, (index) => [1, index + 2]);

const buildDeviceAnalysisOriginPairsExprFromPairs = (
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

const buildOriginXGroupKey = (entry: DeviceAnalysisOriginCurveEntry): string =>
  [
    entry.fileId,
    entry.xLongName,
    entry.xUnits,
    entry.rowCount,
    entry.xArr.map(normalizeOriginXValueForKey).join(","),
  ].join("\u0001");

export const isDeviceAnalysisOriginExportMode = (
  value: unknown,
): value is DeviceAnalysisOriginExportMode =>
  value === "merged" ||
  value === "workbookBooks" ||
  value === "workbookSheets" ||
  value === "separate";

const resolveSelectedSeriesForOriginCanvas = (
  file: ProcessedEntryLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined,
): ProcessedSeriesLike[] => {
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
  file: ProcessedEntryLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined,
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): DeviceAnalysisOriginCurveEntry[] => {
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
  const resolveCurveLabel = (series: ProcessedSeriesLike, index: number): string =>
    resolveCurveLabelForSeries(file, series, index);

  return selectedSeries
    .map((series, index) => {
      const groupIndex = Number(series?.groupIndex);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
      if (!xArr || !yArr || rowCount <= 0) return null;
      const scaledYArr =
        yScaleFactor === 1 ? yArr.map((value) => Number(value)) : yArr.map((value) => Number(value) * yScaleFactor);
      const exportYArr = scaledYArr.map((value) =>
        Number.isFinite(value) ? resolveYValueForOriginFile(file, value) : value,
      );
      return {
        canvasLabel,
        fileId: String(file?.fileId ?? canvasLabel),
        label: resolveCurveLabel(series, index),
        rowCount,
        xArr: xScaleFactor === 1 ? xArr : xArr.map((value) => Number(value) * xScaleFactor),
        yArr: exportYArr,
        xLongName,
        xUnits,
        yLongName: useCurveLabelAsYLongName
          ? resolveCurveLabel(series, index)
          : yAxisLongName,
        yUnits,
      };
    })
    .filter((entry): entry is DeviceAnalysisOriginCurveEntry => Boolean(entry));
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
  canvases: ProcessedEntryLike[];
  curveEntries: DeviceAnalysisOriginCurveEntry[];
  csvBase: string;
  importMode?: DeviceAnalysisOriginImportMode;
  sheetName: string;
  workbookName: string;
  xAxisTitle: string;
  yAxisTitle: string;
}): DeviceAnalysisOriginSelectionExport | null => {
  if (!curveEntries.length) return null;
  const xGroups: Array<{
    entries: DeviceAnalysisOriginCurveEntry[];
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
  const rows = new Array<Array<number | string>>(maxRowCount);
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
    csvText: "\uFEFF" + Papa.unparse(rows),
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
      ? buildDeviceAnalysisOriginPairsExprFromPairs(xyPairs)
      : useSharedXLayout
      ? buildDeviceAnalysisOriginSharedXPairsExpr(curveEntries.length)
      : buildDeviceAnalysisOriginPairsExpr(curveEntries.length),
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

export const buildDeviceAnalysisOriginCanvasExport = (
  canvas: ProcessedEntryLike | null | undefined,
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): DeviceAnalysisOriginSelectionExport | null => {
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

  const canvasName = String(canvas?.fileName ?? "device_analysis");
  const csvBase = `${sanitizeDeviceAnalysisFilename(canvasName)
    .replace(/\.csv$/i, "")
    .trim() || "device_analysis"}__selected_curves`;
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

export const buildDeviceAnalysisOriginSelectionExport = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): DeviceAnalysisOriginSelectionExport | null => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
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

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "device_analysis");
  const sanitizedFirstBase = sanitizeDeviceAnalysisFilename(firstCanvasName)
    .replace(/\.csv$/i, "")
    .trim();
  const canvasCount = liveCanvases.length;
  const curveCount = curveEntries.length;
  const csvBase =
    canvasCount === 1
      ? `${sanitizedFirstBase || "device_analysis"}__selected_curves`
      : `${canvasCount}files_${curveCount}curves`;
  const workbookName =
    canvasCount === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "device analysis")
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

const buildDeviceAnalysisOriginWorkbookSheetsExports = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): DeviceAnalysisOriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "device_analysis");
  const sanitizedFirstBase = sanitizeDeviceAnalysisFilename(firstCanvasName)
    .replace(/\.csv$/i, "")
    .trim();
  const workbookName =
    liveCanvases.length === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "device analysis")
      : sanitizeOriginDisplayName(
          `Selected thumbnails ${liveCanvases.length} sheets`,
        );

  return liveCanvases
    .map((canvas): DeviceAnalysisOriginSelectionExport | null => {
      const exportPayload = buildDeviceAnalysisOriginCanvasExport(
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
    .filter((item): item is DeviceAnalysisOriginSelectionExport => Boolean(item));
};

const cloneSeriesWithDerivedY = (
  series: ProcessedSeriesLike,
  y: number[],
): ProcessedSeriesLike => ({
  ...series,
  y,
});

const buildDerivedSeriesList = (
  file: ProcessedEntryLike,
  xGroups: number[][],
  seriesList: ProcessedSeriesLike[],
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
  deriveY: (points: Array<{ x: number; y: number }>) => number[],
  hasUsableY: (values: number[]) => boolean,
): ProcessedSeriesLike[] =>
  seriesList
    .map((series) => {
      const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
      const derivedY = deriveY(points);
      if (!hasUsableY(derivedY)) return null;
      return cloneSeriesWithDerivedY(
        {
          ...series,
          name: resolveCurveLabelForSeries(file, series, 0),
        },
        derivedY,
      );
    })
    .filter((series): series is ProcessedSeriesLike => series !== null);

const hasFiniteValue = (values: number[]): boolean =>
  values.some((value) => Number.isFinite(value));

const hasPositiveFiniteValue = (values: number[]): boolean =>
  values.some((value) => Number.isFinite(value) && value > 0);

const withDerivedOriginFileMetadata = (
  file: ProcessedEntryLike,
  {
    baseName,
    fileSuffix,
    originExportYUnitLabel,
    series,
    yLabel,
    yUnit,
  }: {
    baseName: string;
    fileSuffix: string;
    originExportYUnitLabel: string;
    series: ProcessedSeriesLike[];
    yLabel: string;
    yUnit: string;
  },
): ProcessedEntryLike => ({
  ...file,
  fileName: `${baseName}__${fileSuffix}.csv`,
  series,
  yLabel,
  yUnit,
  originExportUseCurveYLongNames: true,
  originExportSkipDisplayRange: true,
  originExportYScaleFactor: 1,
  originExportYUnitLabel,
});

const buildDerivedCurveFile = (
  file: ProcessedEntryLike,
  contentKey: Exclude<DeviceAnalysisOriginExportContentKey, "iv" | "metrics">,
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
): ProcessedEntryLike | null => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const seriesList = Array.isArray(file?.series) ? file.series : [];
  if (!xGroups.length || !seriesList.length) return null;

  const isTransfer = isTransferLikeDeviceAnalysisFile(file as any);
  const isOutput = isOutputLikeDeviceAnalysisFile(file as any);
  const baseName = String(file?.fileName ?? "device_analysis").replace(/\.csv$/i, "");

  if (contentKey === "gm" || contentKey === "gds") {
    if (contentKey === "gm" && !isTransfer) return null;
    if (contentKey === "gds" && !isOutput) return null;
    const derivativeLabel = contentKey === "gm" ? "gm" : "gds";
    const derivedSeries = buildDerivedSeriesList(
      file,
      xGroups,
      seriesList,
      resolveCurveLabelForSeries,
      (points) => computeCentralDerivative(points)
        .map((point: any) => (isFiniteNumber(point?.y) ? point.y : NaN)),
      hasFiniteValue,
    );
    if (!derivedSeries.length) return null;
    const denom = String(file?.xUnit ?? "V").trim() || "V";
    return withDerivedOriginFileMetadata(file, {
      baseName,
      fileSuffix: derivativeLabel,
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
      (points) => points.map((point) =>
        isFiniteNumber(point?.y) ? Math.abs(point.y) : NaN,
      ),
      hasPositiveFiniteValue,
    );
    if (!derivedSeries.length) return null;
    return withDerivedOriginFileMetadata(file, {
      baseName,
      fileSuffix: "SS",
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
      (points) => points.map((point) =>
        isFiniteNumber(point?.y) ? Math.sqrt(Math.abs(point.y)) : NaN,
      ),
      hasFiniteValue,
    );
    if (!derivedSeries.length) return null;
    return withDerivedOriginFileMetadata(file, {
      baseName,
      fileSuffix: "Vth",
      series: derivedSeries,
      yLabel: "sqrt(|I|)",
      yUnit: "sqrt(A)",
      originExportYUnitLabel: "sqrt(A)",
    });
  }

  return null;
};

const buildMetricsWorksheetExports = (
  selectedCanvases: ProcessedEntryLike[],
  selectedSeriesIdsByFile: Record<string, string[] | undefined> | null | undefined,
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries,
): DeviceAnalysisOriginSelectionExport[] => {
  return selectedCanvases
    .map((file): DeviceAnalysisOriginSelectionExport | null => {
      const rows: Array<Record<string, number | string>> = [];
    const supportsTransfer = isTransferLikeDeviceAnalysisFile(file as any);
    const supportsOutput = isOutputLikeDeviceAnalysisFile(file as any);
    const fields = supportsTransfer ? TRANSFER_METRICS_FIELDS : supportsOutput ? OUTPUT_METRICS_FIELDS : TRANSFER_METRICS_FIELDS;
    const selectedSeries = resolveSelectedSeriesForOriginCanvas(
      file,
      selectedSeriesIdsByFile,
    );
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    for (const [index, series] of selectedSeries.entries()) {
      const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
      if (!points.length) continue;
      const derivative = computeCentralDerivative(points);
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
        ? resolveAutoSsSelection(computeSubthresholdSwingFitAuto(points) as any)
        : null;
      const ssFit = ssSelection?.fit as any;
      const baseMetrics = computeBaseCurrentMetrics({
        points,
        sourceFile: file,
      } as any) as any;
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
      const csvText = "\uFEFF" + Papa.unparse(csvRows);
      const fileName = sanitizeDeviceAnalysisFilename(file?.fileName ?? "device_analysis")
        .replace(/\.csv$/i, "")
        .trim();
      const workbookName = sanitizeOriginDisplayName(fileName || "device analysis");
      const comments = fields.map((_, index) =>
        index === 0 ? String(file?.fileName ?? "") : "",
      );
      return {
        canvasCount: 1,
        columnLayout: "xy-pairs",
        csvName: `${fileName || "device_analysis"}__metrics.csv`,
        csvText,
        curveCount: 0,
        curveLabels: [],
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
    .filter((payload): payload is DeviceAnalysisOriginSelectionExport => payload !== null);
};

const normalizeOriginExportContentKeys = (
  contentKeys?: readonly DeviceAnalysisOriginExportContentKey[] | null,
): DeviceAnalysisOriginExportContentKey[] => {
  const keys = (Array.isArray(contentKeys) ? contentKeys : ["iv"])
    .filter((key): key is DeviceAnalysisOriginExportContentKey => ORIGIN_EXPORT_CONTENT_KEY_SET.has(key));
  return keys.length ? Array.from(new Set(keys)) : ["iv"];
};

const buildIvOriginExportGroups = (
  canvases: ProcessedEntryLike[],
): Array<{
  canvases: ProcessedEntryLike[];
  sheetName: string;
  sheetShortName: string;
}> => {
  const transferCanvases = canvases.filter((canvas) =>
    isTransferLikeDeviceAnalysisFile(canvas as any),
  );
  const outputCanvases = canvases.filter((canvas) =>
    isOutputLikeDeviceAnalysisFile(canvas as any),
  );
  const groupedIds = new Set(
    [...transferCanvases, ...outputCanvases].map((canvas) => canvas),
  );
  const otherCanvases = canvases.filter((canvas) => !groupedIds.has(canvas));
  const groups: Array<{
    canvases: ProcessedEntryLike[];
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

export const buildDeviceAnalysisOriginExportsByMode = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  exportMode: DeviceAnalysisOriginExportMode = "merged",
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
): DeviceAnalysisOriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  if (exportMode === "workbookSheets") {
    return buildDeviceAnalysisOriginWorkbookSheetsExports(
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
        buildDeviceAnalysisOriginCanvasExport(
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
      .filter((item): item is DeviceAnalysisOriginSelectionExport => Boolean(item));
  }

  const merged = buildDeviceAnalysisOriginSelectionExport(
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
): DeviceAnalysisOriginYAxisScaleMode =>
  String(value ?? "").trim().toLowerCase() === "log" ? "log" : "linear";

const appendOriginScaleSuffix = (
  value: unknown,
  scaleMode: DeviceAnalysisOriginYAxisScaleMode,
): string => {
  const base = sanitizeOriginDisplayName(value, { max: 140 });
  const suffix = scaleMode === "log" ? "Log" : "Linear";
  return sanitizeOriginDisplayName(`${base || "Merged curves"} ${suffix}`, {
    max: 160,
  });
};

export const buildDeviceAnalysisOriginExportPlan = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  exportMode: DeviceAnalysisOriginExportMode = "merged",
  resolveYScaleForFile: (
    file: ProcessedEntryLike | null | undefined,
  ) => DeviceAnalysisOriginYAxisScaleMode = () => "linear",
  resolveXScaleFactorForFile: ResolveXScaleFactorForFile = () => 1,
  resolveYScaleFactorForFile: ResolveYScaleFactorForFile = () => 1,
  resolveYUnitLabelForFile: ResolveYUnitLabelForFile = (source) =>
    String(source?.yUnit ?? "").trim(),
  resolveCurveLabelForSeries: ResolveCurveLabelForSeries = (_file, series, index) =>
    resolveDeviceAnalysisSeriesLabel(series, index),
  resolveAxisTitleForFile: ResolveAxisTitleForFile = () => "",
  resolveYValueForOriginFile: ResolveYValueForOriginFile = (_file, y) => y,
  contentKeys: readonly DeviceAnalysisOriginExportContentKey[] = ["iv"],
): DeviceAnalysisOriginExportPlan => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
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
    ivGroups.length > 1
  ) {
    const entries: Array<{
      contentKey: DeviceAnalysisOriginExportContentKey;
      payload: DeviceAnalysisOriginSelectionExport;
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
          const nextPayloads = buildDeviceAnalysisOriginExportPlan(
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
        .filter((canvas): canvas is ProcessedEntryLike => canvas !== null);
      if (!derivedCanvases.length) continue;
      const nextPayloads = buildDeviceAnalysisOriginExportPlan(
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
    }, new Map<DeviceAnalysisOriginExportContentKey, number>());
    const contentSeen = new Map<DeviceAnalysisOriginExportContentKey, number>();
    const contentWorkbookName =
      liveCanvases.length === 1
        ? "Device Analysis"
        : `Device Analysis ${liveCanvases.length} files`;
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
    const payloads = buildDeviceAnalysisOriginExportsByMode(
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
    DeviceAnalysisOriginYAxisScaleMode,
    ProcessedEntryLike[]
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
    const payloads = buildDeviceAnalysisOriginExportsByMode(
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

  const firstCanvasName = String(liveCanvases[0]?.fileName ?? "device_analysis");
  const workbookName = sanitizeOriginDisplayName(
    `Mixed-scale export ${sanitizeDeviceAnalysisFilename(firstCanvasName).replace(/\.csv$/i, "").trim() || "device analysis"}`,
  );
  const payloads = Array.from(groupedCanvases.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scaleMode, canvases]): DeviceAnalysisOriginSelectionExport | null => {
      const payload = buildDeviceAnalysisOriginSelectionExport(
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
        csvName: `${String(payload.csvName || "device_analysis").replace(/\.csv$/i, "")}__${suffix}.csv`,
        sheetName: appendOriginScaleSuffix(payload.sheetName, scaleMode),
        workbookName,
        yScaleMode: scaleMode,
      };
    })
    .filter((payload): payload is DeviceAnalysisOriginSelectionExport => payload !== null);

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
