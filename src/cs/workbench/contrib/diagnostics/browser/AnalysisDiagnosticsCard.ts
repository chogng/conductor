import { jsx, jsxs } from "react/jsx-runtime";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";
import Card from "cs/base/browser/ui/card/card";
import Input from "cs/base/browser/ui/input/input";
import DropdownField from "cs/base/browser/ui/dropdownField/dropdownField";
type AnalysisDiagnosticsCardProps = {
    showDiagnosticsPanel: boolean;
    diagnosticsHeading: string;
    diagnosticsDescription: string;
    diagnosticsContextBadges?: Array<{
        color?: string | null;
        text: string;
    }>;
    plotYUnitLabel: string;
    showCurveProbePanel: boolean;
    plotXFactor: number;
    curveProbeXPlaceholder: string;
    curveProbeXInput: string;
    setCurveProbeXInput: (value: string) => void;
    curveProbeMode: "linear" | "log";
    setCurveProbeMode: (value: "linear" | "log") => void;
    curveProbeRows: any[];
    xTooltipDigits: number;
    resolvedXUnitLabel: string;
    showAreaDiagnosticsControls: boolean;
    areaInput: string;
    setAreaInput: (value: string) => void;
    areaDiagnosticsSummary: {
        areaValue: number | null;
        jon: number | null;
        joff: number | null;
    };
    transferMetricsApplicable: boolean;
    analysisCompactInputWrapperClass: string;
    analysisCompactInputClass: string;
    analysisCompactPageFieldClass: string;
};
export default function AnalysisDiagnosticsCard({ showDiagnosticsPanel, diagnosticsHeading, diagnosticsDescription, diagnosticsContextBadges = [], plotYUnitLabel, showCurveProbePanel, plotXFactor, curveProbeXPlaceholder, curveProbeXInput, setCurveProbeXInput, curveProbeMode, setCurveProbeMode, curveProbeRows, xTooltipDigits, resolvedXUnitLabel, showAreaDiagnosticsControls, areaInput, setAreaInput, areaDiagnosticsSummary, transferMetricsApplicable, analysisCompactInputWrapperClass, analysisCompactInputClass, analysisCompactPageFieldClass, }: AnalysisDiagnosticsCardProps) {
    const formatProbeModeLabel = (kindRaw: unknown): string => {
        const kind = String(kindRaw ?? "");
        if (kind === "exact")
            return "\u547d\u4e2d";
        if (kind === "interpolated")
            return "\u63d2\u503c";
        if (kind === "outOfRange")
            return "\u8d85\u51fa";
        return "\u65e0\u6cd5\u8ba1\u7b97";
    };
    if (!showDiagnosticsPanel)
        return null;
    const renderDiagnosticsContextBadges = () => {
        if (!diagnosticsContextBadges.length)
            return null;
        return (jsx("div", {
            className: "flex max-w-full items-center justify-end gap-3 flex-wrap text-xs text-text-secondary",
            children: diagnosticsContextBadges.map((badge, index) => (jsx("div", {
                key: `${badge.text}-${index}`,
                className: "max-w-full",
                title: badge.text,
                children: jsxs("span", {
                    className: "flex items-center gap-2.5",
                    children: [
                        badge.color ? (jsx("span", {
                            className: "inline-block h-3 w-3 shrink-0 rounded-sm",
                            style: { backgroundColor: badge.color }
                        })) : null,
                        jsx("span", {
                            className: "block truncate",
                            children: badge.color ? badge.text : `${badge.text}：`
                        })
                    ]
                })
            })))
        }));
    };
    return (jsxs(Card, {
        variant: "panel",
        className: "flex min-w-0 flex-col",
        children: [
            !showCurveProbePanel || showAreaDiagnosticsControls ? (jsxs("div", {
                className: "mb-3 flex items-center justify-between gap-2",
                children: [
                    jsxs("div", {
                        children: [
                            jsx("div", {
                                className: "text-xs font-semibold text-text-primary",
                                children: diagnosticsHeading
                            }),
                            jsx("div", {
                                className: "text-[11px] text-text-secondary",
                                children: diagnosticsDescription
                            })
                        ]
                    }),
                    renderDiagnosticsContextBadges()
                ]
            })) : null,
            jsxs("div", {
                className: "flex flex-col gap-3",
                children: [
                    showCurveProbePanel ? (jsxs("div", {
                        className: "flex flex-col gap-2 text-xs text-text-secondary",
                        children: [
                            jsxs("div", {
                                className: "flex items-center justify-between gap-3 flex-wrap",
                                children: [
                                    jsxs("div", {
                                        className: "flex items-center gap-2 flex-wrap",
                                        children: [
                                            jsx("span", {
                                                className: "whitespace-nowrap",
                                                children: "x:"
                                            }),
                                            jsx(Input, {
                                                id: "analysis-curve-probe-x-input",
                                                value: curveProbeXInput,
                                                onChange: setCurveProbeXInput,
                                                placeholder: curveProbeXPlaceholder,
                                                className: analysisCompactInputWrapperClass,
                                                fieldClassName: `${analysisCompactPageFieldClass} !w-[110px]`,
                                                inputClassName: analysisCompactInputClass
                                            }),
                                            jsx("span", {
                                                className: "whitespace-nowrap",
                                                children: "\u63d2\u503c:"
                                            }),
                                            jsx(DropdownField, {
                                                id: "analysis-curve-probe-mode-select",
                                                size: "sm",
                                                value: curveProbeMode,
                                                onChange: (next: any) => setCurveProbeMode(next === "log" ? "log" : "linear"),
                                                options: [
                                                    { value: "linear", label: "\u7ebf\u6027" },
                                                    { value: "log", label: "\u5bf9\u6570" },
                                                ],
                                                className: "w-[96px]"
                                            })
                                        ]
                                    }),
                                    renderDiagnosticsContextBadges()
                                ]
                            }),
                            curveProbeXInput.trim() ? (jsx("div", {
                                className: "overflow-x-auto rounded-lg border border-border/60 bg-bg-page/60",
                                children: jsxs("table", {
                                    className: "w-full min-w-[520px] table-fixed border-collapse text-xs",
                                    children: [
                                        jsx("thead", {
                                            children: jsxs("tr", {
                                                className: "border-b border-border text-text-secondary",
                                                children: [
                                                    jsx("th", {
                                                        className: "p-2 text-left font-semibold",
                                                        children: "\u66f2\u7ebf"
                                                    }),
                                                    jsx("th", {
                                                        className: "p-2 text-left font-semibold",
                                                        children: "\u5bf9\u5e94 y"
                                                    }),
                                                    jsx("th", {
                                                        className: "p-2 text-left font-semibold",
                                                        children: "\u5907\u6ce8"
                                                    }),
                                                    jsx("th", {
                                                        className: "p-2 text-left font-semibold",
                                                        children: "\u53c2\u8003\u70b9"
                                                    })
                                                ]
                                            })
                                        }),
                                        jsx("tbody", {
                                            children: curveProbeRows.map((row) => {
                                                const sample = row?.sample ?? null;
                                                const kind = String(sample?.kind ?? "empty");
                                                const yValue = Number(sample?.y);
                                                const left = sample?.left ?? null;
                                                const right = sample?.right ?? null;
                                                const bracketText = Number.isFinite(left?.x) && Number.isFinite(right?.x)
                                                    ? `[${formatNumber(left.x * plotXFactor, {
                                                        digits: xTooltipDigits,
                                                    })}, ${formatNumber(right.x * plotXFactor, {
                                                        digits: xTooltipDigits,
                                                    })}] ${resolvedXUnitLabel}`
                                                    : "n/a";
                                                return (jsxs("tr", {
                                                    key: row.id,
                                                    className: "border-b border-border/50 last:border-b-0",
                                                    children: [
                                                        jsx("td", {
                                                            className: "p-2 text-text-primary",
                                                            children: jsxs("span", {
                                                                className: "inline-flex items-center gap-2",
                                                                children: [
                                                                    jsx("span", {
                                                                        className: "inline-block h-2.5 w-2.5 rounded-sm",
                                                                        style: { backgroundColor: row.color }
                                                                    }),
                                                                    jsx("span", {
                                                                        children: row.name
                                                                    })
                                                                ]
                                                            })
                                                        }),
                                                        jsx("td", {
                                                            className: "p-2 text-text-primary",
                                                            children: Number.isFinite(yValue)
                                                                ? `${formatNumber(yValue, {
                                                                    digits: 6,
                                                                })} ${plotYUnitLabel}`
                                                                : "n/a"
                                                        }),
                                                        jsx("td", {
                                                            className: "p-2",
                                                            children: formatProbeModeLabel(kind)
                                                        }),
                                                        jsx("td", {
                                                            className: "p-2",
                                                            children: bracketText
                                                        })
                                                    ]
                                                }));
                                            })
                                        })
                                    ]
                                })
                            })) : null
                        ]
                    })) : null,
                    showAreaDiagnosticsControls ? (jsxs("div", {
                        className: "rounded-lg border border-border/60 bg-bg-surface px-3 py-2",
                        children: [
                            jsx("div", {
                                className: "mb-2 text-[11px] font-semibold text-text-primary",
                                children: "J Controls"
                            }),
                            jsxs("div", {
                                className: "flex items-center gap-2 text-xs text-text-secondary flex-wrap",
                                children: [
                                    jsx("span", {
                                        className: "whitespace-nowrap",
                                        children: "Area (for J = |I|/Area):"
                                    }),
                                    jsx(Input, {
                                        id: "analysis-area-input",
                                        value: areaInput,
                                        onChange: setAreaInput,
                                        placeholder: "e.g. 1e-4",
                                        className: analysisCompactInputWrapperClass,
                                        fieldClassName: `${analysisCompactPageFieldClass} !w-[100px]`,
                                        inputClassName: analysisCompactInputClass
                                    })
                                ]
                            }),
                            jsxs("div", {
                                className: "mt-2 flex flex-col gap-2 text-xs text-text-secondary",
                                children: [
                                    areaDiagnosticsSummary.areaValue !== null ? (jsxs("div", {
                                        className: "rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary",
                                        children: [
                                            "Using area:",
                                            " ",
                                            formatNumber(areaDiagnosticsSummary.areaValue, { digits: 4 }),
                                            " ",
                                            "cm^2"
                                        ]
                                    })) : (jsx("div", {
                                        className: "rounded-lg border border-dashed border-amber-400/60 bg-amber-500/5 px-3 py-2 text-amber-600",
                                        children: "Enter a positive area to enable current-density conversion."
                                    })),
                                    areaDiagnosticsSummary.areaValue !== null &&
                                        transferMetricsApplicable ? (jsxs("div", {
                                        className: "rounded-lg border border-border/60 bg-bg-page/60 px-3 py-2 text-text-primary",
                                        children: [
                                            "Jon:",
                                            " ",
                                            areaDiagnosticsSummary.jon !== null
                                                ? formatNumber(areaDiagnosticsSummary.jon, { digits: 3 })
                                                : "n/a",
                                            " ",
                                            plotYUnitLabel,
                                            "/cm^2",
                                            " | ",
                                            "Joff:",
                                            " ",
                                            areaDiagnosticsSummary.joff !== null
                                                ? formatNumber(areaDiagnosticsSummary.joff, { digits: 3 })
                                                : "n/a",
                                            " ",
                                            plotYUnitLabel,
                                            "/cm^2"
                                        ]
                                    })) : null
                                ]
                            })
                        ]
                    })) : null
                ]
            })
        ]
    }));
}
