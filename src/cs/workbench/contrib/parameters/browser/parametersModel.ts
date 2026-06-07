import {
  createParameterRows,
  type CalculatedParameterRowData,
  type SsConfidence,
} from "src/cs/workbench/contrib/calculation/common/calculatedParameters";
import {
  isOutputLikeFile,
  isTransferLikeFile,
} from "src/cs/workbench/contrib/calculation/common/firstCalculation";
import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import { localize } from "src/cs/nls";
import type { CleanedEntry } from "src/cs/workbench/services/session/common/sessionTypes";

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
  activeFile: CleanedEntry | null,
): ParametersViewState => {
  if (!activeFile) {
    return {
      kind: "empty",
      message: localize("parameters_empty_no_data", "No parameter data."),
    };
  }

  const isTransfer = isTransferLikeFile(activeFile);
  const isOutput = isOutputLikeFile(activeFile);
  if (!isTransfer && !isOutput) {
    return {
      kind: "empty",
      message: localize("parameters_empty_unsupported_curve", "No parameters for this curve type."),
    };
  }

  const rows = createParameterRows(activeFile);
  if (rows.length === 0) {
    return {
      kind: "empty",
      message: localize("parameters_empty_no_rows", "No parameter rows."),
    };
  }

  return {
    gmMetricHeader: isTransfer ? "gm" : "gds",
    kind: "table",
    rows,
    showTransferMetrics: isTransfer,
  };
};
