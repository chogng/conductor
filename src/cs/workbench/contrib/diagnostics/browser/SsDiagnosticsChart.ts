import { jsx } from "react/jsx-runtime";
import { memo, useMemo } from "react";
import { getChartColor } from "src/cs/workbench/contrib/chart/browser/chartColors";
import CanvasDiagnosticsChart from "./CanvasDiagnosticsChart";
type DiagnosticsPoint = {
    x?: number | null;
    y?: number | null;
    [key: string]: number | string | null | undefined;
};
type DiagnosticsSeries = {
    color?: string;
    data: DiagnosticsPoint[];
    id: string;
    lineName: string;
};
type SsOverlay = {
    x1: number;
    x2: number;
};
type SsOverlayStyle = {
    stroke: string;
    strokeOpacity: number;
};
type SsDiagnosticsChartProps = {
    series: DiagnosticsSeries[];
    axisTitleFontSize?: number;
    curveProbeX?: number | null;
    tickLabelFontSize?: number;
    xDomain: number[];
    xTicks?: number[] | null;
    xFactor?: number;
    xUnitLabel?: string;
    xLabelInterval: number;
    xTickDigits: number;
    xTooltipDigits: number;
    yDomain: number[];
    yTicks?: number[] | null;
    overlay?: SsOverlay | null;
    overlayStyle: SsOverlayStyle;
    ssReferenceValue?: number | null;
    seriesColor?: string;
    rightReservedWidth?: number;
};
const SsDiagnosticsChart = memo(function SsDiagnosticsChart({ series, axisTitleFontSize, curveProbeX, tickLabelFontSize, xDomain, xTicks, xFactor = 1, xUnitLabel = "V", xLabelInterval, xTickDigits, xTooltipDigits, yDomain, yTicks, overlay, overlayStyle, ssReferenceValue = null, seriesColor = getChartColor(0), rightReservedWidth = 135, }: SsDiagnosticsChartProps) {
    const referenceLines = useMemo(() => {
        const lines: Array<{
            axis: "x" | "y";
            dash?: number[];
            opacity?: number;
            stroke: string;
            strokeWidth?: number;
            value: number;
        }> = [];
        if (overlay) {
            lines.push({
                axis: "x",
                opacity: overlayStyle.strokeOpacity,
                stroke: overlayStyle.stroke,
                strokeWidth: 2,
                value: Math.min(overlay.x1, overlay.x2),
            }, {
                axis: "x",
                opacity: overlayStyle.strokeOpacity,
                stroke: overlayStyle.stroke,
                strokeWidth: 2,
                value: Math.max(overlay.x1, overlay.x2),
            });
        }
        if (Number.isFinite(ssReferenceValue)) {
            lines.push({
                axis: "y",
                dash: [4, 4],
                opacity: 0.35,
                stroke: seriesColor,
                value: Number(ssReferenceValue),
            });
        }
        return lines;
    }, [overlay, overlayStyle.stroke, overlayStyle.strokeOpacity, seriesColor, ssReferenceValue]);
    return (jsx(CanvasDiagnosticsChart, {
        ariaLabel: "SS diagnostics chart",
        axisTitleFontSize: axisTitleFontSize,
        locatorX: curveProbeX,
        referenceLines: referenceLines,
        rightReservedWidth: rightReservedWidth,
        series: series,
        tickLabelFontSize: tickLabelFontSize,
        valueUnitLabel: "mV/dec",
        xDomain: xDomain,
        xFactor: xFactor,
        xLabelInterval: xLabelInterval,
        xTickDigits: xTickDigits,
        xTicks: xTicks,
        xTooltipDigits: xTooltipDigits,
        xUnitLabel: xUnitLabel,
        yAxisLabel: "SS (mV/dec)",
        yDomain: yDomain,
        yTicks: yTicks,
        yTooltipMinDigits: 2
    }));
});
SsDiagnosticsChart.displayName = "SsDiagnosticsChart";
export default SsDiagnosticsChart;
