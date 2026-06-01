import { getChartColor } from "src/cs/workbench/contrib/chart/browser/chartColors";

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

type DiagnosticsReferenceLine = {
  axis: "x" | "y";
  dash?: number[];
  opacity?: number;
  stroke: string;
  strokeWidth?: number;
  value: number;
};

const SsDiagnosticsChart = (props: SsDiagnosticsChartProps): any =>
  createSsDiagnosticsChart(props);

export const createSsDiagnosticsChart = ({
  overlay,
  overlayStyle,
  series,
  seriesColor = getChartColor(0),
  ssReferenceValue = null,
}: SsDiagnosticsChartProps): HTMLElement => {
  const referenceLines: DiagnosticsReferenceLine[] = [];
  if (overlay) {
    referenceLines.push(
      {
        axis: "x",
        opacity: overlayStyle.strokeOpacity,
        stroke: overlayStyle.stroke,
        strokeWidth: 2,
        value: Math.min(overlay.x1, overlay.x2),
      },
      {
        axis: "x",
        opacity: overlayStyle.strokeOpacity,
        stroke: overlayStyle.stroke,
        strokeWidth: 2,
        value: Math.max(overlay.x1, overlay.x2),
      },
    );
  }
  if (Number.isFinite(ssReferenceValue)) {
    referenceLines.push({
      axis: "y",
      dash: [4, 4],
      opacity: 0.35,
      stroke: seriesColor,
      value: Number(ssReferenceValue),
    });
  }

  const root = document.createElement("div");
  root.className = "diagnostics_chart_shell";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "SS diagnostics chart");
  root.dataset.seriesCount = String(series.length);
  root.dataset.referenceLineCount = String(referenceLines.length);
  root.dataset.yAxisLabel = "SS (mV/dec)";
  return root;
};

export default SsDiagnosticsChart;
