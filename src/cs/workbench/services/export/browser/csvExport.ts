/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import {
  classifySsFit,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInRange,
  resolveAutoSsSelection,
} from "src/cs/workbench/services/calculation/common/ss";
import { isTransferLikeFile } from "src/cs/workbench/services/calculation/common/ionIoff";
import { getCachedSsFitAuto } from "src/cs/workbench/services/calculation/common/calculationCacheAccess";
import { getExcelColumnLabel } from "src/cs/workbench/services/export/common/columnLabels";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  collectFileRecordBaseCurves,
  fileRecordSupportsSs,
  getFileRecordAxisProjection,
  getFileRecordCurveType,
  getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionFileProjection";

export type {
  OriginExportMode,
  OriginSelectionExport,
} from "src/cs/workbench/services/export/common/originExport";
export {
  buildOriginCanvasExport,
  buildOriginExportsByMode,
  buildOriginSelectionExport,
  isOriginExportMode,
} from "src/cs/workbench/services/export/common/originExport";

type ManualSsRangeEntry = {
  x1?: number | null;
  x2?: number | null;
};

type ManualSsRangesByFileId = Record<string, Record<string, ManualSsRangeEntry>>;

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

type ExportCsvNumberArray = readonly number[];

export type ExportCsvSeries = {
  readonly groupIndex?: number;
  readonly id?: string;
  readonly label?: string;
  readonly legendValue?: unknown;
  readonly name?: string;
  readonly y?: ExportCsvNumberArray;
  readonly yCol?: number;
};

export type ExportCsvFile = {
  readonly calculationCache?: unknown;
  readonly curveType?: string | null;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly series?: readonly ExportCsvSeries[];
  readonly supportsSs?: boolean;
  readonly xAxisRole?: string;
  readonly xGroups?: readonly ExportCsvNumberArray[];
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly yLabel?: string;
  readonly yUnit?: string;
};

export const sanitizeExportFilename = (name: unknown): string =>
  String(name || "export")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

export const triggerBlobDownload = (
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

export const createUniqueFileNameResolver = (): ((
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

export type ResolveCsvCurveLabelForSeries = (
  file: ExportCsvFile,
  series: ExportCsvSeries,
  index: number,
) => string;

type CsvSeriesGroup = {
  groupIndex: number;
  label: string | undefined;
  xArr: ExportCsvNumberArray;
  yArr: ExportCsvNumberArray;
};

export const createExportCsvFilesFromCanonical = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): ExportCsvFile[] => {
  const seen = new Set<FileId>();
  const entries: ExportCsvFile[] = [];
  const pushFile = (fileId: FileId): void => {
    if (seen.has(fileId)) {
      return;
    }
    seen.add(fileId);

    const file = filesById[fileId];
    if (!file || !collectFileRecordBaseCurves(file).length) {
      return;
    }

    entries.push(createExportCsvFileFromRecord(file));
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }

  return entries;
};

export const buildCsvExportsFromCanonical = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
  resolveCurveLabelForSeries?: ResolveCsvCurveLabelForSeries,
): Array<{
  csvText: string;
  filename: string;
  xyPairCount: number;
}> =>
  buildCsvExports(
    createExportCsvFilesFromCanonical(filesById, fileOrder),
    resolveCurveLabelForSeries,
  );

export const buildSsMetricsCsvFromCanonical = ({
  filesById,
  fileOrder,
  manualSsRangesByFileId,
  ssMethod,
}: {
  filesById: Record<FileId, FileRecord>;
  fileOrder: readonly FileId[];
  manualSsRangesByFileId?: unknown;
  ssMethod?: unknown;
}): string =>
  buildSsMetricsCsv({
    csvFiles: createExportCsvFilesFromCanonical(filesById, fileOrder),
    manualSsRangesByFileId: manualSsRangesByFileId ??
      createManualSsRangesFromCanonical(filesById, fileOrder),
    ssMethod,
  });

export const buildCsvExports = (
  csvFiles: ExportCsvFile[] = [],
  resolveCurveLabelForSeries?: ResolveCsvCurveLabelForSeries,
): Array<{
  csvText: string;
  filename: string;
  xyPairCount: number;
}> => {
  const makeUniqueName = createUniqueFileNameResolver();
  const exports: Array<{ csvText: string; filename: string; xyPairCount: number }> =
    [];

  for (const file of csvFiles) {
    const originalFileName = file?.fileName ?? "export";
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    const seriesList = Array.isArray(file?.series) ? file.series : [];

    const seriesByYCol = new Map<number, ExportCsvSeries[]>();
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
          return {
            groupIndex,
            label: resolveCurveLabelForSeries?.(
              file,
              series,
              seriesList.indexOf(series),
            ),
            xArr,
            yArr,
          };
        })
        .filter(
          (
            group,
          ): group is CsvSeriesGroup =>
            Boolean(group),
        );

      if (!groups.length) continue;

      const rowCount = Math.max(
        ...groups.map((group) =>
          Math.min(group.xArr.length ?? 0, group.yArr.length ?? 0),
        ),
      );
      const rows: Array<Array<number | string>> = [];
      if (resolveCurveLabelForSeries) {
        const header: string[] = [];
        for (const group of groups) {
          const label = String(group.label ?? "").trim();
          header.push(`${label || "X"} X`, label || "Y");
        }
        rows.push(header);
      }

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row: Array<number | string> = [];
        for (const group of groups) {
          row.push(group.xArr[rowIndex] ?? "", group.yArr[rowIndex] ?? "");
        }
        rows.push(row);
      }

      const csvText = Papa.unparse(rows);
      const base = sanitizeExportFilename(originalFileName).replace(
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

const buildPoints = (
  xArr?: ExportCsvNumberArray,
  yArr?: ExportCsvNumberArray,
): Array<{ x: number; y: number }> => {
  if (!xArr || !yArr) return [];

  const count = Math.min(xArr.length ?? 0, yArr.length ?? 0);
  if (count <= 0) return [];

  const points = new Array<{ x: number; y: number }>(count);
  for (let index = 0; index < count; index += 1) {
    points[index] = { x: xArr[index], y: yArr[index] };
  }

  return points;
};

const getOrComputeSsFitAuto = (
  file: ExportCsvFile,
  series: ExportCsvSeries,
  points: Array<{ x: number; y: number }>,
): Partial<{ strict: SsFit; suggested: SsFit }> | null | undefined => {
  const cached = getCachedSsFitAuto(file, series) as
    | Partial<{ strict: SsFit; suggested: SsFit }>
    | null
    | undefined;
  return cached ?? (computeSubthresholdSwingFitAuto(points) as
    | Partial<{ strict: SsFit; suggested: SsFit }>
    | null
    | undefined);
};

const createManualSsRangesFromCanonical = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): ManualSsRangesByFileId => {
  const ranges: ManualSsRangesByFileId = {};
  const seen = new Set<FileId>();
  const pushFile = (fileId: FileId): void => {
    if (seen.has(fileId)) {
      return;
    }
    seen.add(fileId);

    const file = filesById[fileId];
    if (!file) {
      return;
    }

    for (const input of Object.values(file.metricInputsByKey ?? {})) {
      if (
        input.source !== "manual" ||
        !input.metricKey.startsWith("subthreshold:") ||
        !input.range
      ) {
        continue;
      }

      ranges[file.id] = ranges[file.id] ?? {};
      ranges[file.id][input.seriesId] = {
        x1: input.range.x1 ?? null,
        x2: input.range.x2 ?? null,
      };
    }
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }
  return ranges;
};

const createExportCsvFileFromRecord = (file: FileRecord): ExportCsvFile => {
  const axis = getFileRecordAxisProjection(file);
  return {
    curveType: getFileRecordCurveType(file),
    calculationCache: file.calculationCache,
    fileId: file.id,
    fileName: file.raw.fileName,
    series: createExportCsvSeriesFromRecord(file),
    supportsSs: fileRecordSupportsSs(file),
    xAxisRole: axis.xAxisRole ?? undefined,
    xGroups: getFileRecordXGroups(file),
    xUnit: axis.xUnit,
    yUnit: axis.yUnit,
    xLabel: axis.xLabel,
    yLabel: axis.yLabel,
  };
};

const createExportCsvSeriesFromRecord = (file: FileRecord): ExportCsvSeries[] =>
  collectFileRecordBaseCurves(file).map((curve, index): ExportCsvSeries => {
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

export const buildSsMetricsCsv = ({
  csvFiles,
  manualSsRangesByFileId,
  ssMethod,
}: {
  csvFiles?: ExportCsvFile[];
  manualSsRangesByFileId?: unknown;
  ssMethod?: unknown;
}): string => {
  const files = csvFiles ?? [];
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
    manualSsRangesByFileId && typeof manualSsRangesByFileId === "object"
      ? (manualSsRangesByFileId as ManualSsRangesByFileId)
      : {};
  const methodDefault = String(ssMethod || "auto");

  for (const file of files) {
    const fileId = file?.fileId ?? "";
    const fileName = file?.fileName ?? "";
    const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
    const seriesList = Array.isArray(file?.series) ? file.series : [];
    const supportsSs = isTransferLikeFile(file);

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
        const autoFit = getOrComputeSsFitAuto(file, series, points);
        const autoSelection = resolveAutoSsSelection(autoFit);
        fit = autoSelection.fit as SsFit;
        cls = autoSelection.classification as SsClassification;
        rangeSource = autoSelection.source ?? "";
      } else if (method === "manual") {
        const autoFit = getOrComputeSsFitAuto(file, series, points);
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
