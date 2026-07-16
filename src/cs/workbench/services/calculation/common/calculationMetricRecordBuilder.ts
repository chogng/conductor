/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { computeCentralDerivative } from "src/cs/workbench/services/calculation/common/gm";
import type {
  CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "src/cs/workbench/services/calculation/common/ionIoff";
import {
  classifySsFit,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInRange,
} from "src/cs/workbench/services/calculation/common/ss";
import type {
  BaseCurveFamily,
  CurrentWindowRecord,
  CurveKey as SessionCurveKey,
  ItCurveMode,
  IvCurveMode,
  MetricKey,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  type CalculationBaseCurveRecord,
  type CalculationCurrentMetricRecord,
  type CalculationCurveRef,
  type CalculationMetricInputRecord,
  type CalculationMetricRecord,
  type CalculationRecordsInput,
  type CalculationSubthresholdMetricRecord,
  calculationSupportsSs,
  collectCalculationBaseCurves,
  getCalculationCurveType,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

type CurrentMetricValue = CalculationCurrentMetricRecord["value"];
type MetricSourceFile = {
  readonly curveType?: unknown;
  readonly supportsSs?: unknown;
  readonly xAxisRole?: unknown;
  readonly xLabel?: unknown;
};
type MetricSourceRow = {
  readonly currentCandidateWindows?: unknown[];
  readonly currentMethod?: string | null;
  readonly gmMaxAbs: number | null;
  readonly id?: unknown;
  readonly ion: number | null;
  readonly ionWindow?: unknown;
  readonly xAtIon: number | null;
  readonly ioff: number | null;
  readonly ioffWindow?: unknown;
  readonly xAtIoff: number | null;
  readonly ionIoff: number | null;
  readonly ss: number | null;
  readonly ssConfidence: "high" | "low" | "fail" | string;
  readonly xAtGmMaxAbs: number | null;
  readonly xAtSs: number | null;
};
type DerivativePoint = {
  readonly x?: unknown;
  readonly y?: unknown;
};
export type CalculatedMetricRecordBuilderOptions = {
  readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
  readonly derivativePointsBySeriesId?: Readonly<Record<SeriesId, readonly DerivativePoint[] | undefined>>;
};
type SsFit = {
  readonly ok?: unknown;
  readonly ss?: unknown;
  readonly x1?: unknown;
  readonly x2?: unknown;
};
type SsFitResult = {
  readonly strict?: SsFit;
  readonly suggested?: SsFit;
};

export const createCalculatedMetricRecordsInputSignature = (
  input: CalculationRecordsInput,
): string => {
  const parts: string[] = [];
  for (const metricInput of Object.values(input.metricInputsByKey ?? {})
    .sort((first, second) => first.metricKey.localeCompare(second.metricKey))) {
    parts.push(
      "input",
      metricInput.metricKey,
      metricInput.seriesId,
      metricInput.source,
      metricInput.configSignature ?? "",
      String(metricInput.range?.x1 ?? ""),
      String(metricInput.range?.x2 ?? ""),
    );
    for (const [key, value] of Object.entries(metricInput.targets ?? {}).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      parts.push("target", key, String(value ?? ""));
    }
  }

  return parts.join("\u001f");
};

export const createCalculatedMetricRecords = (
  input: CalculationRecordsInput,
  options: CalculatedMetricRecordBuilderOptions = {},
): CalculationMetricRecord[] => {
  const curves = collectCalculationBaseCurves(input);
  if (!curves.length) {
    return [];
  }

  const metricsByKey: Record<MetricKey, CalculationMetricRecord> = {};
  const sourceFile = createMetricSourceFile(input, curves);
  const family = curves[0]?.curveFamily ?? null;
  const ivMode = curves.find((curve) => curve.curveFamily === "iv" && curve.ivMode)?.ivMode ?? null;
  const itMode = curves.find((curve) => curve.curveFamily === "it" && curve.itMode)?.itMode ?? null;
  const derivativeKind = ivMode === "output" ? "gds" : "gm";
  const rows = createMetricSourceRows({
    analysisBySeriesId: options.analysisBySeriesId,
    curves,
    derivativePointsBySeriesId: options.derivativePointsBySeriesId,
    sourceFile,
  });

  for (const [index, row] of rows.entries()) {
    const curve = curves[index];
    const seriesId = resolveMetricSeriesId(row, curve?.seriesId, index);
    const currentKey = `current:${seriesId}:base` as MetricKey;
    const subthresholdAutoKey = `subthreshold:${seriesId}:ss:auto` as MetricKey;
    const subthresholdManualKey = `subthreshold:${seriesId}:ss:manual` as MetricKey;
    const currentInput = input.metricInputsByKey?.[currentKey];
    const subthresholdInput = input.metricInputsByKey?.[subthresholdManualKey];
    const inputCurve = family
      ? createMetricInputCurveRef({
          curvesByKey: input.baseCurvesByKey,
          family,
          itMode,
          ivMode,
          seriesId,
        })
      : null;
    const inputCurves = inputCurve ? [inputCurve] : [];
    const inputSignatures = inputCurves
      .map((curve) => curve.signature)
      .filter((signature) => signature.length > 0);
    const baseCurve = curve ?? (
      inputCurve
        ? input.baseCurvesByKey[inputCurve.curveKey]
        : undefined
    );
    const currentValue = createCurrentMetricValue({
      baseCurve,
      input: currentInput,
      row,
      sourceFile,
    });
    const subthresholdMetric = createSubthresholdMetric({
      recordsInput: input,
      input: subthresholdInput,
      inputCurves,
      inputSignatures,
      row,
      seriesId,
      sourceFile,
      subthresholdAutoKey,
      subthresholdManualKey,
    });

    appendMetric(metricsByKey, {
      key: currentKey,
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
  }

  return Object.values(metricsByKey);
};

const createMetricSourceFile = (
  input: CalculationRecordsInput,
  curves: readonly CalculationBaseCurveRecord[],
): MetricSourceFile => {
  return {
    curveType: getCalculationCurveType(curves[0]),
    supportsSs: calculationSupportsSs(input),
    xAxisRole: input.axis.xAxisRole,
    xLabel: input.axis.xLabel,
  };
};

const createMetricSourceRows = ({
  analysisBySeriesId,
  curves,
  derivativePointsBySeriesId,
  sourceFile,
}: {
  readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
  readonly curves: readonly CalculationBaseCurveRecord[];
  readonly derivativePointsBySeriesId?: Readonly<Record<SeriesId, readonly DerivativePoint[] | undefined>>;
  readonly sourceFile: MetricSourceFile;
}): MetricSourceRow[] => {
  const showTransferMetrics = isTransferLikeFile(sourceFile);
  return curves.map((curve, index): MetricSourceRow => {
    const points = curve.points;
    const analysis = analysisBySeriesId?.[curve.seriesId];
    const baseMetrics = analysis?.baseCurrent ?? computeBaseCurrentMetrics({
        points,
        sourceFile,
      });
    const derivativePoints = derivativePointsBySeriesId?.[curve.seriesId] ??
      analysis?.gm ??
      (computeCentralDerivative(points) as DerivativePoint[]);
    const derivative = resolveMaxAbsPoint(derivativePoints);
    const ssFit = showTransferMetrics
      ? resolveSsFit(
          analysis?.ssFitAuto ?? computeSubthresholdSwingFitAuto(points),
        )
      : { confidence: "fail" as const, value: null, x: null };

    return {
      currentCandidateWindows: baseMetrics.candidateWindows,
      currentMethod: baseMetrics.method,
      gmMaxAbs: derivative.y,
      id: curve.seriesId || index,
      ion: baseMetrics.ion,
      ionIoff: baseMetrics.ionIoff,
      ionWindow: baseMetrics.ionWindow,
      ioff: baseMetrics.ioff,
      ioffWindow: baseMetrics.ioffWindow,
      ss: ssFit.value,
      ssConfidence: ssFit.confidence,
      xAtGmMaxAbs: derivative.x,
      xAtIon: baseMetrics.xAtIon,
      xAtIoff: baseMetrics.xAtIoff,
      xAtSs: ssFit.x,
    };
  });
};

const createCurrentMetricValue = ({
  baseCurve,
  input,
  row,
  sourceFile,
}: {
  baseCurve: CalculationBaseCurveRecord | undefined;
  input: CalculationMetricInputRecord | undefined;
  row: MetricSourceRow;
  sourceFile: MetricSourceFile;
}): CurrentMetricValue => {
  if (input?.source === "manual" && input.targets) {
    const metrics = computeBaseCurrentMetrics({
      manualTargets: {
        ionX: normalizeManualInputNumber(input.targets.ionX),
        ioffX: normalizeManualInputNumber(input.targets.ioffX),
      },
      method: "manual",
      points: baseCurve?.points ?? [],
      sourceFile,
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
  recordsInput,
  input,
  inputCurves,
  inputSignatures,
  row,
  seriesId,
  sourceFile,
  subthresholdAutoKey,
  subthresholdManualKey,
}: {
  recordsInput: CalculationRecordsInput;
  input: CalculationMetricInputRecord | undefined;
  inputCurves: CalculationCurveRef[];
  inputSignatures: string[];
  row: MetricSourceRow;
  seriesId: string;
  sourceFile: MetricSourceFile;
  subthresholdAutoKey: MetricKey;
  subthresholdManualKey: MetricKey;
}): CalculationSubthresholdMetricRecord => {
  const inputCurve = inputCurves[0];
  const baseCurve = inputCurve
    ? recordsInput.baseCurvesByKey[inputCurve.curveKey]
    : undefined;
  if (
    input?.source === "manual" &&
    input.range &&
    isTransferLikeFile(sourceFile)
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
  input: CalculationMetricInputRecord | undefined,
): string[] => {
  const inputSignature = input ? createMetricInputSignature(input) : null;
  return inputSignature ? [...inputSignatures, inputSignature] : inputSignatures;
};

const createMetricInputSignature = (
  input: CalculationMetricInputRecord,
): string => {
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
  metricsByKey: Record<MetricKey, CalculationMetricRecord>,
  metric: CalculationMetricRecord,
): void => {
  metricsByKey[metric.key] = metric;
};

const createMetricInputCurveRef = ({
  curvesByKey,
  family,
  itMode,
  ivMode,
  seriesId,
}: {
  curvesByKey: Readonly<Record<string, CalculationBaseCurveRecord>>;
  family: BaseCurveFamily;
  itMode: ItCurveMode | null;
  ivMode: IvCurveMode | null;
  seriesId: string;
}): CalculationCurveRef => {
  const curveKey = createBaseCurveKey(family, ivMode, itMode, seriesId);
  return {
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
  row: MetricSourceRow,
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

const resolveMaxAbsPoint = (
  points: readonly DerivativePoint[],
): { x: number | null; y: number | null } => {
  let best: { x: number | null; y: number | null } = { x: null, y: null };
  let bestAbs = -1;

  for (const point of Array.isArray(points) ? points : []) {
    const y = Number(point?.y);
    if (!Number.isFinite(y)) {
      continue;
    }
    const abs = Math.abs(y);
    if (abs <= bestAbs) {
      continue;
    }
    const x = Number(point?.x);
    bestAbs = abs;
    best = {
      x: Number.isFinite(x) ? x : null,
      y: abs,
    };
  }

  return best;
};

const resolveSsFit = (
  value: unknown,
): { confidence: "high" | "low" | "fail"; value: number | null; x: number | null } => {
  const result = isObjectRecord(value) ? (value as SsFitResult) : null;
  const fit = result?.strict?.ok ? result.strict : result?.suggested ?? null;
  const ss = Number(fit?.ss);
  const x1 = Number(fit?.x1);
  const x2 = Number(fit?.x2);

  return {
    confidence: result?.strict?.ok ? "high" : fit?.ok ? "low" : "fail",
    value: Number.isFinite(ss) ? ss : null,
    x: Number.isFinite(x1) && Number.isFinite(x2) ? (x1 + x2) / 2 : null,
  };
};
