/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createParameterRows,
  type CalculatedParameterRowData,
} from "src/cs/workbench/services/calculation/common/calculatedParameters";
import {
  classifySsFit,
  computeBaseCurrentMetrics,
  computeSubthresholdSwingFitInRange,
  isTransferLikeFile,
} from "src/cs/workbench/services/calculation/common/firstCalculation";
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
  MetricInputRecord,
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

type CurrentMetricValue = Extract<MetricRecord, { metricFamily: "current" }>["value"];
type SubthresholdMetricRecord = Extract<MetricRecord, { metricFamily: "subthreshold" }>;

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

export const createCalculatedMetricRecordsInputSignature = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): string => {
  const parts: string[] = [];
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    if (!collectFileRecordBaseCurves(file).length) {
      continue;
    }

    parts.push("file", file.id);
    for (const input of Object.values(file.metricInputsByKey ?? {})
      .sort((first, second) => first.metricKey.localeCompare(second.metricKey))) {
      parts.push(
        "input",
        input.metricKey,
        input.seriesId,
        input.source,
        input.configSignature ?? "",
        String(input.range?.x1 ?? ""),
        String(input.range?.x2 ?? ""),
      );
      for (const [key, value] of Object.entries(input.targets ?? {}).sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        parts.push("target", key, String(value ?? ""));
      }
    }
  }

  return parts.join("\u001f");
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
    const currentKey = `current:${seriesId}:base` as MetricKey;
    const subthresholdAutoKey = `subthreshold:${seriesId}:ss:auto` as MetricKey;
    const subthresholdManualKey = `subthreshold:${seriesId}:ss:manual` as MetricKey;
    const currentInput = file.metricInputsByKey?.[currentKey];
    const subthresholdInput = file.metricInputsByKey?.[subthresholdManualKey];
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
    const baseCurve = inputCurve ? file.curvesByKey[inputCurve.curveKey] : undefined;
    const currentValue = createCurrentMetricValue({
      baseCurve,
      input: currentInput,
      processedFile,
      row,
    });
    const subthresholdMetric = createSubthresholdMetric({
      file,
      input: subthresholdInput,
      inputCurves,
      inputSignatures,
      processedFile,
      row,
      seriesId,
      subthresholdAutoKey,
      subthresholdManualKey,
    });

    appendMetric(metricsByKey, {
      key: currentKey,
      fileId: file.id,
      seriesId,
      metricFamily: "current",
      contextKey: "base",
      inputCurves,
      inputSignatures: createMetricInputSignatures(inputSignatures, currentInput),
      algorithm: { id: "computeBaseCurrentMetrics" },
      value: currentValue,
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

    appendMetric(metricsByKey, subthresholdMetric);

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

const createCurrentMetricValue = ({
  baseCurve,
  input,
  processedFile,
  row,
}: {
  baseCurve: CurveRecord | undefined;
  input: MetricInputRecord | undefined;
  processedFile: ProcessedEntry;
  row: CalculatedParameterRowData;
}): CurrentMetricValue => {
  if (input?.source === "manual" && input.targets) {
    const metrics = computeBaseCurrentMetrics({
      manualTargets: {
        ionX: normalizeManualInputNumber(input.targets.ionX),
        ioffX: normalizeManualInputNumber(input.targets.ioffX),
      },
      method: "manual",
      points: baseCurve?.points ?? [],
      sourceFile: processedFile,
    });

    return {
      method: "manual",
      ion: normalizeNumberOrNull(metrics.ion),
      xAtIon: normalizeNumberOrNull(metrics.xAtIon),
      ioff: normalizeNumberOrNull(metrics.ioff),
      xAtIoff: normalizeNumberOrNull(metrics.xAtIoff),
      ionIoff: normalizeNumberOrNull(metrics.ionIoff),
      candidateWindows: normalizeCurrentWindows(metrics.candidateWindows),
      ionWindow: normalizeCurrentWindow(metrics.ionWindow),
      ioffWindow: normalizeCurrentWindow(metrics.ioffWindow),
    };
  }

  return {
    method: normalizeCurrentMethod(row.currentMethod),
    ion: normalizeNumberOrNull(row.ion),
    xAtIon: normalizeNumberOrNull(row.xAtIon),
    ioff: normalizeNumberOrNull(row.ioff),
    xAtIoff: normalizeNumberOrNull(row.xAtIoff),
    ionIoff: normalizeNumberOrNull(row.ionIoff),
    candidateWindows: normalizeCurrentWindows(row.currentCandidateWindows),
    ionWindow: normalizeCurrentWindow(row.ionWindow),
    ioffWindow: normalizeCurrentWindow(row.ioffWindow),
  };
};

const createSubthresholdMetric = ({
  file,
  input,
  inputCurves,
  inputSignatures,
  processedFile,
  row,
  seriesId,
  subthresholdAutoKey,
  subthresholdManualKey,
}: {
  file: FileRecord;
  input: MetricInputRecord | undefined;
  inputCurves: CurveRef[];
  inputSignatures: string[];
  processedFile: ProcessedEntry;
  row: CalculatedParameterRowData;
  seriesId: string;
  subthresholdAutoKey: MetricKey;
  subthresholdManualKey: MetricKey;
}): SubthresholdMetricRecord => {
  const inputCurve = inputCurves[0];
  const baseCurve = inputCurve ? file.curvesByKey[inputCurve.curveKey] : undefined;
  if (
    input?.source === "manual" &&
    input.range &&
    isTransferLikeFile(processedFile)
  ) {
    const fit = computeSubthresholdSwingFitInRange(
      baseCurve?.points ?? [],
      normalizeManualInputNumber(input.range.x1),
      normalizeManualInputNumber(input.range.x2),
    ) as Record<string, unknown>;
    const classification = classifySsFit("manual", fit) as Record<string, unknown>;
    const ok = classification.ss_ok === true;
    return {
      key: subthresholdManualKey,
      fileId: file.id,
      seriesId,
      metricFamily: "subthreshold",
      contextKey: "ss:manual",
      inputCurves,
      inputSignatures: createMetricInputSignatures(inputSignatures, input),
      algorithm: { id: "computeSubthresholdSwingFitInRange" },
      value: {
        ss: ok ? normalizeNumberOrNull(fit.ss) : null,
        confidence: normalizeSsConfidence(classification.ss_confidence),
        xAtSs: ok ? resolveFitMidpoint(fit) : null,
        method: "manual",
      },
    };
  }

  return {
    key: subthresholdAutoKey,
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
  };
};

const createMetricInputSignatures = (
  inputSignatures: string[],
  input: MetricInputRecord | undefined,
): string[] => {
  const inputSignature = input ? createMetricInputSignature(input) : null;
  return inputSignature ? [...inputSignatures, inputSignature] : inputSignatures;
};

const createMetricInputSignature = (input: MetricInputRecord): string => {
  const parts = [
    "metricInput",
    input.metricKey,
    input.seriesId,
    input.source,
    input.configSignature ?? "",
    String(input.range?.x1 ?? ""),
    String(input.range?.x2 ?? ""),
  ];
  for (const [key, value] of Object.entries(input.targets ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    parts.push(key, String(value ?? ""));
  }
  return parts.join(":");
};

const resolveFitMidpoint = (fit: Record<string, unknown>): number | null => {
  const x1 = normalizeNumberOrNull(fit.x1);
  const x2 = normalizeNumberOrNull(fit.x2);
  return x1 !== null && x2 !== null ? (x1 + x2) / 2 : null;
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

const normalizeManualInputNumber = (value: unknown): number | undefined =>
  normalizeNumberOrNull(value) ?? undefined;

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
