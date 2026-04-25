import Papa from "papaparse";

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
};

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
  columnLayout?: "xy-pairs" | "shared-x";
  csvName: string;
  csvText: string;
  curveCount: number;
  curveLabels: string[];
  fileIds: string[];
  importMode: DeviceAnalysisOriginImportMode;
  sheetName: string;
  workbookName: string;
  xAxisTitle: string;
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
};

export type DeviceAnalysisOriginExportPlan = {
  mixedYScales: boolean;
  mode: DeviceAnalysisOriginExportMode;
  payloads: DeviceAnalysisOriginSelectionExport[];
  totalCanvasCount: number;
  totalCurveCount: number;
};

const ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT = 50;
const ORIGIN_LOG_ROBUST_LOW_QUANTILE = 0.05;

const sanitizeDeviceAnalysisFilename = (name: unknown): string =>
  String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeOriginDisplayName = (
  name: unknown,
  { max = 180 }: { max?: number } = {},
): string => {
  const raw = String(name || "")
    .replace(/[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "device analysis";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

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

const computeSortedQuantile = (
  sortedValues: number[],
  qRaw: number,
): number | null => {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const q = Number.isFinite(qRaw) ? Math.min(1, Math.max(0, qRaw)) : 0;
  const idx = Math.floor((sortedValues.length - 1) * q);
  const safeIdx = Math.min(sortedValues.length - 1, Math.max(0, idx));
  const value = Number(sortedValues[safeIdx]);
  return Number.isFinite(value) ? value : null;
};

const resolveOriginLogPositiveMinForRange = (
  positiveValues: number[],
  rawMin: number,
): number => {
  if (
    !Array.isArray(positiveValues) ||
    positiveValues.length < ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT
  ) {
    return rawMin;
  }

  const sorted = positiveValues
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice()
    .sort((a, b) => a - b);
  if (!sorted.length) return rawMin;

  const quantileValue = computeSortedQuantile(
    sorted,
    ORIGIN_LOG_ROBUST_LOW_QUANTILE,
  );
  if (quantileValue === null || !Number.isFinite(quantileValue) || !(quantileValue > 0)) {
    return rawMin;
  }

  return Math.max(rawMin, quantileValue);
};

const buildDeviceAnalysisOriginPairsExpr = (xyPairCount: unknown): string => {
  const pairs: string[] = [];
  const count = Math.max(1, Number(xyPairCount) || 1);

  for (let index = 0; index < count; index += 1) {
    pairs.push(`(${index * 2 + 1},${index * 2 + 2})`);
  }

  return `(${pairs.join(",")})`;
};

const buildDeviceAnalysisOriginSharedXPairsExpr = (curveCountRaw: unknown): string => {
  const pairs: string[] = [];
  const count = Math.max(1, Number(curveCountRaw) || 1);

  for (let index = 0; index < count; index += 1) {
    pairs.push(`(1,${index + 2})`);
  }

  return `(${pairs.join(",")})`;
};

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
  const yScaleFactor =
    Number.isFinite(rawYScaleFactor) && rawYScaleFactor > 0 ? rawYScaleFactor : 1;
  const xLongName =
    stripAxisUnitSuffix(resolveAxisTitleForFile(file, "x")) ||
    stripAxisUnitSuffix(file?.xLabel) ||
    "X";
  const xUnits = String(file?.xUnit ?? "").trim();
  const yAxisLongName =
    stripAxisUnitSuffix(resolveAxisTitleForFile(file, "y")) ||
    stripAxisUnitSuffix(file?.yLabel) ||
    "Y";
  const yUnits = String(resolveYUnitLabelForFile(file) ?? "").trim();
  const useCurveLabelAsYLongName = selectedSeries.length > 1;
  const resolveCurveLabel = (series: ProcessedSeriesLike, index: number): string =>
    resolveCurveLabelForSeries(file, series, index);

  return selectedSeries
    .map((series, index) => {
      const groupIndex = Number(series?.groupIndex);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
      if (!xArr || !yArr || rowCount <= 0) return null;
      return {
        canvasLabel,
        label: resolveCurveLabel(series, index),
        rowCount,
        xArr: xScaleFactor === 1 ? xArr : xArr.map((value) => Number(value) * xScaleFactor),
        yArr: yScaleFactor === 1 ? yArr : yArr.map((value) => Number(value) * yScaleFactor),
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
  const useSharedXLayout = canvases.length === 1 && curveEntries.length > 1;

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
  const rows = new Array<Array<number | string>>(maxRowCount);
  for (let rowIndex = 0; rowIndex < maxRowCount; rowIndex += 1) {
    const row: Array<number | string> = [];
    if (useSharedXLayout) {
      const sharedXEntry = curveEntries[0];
      row.push(rowIndex < sharedXEntry.rowCount ? (sharedXEntry.xArr[rowIndex] ?? "") : "");
      for (const entry of curveEntries) {
        row.push(rowIndex < entry.rowCount ? (entry.yArr[rowIndex] ?? "") : "");
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
    columnLayout: useSharedXLayout ? "shared-x" : "xy-pairs",
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
    xColumnLongNames: useSharedXLayout
      ? [sharedXEntry.xLongName]
      : curveEntries.map((entry) => entry.xLongName),
    xColumnUnits: useSharedXLayout
      ? [sharedXEntry.xUnits]
      : curveEntries.map((entry) => entry.xUnits),
    xMax: Number.isFinite(xMax) ? xMax : null,
    xMin: Number.isFinite(xMin) ? xMin : null,
    xyPairCount: curveEntries.length,
    xyPairs: useSharedXLayout
      ? buildDeviceAnalysisOriginSharedXPairsExpr(curveEntries.length)
      : buildDeviceAnalysisOriginPairsExpr(curveEntries.length),
    yAxisTitle,
    yColumnLongNames: curveEntries.map((entry) => entry.yLongName),
    yColumnUnits: curveEntries.map((entry) => entry.yUnits),
    yLinearMax: Number.isFinite(yLinearMax) ? yLinearMax : null,
    yLinearMin: Number.isFinite(yLinearMin) ? yLinearMin : null,
    yPositiveMax: Number.isFinite(yPositiveMax) ? yPositiveMax : null,
    yPositiveMin: resolvedPositiveMin,
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
