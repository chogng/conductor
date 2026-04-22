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
  xGroups?: number[][];
  series?: ProcessedSeriesLike[];
};

export type DeviceAnalysisOriginExportMode =
  | "merged"
  | "workbookBooks"
  | "workbookSheets"
  | "separate";

export type DeviceAnalysisOriginImportMode =
  | "new-book"
  | "existing-book-new-sheet";

type DeviceAnalysisOriginCurveEntry = {
  canvasLabel: string;
  label: string;
  rowCount: number;
  xArr: number[];
  yArr: number[];
};

export type DeviceAnalysisOriginSelectionExport = {
  canvasCount: number;
  csvName: string;
  csvText: string;
  curveCount: number;
  curveLabels: string[];
  fileIds: string[];
  importMode: DeviceAnalysisOriginImportMode;
  sheetName: string;
  workbookName: string;
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

const resolveCanvasDisplayName = (
  value: unknown,
  { max = 80 }: { max?: number } = {},
): string =>
  sanitizeOriginDisplayName(String(value ?? "").replace(/\.csv$/i, ""), { max });

const resolveSeriesDisplayName = (
  series: ProcessedSeriesLike | null | undefined,
  index: number,
): string => {
  const legendValue = String(series?.legendValue ?? "").trim();
  if (legendValue) return legendValue;

  const name = String(series?.name ?? "").trim();
  if (name) return name;

  return `Curve ${index + 1}`;
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
): DeviceAnalysisOriginCurveEntry[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const selectedSeries = resolveSelectedSeriesForOriginCanvas(
    file,
    selectedSeriesIdsByFile,
  );
  const canvasLabel = resolveCanvasDisplayName(file?.fileName ?? file?.fileId);

  return selectedSeries
    .map((series, index) => {
      const groupIndex = Number(series?.groupIndex);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const rowCount = Math.min(xArr?.length ?? 0, yArr?.length ?? 0);
      if (!xArr || !yArr || rowCount <= 0) return null;
      return {
        canvasLabel,
        label: resolveSeriesDisplayName(series, index),
        rowCount,
        xArr,
        yArr,
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
}: {
  canvases: ProcessedEntryLike[];
  curveEntries: DeviceAnalysisOriginCurveEntry[];
  csvBase: string;
  importMode?: DeviceAnalysisOriginImportMode;
  sheetName: string;
  workbookName: string;
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
  const curveLabels = dedupeCurveLabels(curveEntries);

  return {
    canvasCount: canvases.length,
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
    sheetName: sanitizeOriginDisplayName(canvasName.replace(/\.csv$/i, "")),
    workbookName: sanitizeOriginDisplayName(canvasName.replace(/\.csv$/i, "")),
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
  const workbookName =
    canvasCount === 1
      ? sanitizeOriginDisplayName(sanitizedFirstBase || "device analysis")
      : sanitizeOriginDisplayName(
          `Merged curves ${canvasCount} files ${curveCount} curves`,
        );

  return buildWorksheetExport({
    canvases: liveCanvases,
    curveEntries,
    csvBase,
    sheetName: workbookName,
    workbookName,
  });
};

const buildDeviceAnalysisOriginWorkbookSheetsExports = (
  selectedCanvases: ProcessedEntryLike[] = [],
  selectedSeriesIdsByFile:
    | Record<string, string[] | undefined>
    | null
    | undefined = {},
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
): DeviceAnalysisOriginSelectionExport[] => {
  const liveCanvases = (Array.isArray(selectedCanvases) ? selectedCanvases : []).filter(
    (file): file is ProcessedEntryLike => Boolean(file),
  );
  if (!liveCanvases.length) return [];

  if (exportMode === "workbookSheets") {
    return buildDeviceAnalysisOriginWorkbookSheetsExports(
      liveCanvases,
      selectedSeriesIdsByFile,
    );
  }

  if (exportMode === "workbookBooks" || exportMode === "separate") {
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
