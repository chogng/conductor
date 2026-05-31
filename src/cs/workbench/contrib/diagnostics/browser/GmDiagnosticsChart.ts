import { jsx } from "react/jsx-runtime";
import { memo, useMemo } from "react";
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
type DiagnosticsReferenceLine = {
    axis: "x" | "y";
    dash?: number[];
    opacity?: number;
    stroke: string;
    strokeWidth?: number;
    value: number;
};
type GmDiagnosticsChartProps = {
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
    rightReservedWidth?: number;
    yAxisLabel: string;
    valueUnitLabel?: string;
    referenceLines?: DiagnosticsReferenceLine[];
};
const GmDiagnosticsChart = memo(function GmDiagnosticsChart({ series, axisTitleFontSize, curveProbeX, tickLabelFontSize, xDomain, xTicks, xFactor = 1, xUnitLabel = "V", xLabelInterval, xTickDigits, xTooltipDigits, yDomain, yTicks, rightReservedWidth = 135, yAxisLabel, valueUnitLabel = "", referenceLines: extraReferenceLines = [], }: GmDiagnosticsChartProps) {
    const referenceLines = useMemo(() => [
        {
            axis: "y" as const,
            dash: [4, 4],
            opacity: 0.4,
            stroke: "#94a3b8",
            value: 0,
        },
        ...extraReferenceLines,
    ], [extraReferenceLines]);
    return (jsx(CanvasDiagnosticsChart, {
        ariaLabel: "gm diagnostics chart",
        axisTitleFontSize: axisTitleFontSize,
        locatorX: curveProbeX,
        referenceLines: referenceLines,
        rightReservedWidth: rightReservedWidth,
        series: series,
        tickLabelFontSize: tickLabelFontSize,
        valueUnitLabel: valueUnitLabel,
        xDomain: xDomain,
        xFactor: xFactor,
        xLabelInterval: xLabelInterval,
        xTickDigits: xTickDigits,
        xTicks: xTicks,
        xTooltipDigits: xTooltipDigits,
        xUnitLabel: xUnitLabel,
        yAxisLabel: yAxisLabel,
        yDomain: yDomain,
        yTicks: yTicks,
        yTooltipMinDigits: 3
    }));
});
GmDiagnosticsChart.displayName = "GmDiagnosticsChart";
export default GmDiagnosticsChart;
