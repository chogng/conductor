import { memo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../lib/analysisMath";
import { inferTickDigitsFromTicks } from "../lib/analysisChartsUtils";

type DiagnosticsPoint = {
  x?: number | null;
  y?: number | null;
  [key: string]: number | string | null | undefined;
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
  data: DiagnosticsPoint[];
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
};

const SsDiagnosticsChart = memo(function SsDiagnosticsChart({
  data,
  xDomain,
  xTicks,
  xFactor = 1,
  xUnitLabel = "V",
  xLabelInterval,
  xTickDigits,
  xTooltipDigits,
  yDomain,
  yTicks,
  overlay,
  overlayStyle,
  ssReferenceValue = null,
  seriesColor = "#8884d8",
}: SsDiagnosticsChartProps) {
  const yTickDigits = inferTickDigitsFromTicks(yTicks);
  const yTooltipDigits = Math.max(2, yTickDigits);

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      minWidth={1}
      minHeight={1}
      className="!outline-none"
    >
      <LineChart data={[]} margin={{ top: 20, right: 135, left: 45, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
        <XAxis
          dataKey="x"
          type="number"
          domain={xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : xDomain}
          ticks={xTicks ?? undefined}
          interval={xLabelInterval}
          tickFormatter={(v) =>
            formatNumber(Number(v) * xFactor, { digits: xTickDigits })
          }
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <YAxis
          label={{
            value: "SS (mV/dec)",
            angle: -90,
            position: "insideLeft",
            offset: -15,
            style: { textAnchor: "middle" as const },
            fill: "currentColor",
            opacity: 0.9,
            fontSize: 14,
            fontWeight: 500,
          }}
          type="number"
          scale="linear"
          domain={yDomain}
          ticks={yTicks ?? undefined}
          interval={0}
          tickFormatter={(v) => formatNumber(v, { digits: yTickDigits })}
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e1e1e",
            borderColor: "#333",
            color: "#fff",
          }}
          itemStyle={{ color: "#ccc" }}
          labelFormatter={(label) =>
            `x=${formatNumber(Number(label) * xFactor, {
              digits: xTooltipDigits,
            })} ${xUnitLabel}`
          }
          formatter={(value, name) => [
            `${formatNumber(Number(value), { digits: yTooltipDigits })} mV/dec`,
            name,
          ]}
        />

        {overlay ? (
          <>
            <ReferenceLine
              x={Math.min(overlay.x1, overlay.x2)}
              stroke={overlayStyle.stroke}
              strokeOpacity={overlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={Math.max(overlay.x1, overlay.x2)}
              stroke={overlayStyle.stroke}
              strokeOpacity={overlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
          </>
        ) : null}

        {Number.isFinite(ssReferenceValue) ? (
          <ReferenceLine
            y={Number(ssReferenceValue)}
            stroke={seriesColor}
            strokeOpacity={0.35}
            strokeDasharray="4 4"
            ifOverflow="hidden"
          />
        ) : null}

        <Line
          data={data}
          dataKey="y"
          name="SS(x)"
          stroke={seriesColor}
          dot={false}
          isAnimationActive={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

SsDiagnosticsChart.displayName = "SsDiagnosticsChart";

export default SsDiagnosticsChart;
