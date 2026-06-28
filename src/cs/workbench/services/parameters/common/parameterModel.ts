/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import { localize } from "src/cs/nls";

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

export type ParametersFileRecord = {
  readonly id?: string;
  readonly curvesByKey: Readonly<Record<string, ParametersCurveRecord>>;
  readonly metricsByKey: Readonly<Record<string, ParametersMetricRecord>>;
  readonly metricsBySeriesId?: Readonly<Record<string, readonly string[]>>;
  readonly seriesById: Readonly<Record<string, ParametersSeriesRecord>>;
  readonly seriesOrder: readonly string[];
};

export type ParametersCurveRecord = {
  readonly curveFamily?: string;
  readonly curveGeneration?: string;
  readonly ivMode?: string | null;
};

export type ParametersMetricFamily =
  | "current"
  | "derivative"
  | "threshold"
  | "subthreshold";

export type ParametersMetricRecord = {
  readonly metricFamily: ParametersMetricFamily | string;
  readonly seriesId: string;
  readonly value: ParametersMetricValue;
};

export type ParametersMetricValue = {
  readonly candidateWindows?: unknown[];
  readonly confidence?: SsConfidence | null;
  readonly electron?: number | null;
  readonly hole?: number | null;
  readonly ion?: number | null;
  readonly ionIoff?: number | null;
  readonly ionWindow?: unknown;
  readonly ioff?: number | null;
  readonly ioffWindow?: unknown;
  readonly maxAbs?: number | null;
  readonly method?: string | null;
  readonly ss?: number | null;
  readonly vth?: number | null;
  readonly xAtIon?: number | null;
  readonly xAtIoff?: number | null;
  readonly xAtMaxAbs?: number | null;
  readonly xAtSs?: number | null;
};

export type ParametersSeriesRecord = {
  readonly labelOverride?: string | null;
  readonly legendValue?: string | null;
  readonly name?: string | null;
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
  _activeFile: unknown | null,
  activeFileRecord?: ParametersFileRecord | null,
): ParametersViewState => {
  const canonicalState = activeFileRecord
    ? createParametersViewStateFromFileRecord(activeFileRecord)
    : null;
  if (canonicalState?.kind === "table" || !_activeFile) {
    return canonicalState ?? {
      kind: "empty",
      message: localize("parameters.empty.noData", "No parameter data."),
    };
  }

  return {
    kind: "empty",
    message: localize("parameters.empty.noData", "No parameter data."),
  };
};

const createParametersViewStateFromFileRecord = (
  file: ParametersFileRecord,
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

type ParameterRow = CalculatedParameterRowData & { id?: unknown };

const createParameterRowsFromMetrics = (
  file: ParametersFileRecord,
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

      const current = findMetric(metrics, "current");
      const derivative = findMetric(metrics, "derivative");
      const threshold = findMetric(metrics, "threshold");
      const subthreshold = findMetric(metrics, "subthreshold");
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
  file: ParametersFileRecord,
  seriesId: string,
): ParametersMetricRecord[] => {
  const keys = file.metricsBySeriesId?.[seriesId];
  if (keys?.length) {
    return keys
      .map((key) => file.metricsByKey[key])
      .filter((metric): metric is ParametersMetricRecord => Boolean(metric));
  }

  return Object.values(file.metricsByKey).filter(
    (metric) => metric.seriesId === seriesId,
  );
};

const findMetric = (
  metrics: readonly ParametersMetricRecord[],
  family: ParametersMetricFamily,
): ParametersMetricRecord | undefined =>
  metrics.find((metric) => metric.metricFamily === family);

const resolveRecordIvMode = (file: ParametersFileRecord): "transfer" | "output" | null => {
  for (const curve of Object.values(file.curvesByKey)) {
    if (curve.curveGeneration === "base" && curve.curveFamily === "iv") {
      return normalizeBaseIvMode(curve);
    }
  }

  return null;
};

const normalizeBaseIvMode = (
  curve: ParametersCurveRecord,
): "transfer" | "output" | null =>
  curve.ivMode === "transfer" || curve.ivMode === "output"
    ? curve.ivMode
    : null;

const resolveSeriesName = (
  series: ParametersSeriesRecord | undefined,
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
