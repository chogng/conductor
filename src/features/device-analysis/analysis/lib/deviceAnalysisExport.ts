import Papa from "papaparse";
import {
  classifySsFit,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInRange,
  resolveAutoSsSelection,
} from "./analysisMath.ts";
import { isTransferLikeDeviceAnalysisFile } from "./deviceAnalysisMetrics.ts";
import { getExcelColumnLabel } from "../../shared/lib/deviceAnalysisUtils.ts";
import type { ProcessedEntry, ProcessedSeries } from "../../shared/lib/sharedTypes";
export type {
  DeviceAnalysisOriginExportMode,
  DeviceAnalysisOriginSelectionExport,
} from "./originSelectionExport.ts";
export {
  buildDeviceAnalysisOriginCanvasExport,
  buildDeviceAnalysisOriginExportsByMode,
  buildDeviceAnalysisOriginSelectionExport,
  isDeviceAnalysisOriginExportMode,
} from "./originSelectionExport.ts";

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
  ssManualRanges,
  ssMethod,
}: {
  processedData?: ProcessedEntry[];
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
    "ss_range_source",
  ];

  const rows: Array<Record<string, string | number>> = [];
  const confVersion = "ssfit_v1";
  const manualRanges =
    ssManualRanges && typeof ssManualRanges === "object"
      ? (ssManualRanges as SsManualRanges)
      : {};
  const methodDefault = String(ssMethod || "auto");

  for (const file of processedData) {
    const fileId = file?.fileId ?? "";
    const fileName = file?.fileName ?? "";
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    const seriesList = Array.isArray(file?.series) ? file.series : [];
    const supportsSs = isTransferLikeDeviceAnalysisFile(file);

    for (const series of seriesList) {
      const seriesId = series?.id ?? "";
      const seriesName = series?.name ?? "";
      const groupIndex = Number(series?.groupIndex);
      const yCol = Number(series?.yCol);
      const xArr = xGroups[groupIndex];
      const yArr = series?.y;
      const points = buildPoints(xArr, yArr);

      const method =
        methodDefault === "auto" || methodDefault === "manual"
          ? methodDefault
          : "auto";

      let fit: SsFit = { ok: false, reason: "common.invalid_points" };
      let cls: SsClassification = {
        ss_confidence: "fail",
        ss_ok: false,
        ss_reason: "common.invalid_points",
      };
      let rangeSource = "";

      if (!supportsSs) {
        fit = { ok: false, reason: "not_transfer_curve" };
        cls = {
          ss_confidence: "fail",
          ss_ok: false,
          ss_reason: "not_transfer_curve",
        };
      } else if (method === "auto") {
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

const normalizeOriginDisplayText = (
  value: unknown,
  { max = 160 }: { max?: number } = {},
): string => {
  const raw = String(value ?? "")
    .replace(/[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const escapeOriginLabtalkText = (value: unknown): string =>
  normalizeOriginDisplayText(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

const buildOriginWorksheetLabelCommands = (curveLabels: unknown): string[] => {
  const labels = Array.isArray(curveLabels) ? curveLabels : [];
  return labels
    .map((label, index) => {
      const escaped = escapeOriginLabtalkText(label);
      if (!escaped) return "";
      const yColumnIndex = index * 2 + 2;
      return `wks.col${yColumnIndex}.lname$="${escaped}";`;
    })
    .filter(Boolean);
};

export const buildDeviceAnalysisOriginOgsScript = (
  csvFileName: unknown,
  xyPairCount: unknown,
  xyPairsExprOverride?: unknown,
  curveLabels?: unknown,
): string => {
  const normalizedPairsExpr =
    typeof xyPairsExprOverride === "string" ? xyPairsExprOverride.trim() : "";
  const pairsExpr = normalizedPairsExpr || buildDeviceAnalysisOriginPairsExpr(xyPairCount);
  const safeCsv = String(csvFileName || "data.csv").replace(/"/g, "");
  const ogsFileName = safeCsv.replace(/\.csv$/i, ".ogs");
  const labelCommands = buildOriginWorksheetLabelCommands(curveLabels);
  const labelBlock = labelCommands.length
    ? `\n// Apply curve labels so Origin legend matches the chart\n${labelCommands.join("\n")}\n`
    : "\n";
  const legendRefreshBlock = labelCommands.length ? "\nlegend -r;\n" : "\n";

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
${labelBlock}
// Plot XY XY pairs: (1,2) (3,4) ...
plotxy iy:=${pairsExpr} plot:=202;
${legendRefreshBlock}`;
};

export const buildDeviceAnalysisOriginWorkbookOgsScript = (
  entries: Array<{
    csvFileName?: unknown;
    curveLabels?: unknown;
    sheetName?: unknown;
    xyPairCount?: unknown;
    xyPairsExprOverride?: unknown;
  }> = [],
  workbookName?: unknown,
): string => {
  const liveEntries = (Array.isArray(entries) ? entries : []).filter((entry) =>
    Boolean(String(entry?.csvFileName ?? "").trim()),
  );
  const escapedWorkbookName = escapeOriginLabtalkText(workbookName);
  const lines = [
    "[Main]",
    "// Auto import multiple Device Analysis CSV files into one Origin workbook",
    "newbook;",
  ];

  if (escapedWorkbookName) {
    lines.push(`page.longname$="${escapedWorkbookName}";`);
  }

  liveEntries.forEach((entry, index) => {
    const safeCsv = String(entry?.csvFileName || `data_${index + 1}.csv`).replace(/"/g, "");
    const normalizedPairsExpr =
      typeof entry?.xyPairsExprOverride === "string"
        ? entry.xyPairsExprOverride.trim()
        : "";
    const pairsExpr =
      normalizedPairsExpr ||
      buildDeviceAnalysisOriginPairsExpr(entry?.xyPairCount ?? 1);
    const sheetTitle = escapeOriginLabtalkText(entry?.sheetName);
    const labelCommands = buildOriginWorksheetLabelCommands(entry?.curveLabels);

    if (index > 0) {
      lines.push("newsheet;");
    }
    lines.push(`impCSV fname:="${safeCsv}";`);
    if (sheetTitle) {
      lines.push(`wks.lname$="${sheetTitle}";`);
    }
    if (labelCommands.length) {
      lines.push(...labelCommands);
    }
    lines.push(`plotxy iy:=${pairsExpr} plot:=202;`);
    if (labelCommands.length) {
      lines.push("legend -r;");
    }
  });

  return `${lines.join("\n")}\n`;
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
