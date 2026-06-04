import {
  createParameterRows,
  type CalculatedParameterRowData,
  type SsConfidence,
} from "src/cs/workbench/contrib/calculation/common/calculatedParameters";
import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";

export {
  createParameterRows,
  type CalculatedParameterRowData,
  type SsConfidence,
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
