import Papa from "papaparse";
import {
  classifySsFit,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInIdWindow,
  computeSubthresholdSwingFitInRange,
  resolveAutoSsSelection,
} from "./analysisMath";
import { getExcelColumnLabel } from "../../shared/lib/deviceAnalysisUtils";
import type { ProcessedEntry, ProcessedSeries } from "../../shared/lib/sharedTypes";

type SsIdWindow = {
  low?: number | string;
  high?: number | string;
};

type SsManualRangeEntry = {
  x1?: number;
  x2?: number;
};

type SsManualRanges = Record<string, Record<string, SsManualRangeEntry>>;

type SsFit = Partial<{
  ok: boolean;
  reason: string;
  ss: number;
  n: number;
  r2: number;
  decadeSpan: number;
  x1: number;
  x2: number;
}>;

type SsClassification = Partial<{
  ss_confidence: string;
  ss_ok: boolean;
  ss_reason: string;
}>;

export const sanitizeDeviceAnalysisFilename = (name: unknown): string =>
  String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

export const triggerDeviceAnalysisBlobDownload = (
  filename: string,
  blob: Blob,
): void => {
  const url = URL.createObjectURL(blob);
  const downloadAnchorNode = document.createElement("a");

  downloadAnchorNode.setAttribute("href", url);
  downloadAnchorNode.setAttribute("download", filename);

  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();

  URL.revokeObjectURL(url);
};

export const createUniqueDeviceAnalysisFileNameResolver = (): ((
  rawName: unknown,
) => string) => {
  const usedNames = new Map<string, number>();

  return (rawName: unknown) => {
    const name = String(rawName || "export.csv");
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);

    if (count === 0) return name;

    const dotIndex = name.lastIndexOf(".");
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : "";

    return `${base} (${count + 1})${ext}`;
  };
};

export const buildDeviceAnalysisCsvExports = (
  processedData: ProcessedEntry[] = [],
): Array<{
  csvText: string;
  filename: string;
  xyPairCount: number;
}> => {
  const makeUniqueName = createUniqueDeviceAnalysisFileNameResolver();
  const exports: Array<{ csvText: string; filename: string; xyPairCount: number }> =
    [];

  for (const file of processedData) {
    const originalFileName = file?.fileName ?? "device_analysis";
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    const seriesList = Array.isArray(file?.series) ? file.series : [];

    const seriesByYCol = new Map<number, ProcessedSeries[]>();
    for (const series of seriesList) {
      const yCol = Number(series?.yCol);
      if (!Number.isInteger(yCol)) continue;

      const groupedSeries = seriesByYCol.get(yCol) ?? [];
      groupedSeries.push(series);

      if (!seriesByYCol.has(yCol)) {
        seriesByYCol.set(yCol, groupedSeries);
      }
    }

    for (const [yCol, groupedSeries] of seriesByYCol.entries()) {
      const groups = groupedSeries
        .slice()
        .sort(
          (left, right) => Number(left?.groupIndex) - Number(right?.groupIndex),
        )
        .map((series) => {
          const groupIndex = Number(series?.groupIndex);
          const xArr = xGroups[groupIndex];
          const yArr = series?.y;

          if (!xArr || !yArr) return null;
          return { groupIndex, xArr, yArr };
        })
        .filter(
          (
            group,
          ): group is { groupIndex: number; xArr: number[]; yArr: number[] } =>
            Boolean(group),
        );

      if (!groups.length) continue;

      const rowCount = Math.max(
        ...groups.map((group) =>
          Math.min(group.xArr.length ?? 0, group.yArr.length ?? 0),
        ),
      );
      const rows: Array<Array<number | string>> = new Array(rowCount);

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row: Array<number | string> = [];
        for (const group of groups) {
          row.push(group.xArr[rowIndex] ?? "", group.yArr[rowIndex] ?? "");
        }
        rows[rowIndex] = row;
      }

      const csvText = Papa.unparse(rows);
      const base = sanitizeDeviceAnalysisFilename(originalFileName).replace(
        /\.csv$/i,
        "",
      );
      const yLabel = getExcelColumnLabel(yCol);
      const filename =
        seriesByYCol.size > 1 ? `${base}_${yLabel}.csv` : `${base}.csv`;

      exports.push({
        csvText,
        filename: makeUniqueName(filename),
        xyPairCount: groups.length,
      });
    }
  }

  return exports;
};

const buildPoints = (xArr?: number[], yArr?: number[]): Array<{ x: number; y: number }> => {
  if (!xArr || !yArr) return [];

  const count = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (count <= 0) return [];

  const points = new Array<{ x: number; y: number }>(count);
  for (let index = 0; index < count; index += 1) {
    points[index] = { x: xArr[index], y: yArr[index] };
  }

  return points;
};

export const buildDeviceAnalysisSsMetricsCsv = ({
  processedData = [],
  ssIdWindow,
  ssManualRanges,
  ssMethod,
}: {
  processedData?: ProcessedEntry[];
  ssIdWindow?: unknown;
  ssManualRanges?: unknown;
  ssMethod?: unknown;
}): string => {
  const fields = [
    "ss_conf_version",
    "file_id",
    "file_name",
    "series_id",
    "series_name",
    "group_index",
    "y_col",
    "ss_method",
    "ss",
    "ss_ok",
    "ss_confidence",
    "ss_reason",
    "ss_x1",
    "ss_x2",
    "ss_r2",
    "ss_span_dec",
    "ss_n",
    "ss_iLow",
    "ss_iHigh",
    "ss_range_source",
  ];

  const rows: Array<Record<string, string | number>> = [];
  const confVersion = "ssfit_v1";
  const idWindow =
    ssIdWindow && typeof ssIdWindow === "object"
      ? (ssIdWindow as SsIdWindow)
      : {};
  const manualRanges =
    ssManualRanges && typeof ssManualRanges === "object"
      ? (ssManualRanges as SsManualRanges)
      : {};
  const methodDefault = String(ssMethod || "auto");
  const idLow = Number(idWindow?.low);
  const idHigh = Number(idWindow?.high);
  const idWindowRatio =
    Number.isFinite(idLow) &&
    Number.isFinite(idHigh) &&
    idLow > 0 &&
    idHigh > 0
      ? Math.max(idLow, idHigh) / Math.min(idLow, idHigh)
      : null;

  for (const file of processedData) {
    const fileId = file?.fileId ?? "";
    const fileName = file?.fileName ?? "";
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    const seriesList = Array.isArray(file?.series) ? file.series : [];

    for (const series of seriesList) {
      const seriesId = series?.id ?? "";
      const seriesName = series?.name ?? "";
      const groupIndex = Number(series?.groupIndex);
      const yCol = Number(series?.yCol);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const points = buildPoints(xArr, yArr);

      const method =
        methodDefault === "auto" ||
        methodDefault === "manual" ||
        methodDefault === "idWindow" ||
        methodDefault === "legacy"
          ? methodDefault
          : "auto";

      let fit: SsFit = { ok: false, reason: "common.invalid_points" };
      let cls: SsClassification = {
        ss_confidence: "fail",
        ss_ok: false,
        ss_reason: "common.invalid_points",
      };
      let rangeSource = "";

      if (method === "auto") {
        const autoFit = computeSubthresholdSwingFitAuto(points) as
          | Partial<{ strict: SsFit; suggested: SsFit }>
          | null
          | undefined;
        const autoSelection = resolveAutoSsSelection(autoFit);
        fit = autoSelection.fit as SsFit;
        cls = autoSelection.classification as SsClassification;
        rangeSource = autoSelection.source ?? "";
      } else if (method === "manual") {
        const autoFit = computeSubthresholdSwingFitAuto(points) as
          | Partial<{ strict: SsFit; suggested: SsFit }>
          | null
          | undefined;
        const storedRange =
          fileId && seriesId ? manualRanges?.[fileId]?.[seriesId] : null;
        const initialRange = storedRange
          ? { x1: storedRange.x1, x2: storedRange.x2, source: "manual" as const }
          : autoFit?.strict?.ok
            ? {
                source: "strict" as const,
                x1: autoFit.strict.x1,
                x2: autoFit.strict.x2,
              }
            : autoFit?.suggested?.ok
              ? {
                  source: "suggested" as const,
                  x1: autoFit.suggested.x1,
                  x2: autoFit.suggested.x2,
                }
              : null;

        rangeSource = initialRange?.source ?? "";
        fit = initialRange
          ? (computeSubthresholdSwingFitInRange(
              points,
              initialRange.x1,
              initialRange.x2,
            ) as SsFit)
          : { ok: false, reason: "manual.range_outside_domain" };
        cls = classifySsFit("manual", fit) as SsClassification;
      } else if (method === "idWindow") {
        fit = computeSubthresholdSwingFitInIdWindow(points, idLow, idHigh) as SsFit;
        cls = classifySsFit("idWindow", fit, {
          idWindowRatio,
        } as Record<string, unknown>) as SsClassification;
      } else if (method === "legacy") {
        const diagnostics = computeSubthresholdSwing(points) as
          | Array<{ y?: number }>
          | null
          | undefined;
        let minValue = Number.POSITIVE_INFINITY;

        for (const point of diagnostics ?? []) {
          const nextValue = Number(point?.y);
          if (!Number.isFinite(nextValue)) continue;
          if (nextValue > 0 && nextValue < minValue) minValue = nextValue;
        }

        fit = Number.isFinite(minValue)
          ? { ok: true, reason: "ok", ss: minValue }
          : { ok: false, reason: "common.not_enough_points" };
        cls = classifySsFit("legacy", fit) as SsClassification;
      }

      const ssOk = Boolean(cls?.ss_ok);
      const ssValue = ssOk && Number.isFinite(fit?.ss) ? (fit.ss as number) : "";

      rows.push({
        file_id: fileId,
        file_name: fileName,
        group_index: Number.isFinite(groupIndex) ? groupIndex : "",
        series_id: seriesId,
        series_name: seriesName,
        ss: ssValue,
        ss_conf_version: confVersion,
        ss_confidence: cls?.ss_confidence ?? "fail",
        ss_iHigh:
          method === "idWindow" && Number.isFinite(idHigh) ? idHigh : "",
        ss_iLow:
          method === "idWindow" && Number.isFinite(idLow) ? idLow : "",
        ss_method: method,
        ss_n: ssOk && Number.isFinite(fit?.n) ? (fit.n as number) : "",
        ss_ok: ssOk ? "true" : "false",
        ss_r2: ssOk && Number.isFinite(fit?.r2) ? (fit.r2 as number) : "",
        ss_range_source: rangeSource,
        ss_reason: cls?.ss_reason ?? fit?.reason ?? "common.invalid_points",
        ss_span_dec:
          ssOk && Number.isFinite(fit?.decadeSpan) ? (fit.decadeSpan as number) : "",
        ss_x1: ssOk && Number.isFinite(fit?.x1) ? (fit.x1 as number) : "",
        ss_x2: ssOk && Number.isFinite(fit?.x2) ? (fit.x2 as number) : "",
        y_col: Number.isFinite(yCol) ? yCol : "",
      });
    }
  }

  const data = rows.map((row) => fields.map((field) => row?.[field] ?? ""));
  return Papa.unparse({ fields, data });
};

export const buildDeviceAnalysisOriginPairsExpr = (xyPairCount: unknown): string => {
  const pairs: string[] = [];
  const count = Math.max(1, Number(xyPairCount) || 1);

  for (let index = 0; index < count; index += 1) {
    pairs.push(`(${index * 2 + 1},${index * 2 + 2})`);
  }

  return `(${pairs.join(",")})`;
};

export const buildDeviceAnalysisOriginOgsScript = (
  csvFileName: unknown,
  xyPairCount: unknown,
  xyPairsExprOverride?: unknown,
): string => {
  const normalizedPairsExpr =
    typeof xyPairsExprOverride === "string" ? xyPairsExprOverride.trim() : "";
  const pairsExpr = normalizedPairsExpr || buildDeviceAnalysisOriginPairsExpr(xyPairCount);
  const safeCsv = String(csvFileName || "data.csv").replace(/"/g, "");
  const ogsFileName = safeCsv.replace(/\.csv$/i, ".ogs");

  return `[Main]
// Auto plot exported Device Analysis CSV in Origin
// Usage:
//   1) Put CSV and this OGS in the same folder, set Origin current folder to it, then run:
//        run.section("${ogsFileName}", Main)
//   2) Or pass CSV full path as %1:
//        run.section("${ogsFileName}", Main, "C:\\\\path\\\\${safeCsv}")

string csv$ = "%1";
if(csv$ == "")
{
    csv$ = "${safeCsv}";
}

// If CSV not found (exist returns -1), prompt user to select a CSV file.
if(exist(csv$) < 0)
{
    dlgfile group:=*.csv;
    csv$ = fname$;
}

newbook;
impCSV fname:=csv$;

// Plot XY XY pairs: (1,2) (3,4) ...
plotxy iy:=${pairsExpr} plot:=202;
`;
};

export const DEVICE_ANALYSIS_ORIGIN_README = `Device Analysis -> Origin package

Files:
- *.csv: exported data columns (no header row). Layout can be x1,y1,x2,y2,... or x,y1,y2,...
- *.ogs: Origin LabTalk script to import CSV and plot automatically

How to use (recommended):
1) Unzip this package to a folder.
2) Open Origin.
3) (Optional) Set Origin current folder to the unzip folder (Command Window: cd "path")
4) Run the script (Script Window):
   run.section("your_file.ogs", Main)
   - If the CSV file is not found, Origin will prompt you to select it.

Note:
- Plot is created with plotxy plot:=202 (grouped line+symbol) using XY XY pairs.
`;
