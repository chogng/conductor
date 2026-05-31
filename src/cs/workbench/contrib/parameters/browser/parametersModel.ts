import { formatNumber } from "../../diagnostics/common/numberFormat.ts";

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
