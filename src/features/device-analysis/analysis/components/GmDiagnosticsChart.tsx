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

type DiagnosticsSeries = {
  color?: string;
  data: DiagnosticsPoint[];
  id: string;
  lineName: string;
};

type GmDiagnosticsChartProps = {
  series: DiagnosticsSeries[];
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
};

const GmDiagnosticsChart = memo(function GmDiagnosticsChart({
  series,
  xDomain,
  xTicks,
  xFactor = 1,
  xUnitLabel = "V",
  xLabelInterval,
  xTickDigits,
  xTooltipDigits,
  yDomain,
  yTicks,
  rightReservedWidth = 135,
  yAxisLabel,
  valueUnitLabel = "",
}: GmDiagnosticsChartProps) {
  const yTickDigits = inferTickDigitsFromTicks(yTicks);
  const yTooltipDigits = Math.max(3, yTickDigits);

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      minWidth={1}
      minHeight={1}
      className="!outline-none"
    >
      <LineChart
        data={[]}
        margin={{ top: 20, right: rightReservedWidth, left: 45, bottom: 20 }}
      >
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
            value: yAxisLabel,
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
            `${formatNumber(Number(value), { digits: yTooltipDigits })}${
              valueUnitLabel ? ` ${valueUnitLabel}` : ""
            }`,
            name,
          ]}
        />

        <ReferenceLine
          y={0}
          stroke="#94a3b8"
          strokeOpacity={0.4}
          strokeDasharray="4 4"
          ifOverflow="hidden"
        />

        {series.map((item) => (
          <Line
            key={item.id}
            data={item.data}
            dataKey="y"
            name={item.lineName}
            stroke={item.color || "#8884d8"}
            dot={false}
            isAnimationActive={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

GmDiagnosticsChart.displayName = "GmDiagnosticsChart";

export default GmDiagnosticsChart;
