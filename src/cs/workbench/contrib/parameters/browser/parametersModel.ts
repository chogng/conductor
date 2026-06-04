import { buildPoints } from "src/cs/workbench/contrib/plot/browser/chartViewModel";
import {
  computeCentralDerivative,
  computeSubthresholdSwingFitAuto,
} from "src/cs/workbench/contrib/diagnostics/common/analysisMath";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "src/cs/workbench/contrib/diagnostics/common/metrics";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

export type SsConfidence = "high" | "low" | "fail" | string;

export type CalculatedParameterRowData = {
  currentCandidateWindows?: unknown[];
  currentMethod?: string | null;
  name: string;
  ion: number | null;
  ionWindow?: unknown;
  xAtIon: number | null;
  ioff: number | null;
  ioffWindow?: unknown;
  xAtIoff: number | null;
  ionIoff: number | null;
  gmMaxAbs: number | null;
  xAtGmMaxAbs: number | null;
  thresholdVoltage: number | null;
  thresholdVoltageElectron?: number | null;
  thresholdVoltageHole?: number | null;
  ss: number | null;
  ssConfidence: SsConfidence;
  xAtSs: number | null;
  jon: number | null;
};

type DerivativePoint = {
  x?: unknown;
  y?: unknown;
};

type SsFit = {
  ok?: unknown;
  ss?: unknown;
  x1?: unknown;
  x2?: unknown;
};

type SsFitResult = {
  strict?: SsFit;
  suggested?: SsFit;
};

export type CurrentMetricRole = "ion" | "ioff" | "ratio";

export type CurrentTooltipBuilder = (
  role: CurrentMetricRole,
  row: CalculatedParameterRowData,
) => string;

export type SsTooltipBuilder = (row: CalculatedParameterRowData) => string;

export const formatMetricValue = (
  value: number | null | undefined,
  digits?: number,
): string => formatNumber(value, digits != null ? { digits } : undefined);

export const getSsMetricText = (
  value: number | null | undefined,
  confidence: SsConfidence,
): string => {
  if (value !== null && value !== undefined) {
    return formatMetricValue(value, 2);
  }
  return confidence === "fail" ? "Fail" : "-";
};

export const getCurrentTooltip = (
  builder: CurrentTooltipBuilder | undefined,
  isPending: boolean,
  row: CalculatedParameterRowData,
  role: CurrentMetricRole,
): string => (isPending || !builder ? "" : builder(role, row));

export const getSsTooltip = (
  builder: SsTooltipBuilder | undefined,
  isPending: boolean,
  row: CalculatedParameterRowData,
): string => (isPending || !builder ? "" : builder(row));

export const getThresholdVoltageTooltip = (
  row: CalculatedParameterRowData,
  isPending: boolean,
): string =>
  isPending
    ? ""
    : `sqrt(|Id|)-Vg linear extrapolation: Vth,e=${row.thresholdVoltageElectron ?? "-"}, Vth,h=${row.thresholdVoltageHole ?? "-"}`;

export const createParameterRows = (
  file: CleanedEntry,
): Array<CalculatedParameterRowData & { id?: unknown }> => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const seriesList = Array.isArray(file?.series) ? file.series : [];
  const showTransferMetrics = isTransferLikeFile(file);

  return seriesList.map((series, index) => {
    const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
    const baseMetrics = computeBaseCurrentMetrics({
      points,
      sourceFile: file,
    });
    const derivative = computeCentralDerivative(points) as DerivativePoint[];
    const gm = resolveMaxAbsPoint(derivative);
    const ssFit = showTransferMetrics
      ? resolveSsFit(computeSubthresholdSwingFitAuto(points))
      : { confidence: "fail", value: null, x: null };

    return {
      currentCandidateWindows: baseMetrics.candidateWindows,
      currentMethod: baseMetrics.method,
      gmMaxAbs: gm.y,
      id: series.id ?? index,
      ion: baseMetrics.ion,
      ionIoff: baseMetrics.ionIoff,
      ionWindow: baseMetrics.ionWindow,
      ioff: baseMetrics.ioff,
      ioffWindow: baseMetrics.ioffWindow,
      jon: null,
      name: resolveSeriesName(series, index),
      ss: ssFit.value,
      ssConfidence: ssFit.confidence,
      thresholdVoltage: null,
      thresholdVoltageElectron: null,
      thresholdVoltageHole: null,
      xAtGmMaxAbs: gm.x,
      xAtIon: baseMetrics.xAtIon,
      xAtIoff: baseMetrics.xAtIoff,
      xAtSs: ssFit.x,
    };
  });
};

const resolveSeriesName = (series: CleanedSeries, index: number): string =>
  String(series?.name ?? `Series ${index + 1}`);

const resolveMaxAbsPoint = (
  points: DerivativePoint[],
): { x: number | null; y: number | null } => {
  let best: { x: number | null; y: number | null } = { x: null, y: null };
  let bestAbs = -1;

  for (const point of Array.isArray(points) ? points : []) {
    const y = Number(point?.y);
    if (!Number.isFinite(y)) continue;
    const abs = Math.abs(y);
    if (abs <= bestAbs) continue;
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
): { confidence: SsConfidence; value: number | null; x: number | null } => {
  const result = isRecord(value) ? (value as SsFitResult) : null;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
