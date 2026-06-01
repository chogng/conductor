import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";

type SsSummary = {
  confidence: string;
  method: string;
  reason: string;
  ss: number | null;
  r2: number | null;
  span: number | null;
  n: number | null;
  x1: number | null;
  x2: number | null;
  suggestedRange?: {
    x1: number;
    x2: number;
  } | null;
};

type SsSummaryStripProps = {
  summary: SsSummary;
};

const SsSummaryStrip = ({ summary }: SsSummaryStripProps): any =>
  createSsSummaryStrip(summary);

export const createSsSummaryStrip = (summary: SsSummary): HTMLElement => {
  const root = document.createElement("div");
  root.className = "ss_summary_strip";

  root.append(
    createConfidenceBadge(summary),
    createMetric("method:", summary.method),
    createMetric(
      "SS:",
      summary.ss !== null ? `${formatNumber(summary.ss, { digits: 2 })} mV/dec` : "-",
    ),
    createMetric(
      "R2:",
      summary.r2 !== null ? formatNumber(summary.r2, { digits: 4 }) : "-",
    ),
    createMetric(
      "span:",
      `${summary.span !== null ? formatNumber(summary.span, { digits: 2 }) : "-"}dec`,
    ),
    createMetric("N:", summary.n !== null ? String(summary.n) : "-"),
    createMetric(
      "range:",
      summary.x1 !== null && summary.x2 !== null
        ? `[${formatNumber(summary.x1, { digits: 4 })}, ${formatNumber(summary.x2, { digits: 4 })}]`
        : "-",
    ),
  );

  if (summary.reason && summary.reason !== "ok") {
    root.append(createReasonBadge(summary));
  }

  if (summary.suggestedRange) {
    root.append(createSuggestedRangeBadge(summary.suggestedRange));
  }

  return root;
};

const createConfidenceBadge = (summary: SsSummary): HTMLElement => {
  const badge = document.createElement("span");
  badge.className = `ss_summary_badge ${getConfidenceClassName(summary.confidence)}`;
  badge.title = `method=${summary.method} reason=${summary.reason}`;
  badge.textContent = String(summary.confidence).toUpperCase();
  return badge;
};

const getConfidenceClassName = (confidence: string): string => {
  if (confidence === "high") {
    return "ss_summary_badge--high";
  }
  if (confidence === "low") {
    return "ss_summary_badge--low";
  }
  return "ss_summary_badge--fail";
};

const createMetric = (label: string, value: string): HTMLElement => {
  const root = document.createElement("span");
  root.className = "ss_summary_metric";
  root.append(label, " ");

  const metric = document.createElement("span");
  metric.className = "ss_summary_metric_value";
  metric.textContent = value;
  root.append(metric);
  return root;
};

const createReasonBadge = (summary: SsSummary): HTMLElement => {
  const badge = document.createElement("span");
  badge.className =
    summary.confidence === "fail"
      ? "ss_summary_badge ss_summary_badge--fail"
      : "ss_summary_badge ss_summary_badge--low";
  badge.title = summary.reason;
  badge.append("reason:");

  const reason = document.createElement("span");
  reason.className = "ss_summary_badge_value";
  reason.textContent = summary.reason;
  badge.append(reason);
  return badge;
};

const createSuggestedRangeBadge = (range: { x1: number; x2: number }): HTMLElement => {
  const badge = document.createElement("span");
  badge.className = "ss_summary_badge ss_summary_badge--low";
  badge.append("suggested: ");

  const value = document.createElement("span");
  value.className = "ss_summary_badge_value";
  value.textContent = `[${formatNumber(range.x1, { digits: 4 })}, ${formatNumber(range.x2, { digits: 4 })}]`;
  badge.append(value);
  return badge;
};

export default SsSummaryStrip;
