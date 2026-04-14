import Papa from "papaparse";

type ProcessedSeriesLike = {
  id?: string;
  groupIndex?: number;
  y?: number[];
};

type ProcessedEntryLike = {
  fileId?: string;
  fileName?: string;
  xGroups?: number[][];
  series?: ProcessedSeriesLike[];
};

export type DeviceAnalysisOriginExportMode = "merged" | "separate";

type DeviceAnalysisOriginCurveEntry = {
  rowCount: number;
  xArr: number[];
  yArr: number[];
};

export type DeviceAnalysisOriginSelectionExport = {
  canvasCount: number;
  csvName: string;
  csvText: string;
  curveCount: number;
  fileIds: string[];
  seriesName: string;
  xMax: number | null;
  xMin: number | null;
  xyPairCount: number;
  xyPairs: string;
  yLinearMax: number | null;
  yLinearMin: number | null;
  yPositiveMax: number | null;
  yPositiveMin: number | null;
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

export const isDeviceAnalysisOriginExportMode = (
  value: unknown,
): value is DeviceAnalysisOriginExportMode =>
  value === "merged" || value === "separate";

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
): DeviceAnalysisOriginCurveEntry[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const selectedSeries = resolveSelectedSeriesForOriginCanvas(
    file,
    selectedSeriesIdsByFile,
  );

  return selectedSeries
    .map((series) => {
      const groupIndex = Number(series?.groupIndex);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
      if (!xArr || !yArr || rowCount <= 0) return null;
      return { rowCount, xArr, yArr };
    })
    .filter((entry): entry is DeviceAnalysisOriginCurveEntry => Boolean(entry));
};

const buildWorksheetExport = ({
  canvases,
  curveEntries,
  csvBase,
  seriesName,
}: {
  canvases: ProcessedEntryLike[];
  curveEntries: DeviceAnalysisOriginCurveEntry[];
  csvBase: string;
  seriesName: string;
}): DeviceAnalysisOriginSelectionExport | null => {
  if (!curveEntries.length) return null;

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
    for (const entry of curveEntries) {
      row.push(
        rowIndex < entry.rowCount ? (entry.xArr[rowIndex] ?? "") : "",
        rowIndex < entry.rowCount ? (entry.yArr[rowIndex] ?? "") : "",
      );
    }
    rows[rowIndex] = row;
  }

  const resolvedPositiveMin = Number.isFinite(yPositiveMin)
    ? resolveOriginLogPositiveMinForRange(yPositiveValues, yPositiveMin)
    : null;

  return {
    canvasCount: canvases.length,
    csvName: `${csvBase}.csv`,
    csvText: "\uFEFF" + Papa.unparse(rows),
    curveCount: curveEntries.length,
    fileIds: canvases
      .map((canvas) => String(canvas?.fileId ?? ""))
      .filter(Boolean),
    seriesName,
    xMax: Number.isFinite(xMax) ? xMax : null,
    xMin: Number.isFinite(xMin) ? xMin : null,
    xyPairCount: curveEntries.length,
    xyPairs: buildDeviceAnalysisOriginPairsExpr(curveEntries.length),
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
): DeviceAnalysisOriginSelectionExport | null => {
  if (!canvas) return null;

  const curveEntries = buildOriginCurveEntriesForCanvas(
    canvas,
    selectedSeriesIdsByFile,
  );
  if (!curveEntries.length) return null;

  const canvasName = String(canvas?.fileName ?? "device_analysis");
  const csvBase = `${sanitizeDeviceAnalysisFilename(canvasName)
    .replace(/\.csv$/i, "")
    .trim() || "device_analysis"}__selected_curves`;

  return buildWorksheetExport({
    canvases: [canvas],
    curveEntries,
    csvBase,
    seriesName: sanitizeOriginDisplayName(canvasName.replace(/\.csv$/i, "")),
  });
};

export const buildDeviceAnalysisOriginSelectionExport = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
): DeviceAnalysisOriginSelectionExport | null => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
  );
  if (!liveCanvases.length) return null;

  const curveEntries = liveCanvases.flatMap((file) =>
    buildOriginCurveEntriesForCanvas(file, selectedSeriesIdsByFile),
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
      : `device_analysis__merged_${canvasCount}files_${curveCount}curves`;
  const seriesName =
    canvasCount === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "device analysis")
      : sanitizeOriginDisplayName(
          `Merged curves ${canvasCount} files ${curveCount} curves`,
        );

  return buildWorksheetExport({
    canvases: liveCanvases,
    curveEntries,
    csvBase,
    seriesName,
  });
};

export const buildDeviceAnalysisOriginExportsByMode = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
  exportMode: DeviceAnalysisOriginExportMode = "merged",
): DeviceAnalysisOriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  if (exportMode === "separate") {
    return liveCanvases
      .map((canvas) =>
        buildDeviceAnalysisOriginCanvasExport(canvas, selectedSeriesIdsByFile),
      )
      .filter((item): item is DeviceAnalysisOriginSelectionExport => Boolean(item));
  }

  const merged = buildDeviceAnalysisOriginSelectionExport(
    liveCanvases,
    selectedSeriesIdsByFile,
  );
  return merged ? [merged] : [];
};
