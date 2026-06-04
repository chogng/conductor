import { localize } from "src/cs/nls";

export type DiagnosticsContextBadge = {
  color?: string;
  text: string;
};

export const createDiagnosticsContextBadges = ({
  effectivePlotType,
  focusedSeriesColor,
  focusedSeriesLabel,
  gmDiagnosticsEnabled,
  ssDiagnosticsEnabled,
}: {
  effectivePlotType: string;
  focusedSeriesColor?: string;
  focusedSeriesLabel?: unknown;
  gmDiagnosticsEnabled: boolean;
  ssDiagnosticsEnabled: boolean;
}): DiagnosticsContextBadge[] => {
  const focusedLabel = String(focusedSeriesLabel ?? "").trim();
  const labelKey =
    (effectivePlotType === "gm" && gmDiagnosticsEnabled) ||
    (effectivePlotType === "ss" && ssDiagnosticsEnabled)
      ? "chart_diagnostic_curve_label"
      : "chart_selected_curve_label";

  return [
    { text: localize(labelKey, labelKey) },
    {
      color: focusedSeriesColor,
      text: focusedLabel || localize("chart_current_curve_label", "current"),
    },
  ];
};
