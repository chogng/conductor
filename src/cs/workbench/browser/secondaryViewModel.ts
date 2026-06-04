import { buildPoints } from "src/cs/workbench/contrib/plot/browser/chartViewModel";
import {
  computeCentralDerivative,
  computeSubthresholdSwingFitAuto,
} from "src/cs/workbench/contrib/diagnostics/common/analysisMath";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "src/cs/workbench/contrib/diagnostics/common/metrics";
import type { OriginCurveExportSeriesOption, OriginExportContentOption } from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import type { OriginExportContentKey } from "src/cs/workbench/contrib/export/common/originSelectionExport";
import type { CalculatedParameterRowData } from "src/cs/workbench/contrib/parameters/browser/parametersModel";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

export type SecondaryViewModelInput = {
  readonly activeFileId?: string | null;
  readonly cleanedData: CleanedEntry[];
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

export const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
  { group: "basic", key: "iv", labelKey: "da_origin_export_content_iv" },
  { group: "derived", key: "metrics", labelKey: "da_origin_export_content_metrics" },
  { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
  { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
  { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
];

export const resolveActiveFile = ({
  activeFileId,
  cleanedData,
}: SecondaryViewModelInput): CleanedEntry | null => {
  const files = Array.isArray(cleanedData) ? cleanedData : [];
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    files.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    files[0] ??
    null
  );
};

export const createOriginCurveOptions = (
  file: CleanedEntry,
): OriginCurveExportSeriesOption[] =>
  (Array.isArray(file?.series) ? file.series : [])
    .map((series, index) => {
      const seriesId = String(series?.id ?? "");
      if (!seriesId) return null;
      return {
        key: seriesId,
        label: String(series?.name ?? `Series ${index + 1}`),
        sourceFileId: String(file?.fileId ?? ""),
        sourceSeriesId: seriesId,
      };
    })
    .filter((option): option is OriginCurveExportSeriesOption => Boolean(option));

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

export const normalizeOriginExportContentKeys = (
  keys: readonly OriginExportContentKey[],
): OriginExportContentKey[] => Array.from(new Set(keys));

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
): { confidence: string; value: number | null; x: number | null } => {
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
