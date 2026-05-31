import { jsx, jsxs } from "react/jsx-runtime";
import { memo } from "react";
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
const SsSummaryStrip = memo(function SsSummaryStrip({ summary, }: SsSummaryStripProps) {
    return (jsxs("div", {
        className: "bg-bg-page border border-border rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-xs",
        children: [
            jsx("span", {
                className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${summary.confidence === "high"
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : summary.confidence === "low"
                        ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        : "bg-red-500/10 text-red-500 border-red-500/20"}`,
                title: `method=${summary.method} reason=${summary.reason}`,
                children: String(summary.confidence).toUpperCase()
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "method:",
                    jsx("span", {
                        className: "text-text-primary font-mono",
                        children: summary.method
                    })
                ]
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "SS:",
                    " ",
                    jsx("span", {
                        className: "text-text-primary font-mono",
                        children: summary.ss !== null ? `${formatNumber(summary.ss, { digits: 2 })} mV/dec` : "-"
                    })
                ]
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "R2:",
                    " ",
                    jsx("span", {
                        className: "text-text-primary font-mono",
                        children: summary.r2 !== null ? formatNumber(summary.r2, { digits: 4 }) : "-"
                    })
                ]
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "span:",
                    " ",
                    jsxs("span", {
                        className: "text-text-primary font-mono",
                        children: [
                            summary.span !== null ? formatNumber(summary.span, { digits: 2 }) : "-",
                            "dec"
                        ]
                    })
                ]
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "N:",
                    " ",
                    jsx("span", {
                        className: "text-text-primary font-mono",
                        children: summary.n !== null ? String(summary.n) : "-"
                    })
                ]
            }),
            jsxs("span", {
                className: "text-text-secondary",
                children: [
                    "range:",
                    " ",
                    jsx("span", {
                        className: "text-text-primary font-mono",
                        children: summary.x1 !== null && summary.x2 !== null
                            ? `[${formatNumber(summary.x1, { digits: 4 })}, ${formatNumber(summary.x2, { digits: 4 })}]`
                            : "-"
                    })
                ]
            }),
            summary.reason && summary.reason !== "ok" ? (jsxs("span", {
                className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${summary.confidence === "fail"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}`,
                title: summary.reason,
                children: [
                    "reason:",
                    jsx("span", {
                        className: "font-mono",
                        children: summary.reason
                    })
                ]
            })) : null,
            summary.suggestedRange ? (jsxs("span", {
                className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
                children: [
                    "suggested:",
                    " ",
                    jsxs("span", {
                        className: "font-mono",
                        children: [
                            "[",
                            formatNumber(summary.suggestedRange.x1, { digits: 4 }),
                            ",",
                            " ",
                            formatNumber(summary.suggestedRange.x2, { digits: 4 }),
                            "]"
                        ]
                    })
                ]
            })) : null
        ]
    }));
});
SsSummaryStrip.displayName = "SsSummaryStrip";
export default SsSummaryStrip;
