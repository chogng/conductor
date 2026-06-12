/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createParameterRows,
  type CalculatedParameterRowData,
  type SsConfidence,
} from "src/cs/workbench/services/calculation/common/calculatedParameters";
import {
  isOutputLikeFile,
  isTransferLikeFile,
} from "src/cs/workbench/services/calculation/common/firstCalculation";
import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import { localize } from "src/cs/nls";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  BaseCurveRecord,
  FileRecord,
  MetricRecord,
  SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export {
  createParameterRows,
  type CalculatedParameterRowData,
  type SsConfidence,
};

export type ParametersViewState =
  | {
      readonly kind: "empty";
      readonly message: string;
    }
  | {
      readonly kind: "table";
      readonly gmMetricHeader: string;
      readonly rows: Array<CalculatedParameterRowData & { id?: unknown }>;
      readonly showTransferMetrics: boolean;
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

export const createParametersViewState = (
  activeFile: ProcessedEntry | null,
  activeFileRecord?: FileRecord | null,
): ParametersViewState => {
  const canonicalState = activeFileRecord
    ? createParametersViewStateFromFileRecord(activeFileRecord)
    : null;
  if (canonicalState?.kind === "table" || !activeFile) {
    return canonicalState ?? {
      kind: "empty",
      message: localize("parameters.empty.noData", "No parameter data."),
    };
  }

  const isTransfer = isTransferLikeFile(activeFile);
  const isOutput = isOutputLikeFile(activeFile);
  if (!isTransfer && !isOutput) {
    return {
      kind: "empty",
      message: localize("parameters.empty.unsupportedCurve", "No parameters for this curve type."),
    };
  }

  const rows = createParameterRows(activeFile);
  if (rows.length === 0) {
    return {
      kind: "empty",
      message: localize("parameters.empty.noRows", "No parameter rows."),
    };
  }

  return {
    gmMetricHeader: isTransfer ? "gm" : "gds",
    kind: "table",
    rows,
    showTransferMetrics: isTransfer,
  };
};

const createParametersViewStateFromFileRecord = (
  file: FileRecord,
): ParametersViewState | null => {
  const ivMode = resolveRecordIvMode(file);
  if (ivMode !== "transfer" && ivMode !== "output") {
    return null;
  }

  const rows = createParameterRowsFromMetrics(file);
  if (rows.length === 0) {
    return null;
  }

  const showTransferMetrics = ivMode === "transfer";
  return {
    gmMetricHeader: showTransferMetrics ? "gm" : "gds",
    kind: "table",
    rows,
    showTransferMetrics,
  };
};

type CurrentMetricRecord = Extract<MetricRecord, { metricFamily: "current" }>;
type DerivativeMetricRecord = Extract<MetricRecord, { metricFamily: "derivative" }>;
type ThresholdMetricRecord = Extract<MetricRecord, { metricFamily: "threshold" }>;
type SubthresholdMetricRecord = Extract<MetricRecord, { metricFamily: "subthreshold" }>;
type ParameterRow = CalculatedParameterRowData & { id?: unknown };

const createParameterRowsFromMetrics = (
  file: FileRecord,
): ParameterRow[] => {
  const seriesIds = file.seriesOrder.length
    ? file.seriesOrder
    : Object.keys(file.seriesById);

  return seriesIds
    .map((seriesId, index): ParameterRow | null => {
      const series = file.seriesById[seriesId];
      const metrics = resolveMetricsForSeries(file, seriesId);
      if (!metrics.length) {
        return null;
      }

      const current = findMetric<CurrentMetricRecord>(metrics, "current");
      const derivative = findMetric<DerivativeMetricRecord>(metrics, "derivative");
      const threshold = findMetric<ThresholdMetricRecord>(metrics, "threshold");
      const subthreshold = findMetric<SubthresholdMetricRecord>(metrics, "subthreshold");
      const name = resolveSeriesName(series, index);

      return {
        currentCandidateWindows: current?.value.candidateWindows,
        currentMethod: current?.value.method ?? null,
        gmMaxAbs: derivative?.value.maxAbs ?? null,
        id: seriesId,
        ion: current?.value.ion ?? null,
        ionIoff: current?.value.ionIoff ?? null,
        ionWindow: current?.value.ionWindow,
        ioff: current?.value.ioff ?? null,
        ioffWindow: current?.value.ioffWindow,
        jon: null,
        legendHeader: name.header,
        name: name.value,
        ss: subthreshold?.value.ss ?? null,
        ssConfidence: subthreshold?.value.confidence ?? "fail",
        thresholdVoltage: threshold?.value.vth ?? null,
        thresholdVoltageElectron: threshold?.value.electron ?? null,
        thresholdVoltageHole: threshold?.value.hole ?? null,
        xAtGmMaxAbs: derivative?.value.xAtMaxAbs ?? null,
        xAtIon: current?.value.xAtIon ?? null,
        xAtIoff: current?.value.xAtIoff ?? null,
        xAtSs: subthreshold?.value.xAtSs ?? null,
      };
    })
    .filter((row): row is ParameterRow => Boolean(row));
};

const resolveMetricsForSeries = (
  file: FileRecord,
  seriesId: string,
): MetricRecord[] => {
  const keys = file.metricsBySeriesId?.[seriesId];
  if (keys?.length) {
    return keys
      .map((key) => file.metricsByKey[key])
      .filter((metric): metric is MetricRecord => Boolean(metric));
  }

  return Object.values(file.metricsByKey).filter(
    (metric) => metric.seriesId === seriesId,
  );
};

const findMetric = <T extends MetricRecord>(
  metrics: readonly MetricRecord[],
  family: T["metricFamily"],
): T | undefined =>
  metrics.find((metric): metric is T => metric.metricFamily === family);

const resolveRecordIvMode = (file: FileRecord): "transfer" | "output" | null => {
  for (const curve of Object.values(file.curvesByKey)) {
    if (curve.curveGeneration === "base" && curve.curveFamily === "iv") {
      return normalizeBaseIvMode(curve);
    }
  }

  return null;
};

const normalizeBaseIvMode = (
  curve: BaseCurveRecord,
): "transfer" | "output" | null =>
  curve.ivMode === "transfer" || curve.ivMode === "output"
    ? curve.ivMode
    : null;

const resolveSeriesName = (
  series: SeriesRecord | undefined,
  index: number,
): { header: string | null; value: string } => {
  for (const candidate of [series?.labelOverride, series?.legendValue, series?.name]) {
    const parsedLegend = parseLegendValue(String(candidate ?? "").trim());
    if (parsedLegend) {
      return parsedLegend;
    }
    if (candidate) {
      return {
        header: null,
        value: String(candidate),
      };
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

