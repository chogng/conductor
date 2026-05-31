import type { TranslateFn } from "src/cs/platform/language/common/language";

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
  t,
}: {
  effectivePlotType: string;
  focusedSeriesColor?: string;
  focusedSeriesLabel?: unknown;
  gmDiagnosticsEnabled: boolean;
  ssDiagnosticsEnabled: boolean;
  t: TranslateFn;
}): DiagnosticsContextBadge[] => {
  const focusedLabel = String(focusedSeriesLabel ?? "").trim();
  const labelKey =
    (effectivePlotType === "gm" && gmDiagnosticsEnabled) ||
    (effectivePlotType === "ss" && ssDiagnosticsEnabled)
      ? "da_chart_diagnostic_curve_label"
      : "da_chart_selected_curve_label";

  return [
    { text: t(labelKey) },
    {
      color: focusedSeriesColor,
      text: focusedLabel || t("da_chart_current_curve_label"),
    },
  ];
};
