/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createParameterRows,
  type CalculatedParameterRowData,
} from "src/cs/workbench/services/calculation/common/calculatedParameters";
import type {
  BaseCurveFamily,
  CurrentWindowRecord,
  CurveKey as SessionCurveKey,
  CurveRef,
  CurveRecord,
  FileId,
  FileRecord,
  ItCurveMode,
  IvCurveMode,
  MetricKey,
  MetricRecord,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  collectFileRecordBaseCurves,
  createProcessedSeriesFromFileRecord,
  fileRecordSupportsSs,
  getFileRecordAxisProjection,
  getFileRecordCurveType,
  getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";

export const createCalculatedMetricRecordsByFile = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): Record<FileId, MetricRecord[]> => {
  const metricsByFileId: Record<FileId, MetricRecord[]> = {};
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    const metrics = createCalculatedMetricRecordsForFile(file);
    if (metrics.length) {
      metricsByFileId[file.id] = metrics;
    }
  }
  return metricsByFileId;
};

export const createCalculatedMetricRecordsForFile = (
  file: FileRecord,
): MetricRecord[] => {
  const curves = collectFileRecordBaseCurves(file);
  if (!curves.length) {
    return [];
  }

  const metricsByKey: Record<MetricKey, MetricRecord> = {};
  const processedFile = createProcessedEntryFromFileRecord(file);
  const family = curves[0]?.curveFamily ?? null;
  const ivMode = curves.find((curve) => curve.curveFamily === "iv" && curve.ivMode)?.ivMode ?? null;
  const itMode = curves.find((curve) => curve.curveFamily === "it" && curve.itMode)?.itMode ?? null;
  const derivativeKind = ivMode === "output" ? "gds" : "gm";
  const seriesOrder = curves.map((curve) => curve.seriesId);

  for (const [index, row] of createParameterRows(processedFile).entries()) {
    const seriesId = resolveMetricSeriesId(row, seriesOrder[index], index);
    const inputCurve = family
      ? createMetricInputCurveRef({
          curvesByKey: file.curvesByKey,
          family,
          fileId: file.id,
          itMode,
          ivMode,
          seriesId,
        })
      : null;
    const inputCurves = inputCurve ? [inputCurve] : [];
    const inputSignatures = inputCurves
      .map((curve) => curve.signature)
      .filter((signature) => signature.length > 0);

    appendMetric(metricsByKey, {
      key: `current:${seriesId}:base` as MetricKey,
      fileId: file.id,
      seriesId,
      metricFamily: "current",
      contextKey: "base",
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeBaseCurrentMetrics" },
      value: {
        method: normalizeCurrentMethod(row.currentMethod),
        ion: normalizeNumberOrNull(row.ion),
        xAtIon: normalizeNumberOrNull(row.xAtIon),
        ioff: normalizeNumberOrNull(row.ioff),
        xAtIoff: normalizeNumberOrNull(row.xAtIoff),
        ionIoff: normalizeNumberOrNull(row.ionIoff),
        candidateWindows: normalizeCurrentWindows(row.currentCandidateWindows),
        ionWindow: normalizeCurrentWindow(row.ionWindow),
        ioffWindow: normalizeCurrentWindow(row.ioffWindow),
      },
    });

    appendMetric(metricsByKey, {
      key: `derivative:${seriesId}:${derivativeKind}` as MetricKey,
      fileId: file.id,
      seriesId,
      metricFamily: "derivative",
      contextKey: derivativeKind,
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeCentralDerivative" },
      value: {
        kind: derivativeKind,
        maxAbs: normalizeNumberOrNull(row.gmMaxAbs),
        xAtMaxAbs: normalizeNumberOrNull(row.xAtGmMaxAbs),
      },
    });

    appendMetric(metricsByKey, {
      key: `subthreshold:${seriesId}:ss:auto` as MetricKey,
      fileId: file.id,
      seriesId,
      metricFamily: "subthreshold",
      contextKey: "ss:auto",
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeSubthresholdSwingFitAuto" },
      value: {
        ss: normalizeNumberOrNull(row.ss),
        confidence: normalizeSsConfidence(row.ssConfidence),
        xAtSs: normalizeNumberOrNull(row.xAtSs),
        method: "auto",
      },
    });

    const thresholdVoltage = normalizeNumberOrNull(row.thresholdVoltage);
    const thresholdVoltageElectron = normalizeNumberOrNull(row.thresholdVoltageElectron);
    const thresholdVoltageHole = normalizeNumberOrNull(row.thresholdVoltageHole);
    if (
      thresholdVoltage !== null ||
      thresholdVoltageElectron !== null ||
      thresholdVoltageHole !== null
    ) {
      appendMetric(metricsByKey, {
        key: `threshold:${seriesId}:vth` as MetricKey,
        fileId: file.id,
        seriesId,
        metricFamily: "threshold",
        contextKey: "vth",
        inputCurves,
        inputSignatures,
        algorithm: { id: "computeVthSqrtFits" },
        value: {
          vth: thresholdVoltage,
          electron: thresholdVoltageElectron,
          hole: thresholdVoltageHole,
          fitQuality: "good",
        },
      });
    }
  }

  return Object.values(metricsByKey);
};

const createProcessedEntryFromFileRecord = (file: FileRecord): ProcessedEntry => {
  const axis = getFileRecordAxisProjection(file);
  return {
    curveType: getFileRecordCurveType(file),
    fileId: file.id,
    fileName: file.raw.fileName,
    series: createProcessedSeriesFromFileRecord(file),
    supportsSs: fileRecordSupportsSs(file),
    xAxisRole: axis.xAxisRole,
    xGroups: getFileRecordXGroups(file),
    xLabel: axis.xLabel,
    xUnit: axis.xUnit,
    yLabel: axis.yLabel,
    yUnit: axis.yUnit,
  };
};

const appendMetric = (
  metricsByKey: Record<MetricKey, MetricRecord>,
  metric: MetricRecord,
): void => {
  metricsByKey[metric.key] = metric;
};

const createMetricInputCurveRef = ({
  curvesByKey,
  family,
  fileId,
  itMode,
  ivMode,
  seriesId,
}: {
  curvesByKey: Record<string, CurveRecord>;
  family: BaseCurveFamily;
  fileId: string;
  itMode: ItCurveMode | null;
  ivMode: IvCurveMode | null;
  seriesId: string;
}): CurveRef => {
  const curveKey = createBaseCurveKey(family, ivMode, itMode, seriesId);
  return {
    fileId,
    seriesId,
    curveKey,
    signature: curvesByKey[curveKey]?.signature ?? "",
  };
};

const createBaseCurveKey = (
  family: BaseCurveFamily,
  ivMode: IvCurveMode | null,
  itMode: ItCurveMode | null,
  seriesId: string,
): SessionCurveKey => {
  const mode = family === "iv"
    ? ivMode ?? "default"
    : family === "it"
      ? itMode ?? "default"
      : "default";
  return `base:${family}:${mode}:${seriesId}` as SessionCurveKey;
};

const resolveMetricSeriesId = (
  row: CalculatedParameterRowData & { id?: unknown },
  fallbackSeriesId: string | undefined,
  index: number,
): string => {
  const rowId = normalizeId(row.id);
  if (rowId) {
    return rowId;
  }
  return fallbackSeriesId || `series-${index + 1}`;
};

const normalizeCurrentMethod = (
  value: unknown,
): "auto" | "manual" | "unavailable" =>
  value === "manual" || value === "auto" ? value : "unavailable";

const normalizeSsConfidence = (value: unknown): "high" | "low" | "fail" =>
  value === "high" || value === "low" || value === "fail" ? value : "fail";

const normalizeNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeCurrentWindows = (value: unknown): CurrentWindowRecord[] =>
  Array.isArray(value)
    ? value
        .map(normalizeCurrentWindow)
        .filter((window): window is CurrentWindowRecord => Boolean(window))
    : [];

const normalizeCurrentWindow = (value: unknown): CurrentWindowRecord | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const key = normalizeCurrentWindowKey(value.key);
  if (!key) {
    return null;
  }

  return {
    key,
    label: normalizeOptionalText(value.label) ?? key,
    current: normalizeNumberOrNull(value.current),
    x: normalizeNumberOrNull(value.x),
    x1: normalizeNumberOrNull(value.x1),
    x2: normalizeNumberOrNull(value.x2),
    targetX: normalizeNumberOrNull(value.targetX),
    pointCount: Math.max(0, Math.floor(Number(value.pointCount) || 0)),
  };
};

const normalizeCurrentWindowKey = (
  value: unknown,
): CurrentWindowRecord["key"] | null => {
  switch (value) {
    case "lowEnd":
    case "highEnd":
    case "maxCurrent":
    case "minCurrent":
    case "zeroBias":
    case "manualIon":
    case "manualIoff":
      return value;
    default:
      return null;
  }
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
};

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getOrderedFileRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): FileRecord[] => {
  const files: FileRecord[] = [];
  const seen = new Set<FileId>();
  const pushFile = (fileId: string): void => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }
    seen.add(normalizedFileId);

    const file = filesById[normalizedFileId];
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
