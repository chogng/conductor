/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import {
  computeCentralDerivative,
  computeBaseCurrentMetrics,
  computeSubthresholdSwingFitAuto,
  isTransferLikeFile,
} from "src/cs/workbench/services/calculation/common/firstCalculation";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type SsConfidence = "high" | "low" | "fail" | string;

export type CalculatedParameterRowData = {
  currentCandidateWindows?: unknown[];
  currentMethod?: string | null;
  legendHeader?: string | null;
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

export const createParameterRows = (
  file: ProcessedEntry,
): Array<CalculatedParameterRowData & { id?: unknown }> => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const seriesList = Array.isArray(file?.series) ? file.series : [];
  const showTransferMetrics = isTransferLikeFile(file);

  return seriesList.map((series, index) => {
    const points = createSourcePoints(xGroups[Number(series?.groupIndex)], series?.y);

    // 一次计算区域：直接从清洗后的源数据计算 Ion/Ioff 等基础电流参数。
    const baseMetrics = computeBaseCurrentMetrics({
      points,
      sourceFile: file,
    });

    // 一次计算区域：基于清洗后的源数据计算 gm、SS、Vth 等派生指标。
    const derivative = computeCentralDerivative(points) as DerivativePoint[];
    const gm = resolveMaxAbsPoint(derivative);
    const ssFit = showTransferMetrics
      ? resolveSsFit(computeSubthresholdSwingFitAuto(points))
      : { confidence: "fail", value: null, x: null };

    const seriesName = resolveSeriesName(series, index);
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
      legendHeader: seriesName.header,
      name: seriesName.value,
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

const createSourcePoints = (
  xValues: unknown,
  yValues: unknown,
): Array<{ x: number; y: number }> => {
  const xList = isArrayLike(xValues) ? xValues : [];
  const yList = isArrayLike(yValues) ? yValues : [];
  const count = Math.min(xList.length, yList.length);
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const x = Number(xList[index]);
    const y = Number(yList[index]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }
  return points;
};

const resolveSeriesName = (
  series: ProcessedSeries,
  index: number,
): { header: string | null; value: string } => {
  for (const candidate of [series?.legendValue, series?.name]) {
    const parsedLegend = parseLegendValue(String(candidate ?? "").trim());
    if (parsedLegend) {
      return parsedLegend;
    }
  }

  return {
    header: null,
    value: `#${index + 1}`,
  };
};

const parseLegendValue = (
  legendValue: string,
): { header: string; value: string } | null => {
  const match = /^([^=]+?)\s*=\s*(.+)$/u.exec(legendValue);
  if (!match) {
    return null;
  }

  const header = match[1]?.trim() ?? "";
  const value = match[2]?.trim() ?? "";
  if (!header || !value) {
    return null;
  }

  return { header, value };
};

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

const isArrayLike = (value: unknown): value is ArrayLike<unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  Number.isFinite(Number((value as ArrayLike<unknown>).length));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

