import { memo } from "react";
import { formatNumber } from "../lib/analysisMath";

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

const SsSummaryStrip = memo(function SsSummaryStrip({
  summary,
}: SsSummaryStripProps) {
  return (
    <div className="bg-bg-page border border-border rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
          summary.confidence === "high"
            ? "bg-green-500/10 text-green-500 border-green-500/20"
            : summary.confidence === "low"
              ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
              : "bg-red-500/10 text-red-500 border-red-500/20"
        }`}
        title={`method=${summary.method} reason=${summary.reason}`}
      >
        {String(summary.confidence).toUpperCase()}
      </span>

      <span className="text-text-secondary">
        method: <span className="text-text-primary font-mono">{summary.method}</span>
      </span>

      <span className="text-text-secondary">
        SS:{" "}
        <span className="text-text-primary font-mono">
          {summary.ss !== null ? `${formatNumber(summary.ss, { digits: 2 })} mV/dec` : "-"}
        </span>
      </span>

      <span className="text-text-secondary">
        R2:{" "}
        <span className="text-text-primary font-mono">
          {summary.r2 !== null ? formatNumber(summary.r2, { digits: 4 }) : "-"}
        </span>
      </span>

      <span className="text-text-secondary">
        span:{" "}
        <span className="text-text-primary font-mono">
          {summary.span !== null ? formatNumber(summary.span, { digits: 2 }) : "-"} dec
        </span>
      </span>

      <span className="text-text-secondary">
        N:{" "}
        <span className="text-text-primary font-mono">
          {summary.n !== null ? String(summary.n) : "-"}
        </span>
      </span>

      <span className="text-text-secondary">
        range:{" "}
        <span className="text-text-primary font-mono">
          {summary.x1 !== null && summary.x2 !== null
            ? `[${formatNumber(summary.x1, { digits: 4 })}, ${formatNumber(summary.x2, { digits: 4 })}]`
            : "-"}
        </span>
      </span>

      {summary.confidence === "fail" ? (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"
          title={summary.reason}
        >
          reason: <span className="font-mono">{summary.reason}</span>
        </span>
      ) : null}

      {summary.suggestedRange ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
          suggested:{" "}
          <span className="font-mono">
            [{formatNumber(summary.suggestedRange.x1, { digits: 4 })},{" "}
            {formatNumber(summary.suggestedRange.x2, { digits: 4 })}]
          </span>
        </span>
      ) : null}
    </div>
  );
});

SsSummaryStrip.displayName = "SsSummaryStrip";

export default SsSummaryStrip;
