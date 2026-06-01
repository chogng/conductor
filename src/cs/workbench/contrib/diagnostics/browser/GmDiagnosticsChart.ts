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

const GmDiagnosticsChart = (props: GmDiagnosticsChartProps): any =>
  createGmDiagnosticsChart(props);

export const createGmDiagnosticsChart = ({
  referenceLines: extraReferenceLines = [],
  ...props
}: GmDiagnosticsChartProps): HTMLElement => {
  const referenceLines: DiagnosticsReferenceLine[] = [
    {
      axis: "y",
      dash: [4, 4],
      opacity: 0.4,
      stroke: "#94a3b8",
      value: 0,
    },
    ...extraReferenceLines,
  ];
  return createDiagnosticsChartShell({
    ariaLabel: "gm diagnostics chart",
    referenceLines,
    series: props.series,
    yAxisLabel: props.yAxisLabel,
  });
};

const createDiagnosticsChartShell = ({
  ariaLabel,
  referenceLines,
  series,
  yAxisLabel,
}: {
  readonly ariaLabel: string;
  readonly referenceLines: DiagnosticsReferenceLine[];
  readonly series: DiagnosticsSeries[];
  readonly yAxisLabel: string;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "diagnostics_chart_shell";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", ariaLabel);
  root.dataset.seriesCount = String(series.length);
  root.dataset.referenceLineCount = String(referenceLines.length);
  root.dataset.yAxisLabel = yAxisLabel;
  return root;
};

export default GmDiagnosticsChart;
