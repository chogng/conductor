import { memo, useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../lib/analysisMath";
import { COLORS } from "../lib/chartColors";
import {
  buildLogTicks,
  buildNiceTicks,
  buildOriginAutoTicks,
  buildStepTicks,
  computeLabelInterval,
  computeMinMax,
  inferTickDigitsFromTicks,
  padLinearDomain,
  padLogDomain,
  parseOptionalNumber,
} from "../lib/analysisChartsUtils";

type AxisConfig = Partial<{
  yMin: number | string;
  yMax: number | string;
  yDecadeStep: number | string;
  yStep: number | string;
  yTickCount: number | string;
}>;

type PlotPoint = {
  x?: number;
  y?: number;
  yPositive?: number;
  yAbsPositive?: number;
  [key: string]: number | string | null | undefined;
};

type PlotSeries = {
  id: string;
  name: string;
  data: PlotPoint[];
};

type SsOverlay = {
  x1: number;
  x2: number;
};

type SsOverlayStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
};

type MainPlotChartProps = {
  plotType?: string;
  activeFile?: Partial<{
    xLabel: string;
    yLabel: string;
  }> | null;
  seriesList: PlotSeries[];
  axis?: AxisConfig;
  xDomain: [number, number];
  xTicks?: number[] | null;
  plotXFactor: number;
  plotXUnitLabel: string;
  xTickDigits: number;
  xTooltipDigits?: number;
  xLabelInterval: number;
  yScaleMode: "linear" | "log" | "logAbs";
  yTicksMode?: string;
  plotYFactor: number;
  plotYUnitLabel: string;
  focusedSeriesId?: string | null;
  focusedFitLine?: PlotPoint[] | null;
  focusedSeriesColor?: string;
  focusedSsOverlay?: SsOverlay | null;
  ssOverlayStyle: SsOverlayStyle;
  legendWidth?: number;
  legendContent?: any;
  onMouseDown?: (...args: unknown[]) => void;
  onMouseMove?: (...args: unknown[]) => void;
  onMouseUp?: (...args: unknown[]) => void;
};

const LOG_CHART_Y_DATA_KEY = "__chartY";

const toDomainTuple = (domain: number[]): [number, number] => [
  Number(domain?.[0] ?? 0),
  Number(domain?.[1] ?? 1),
];

const toLogChartValue = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.log10(num);
};

const formatLogTickLabel = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "0";
  const text = num.toExponential(2);
  return text.replace(/(?:\.0+|(\.\d*?[1-9])0+)e/, "$1e");
};

const withYAxisUnit = (
  labelRaw: string | null | undefined,
  unitRaw: string | null | undefined,
): string => {
  const label = String(labelRaw ?? "").trim();
  const unit = String(unitRaw ?? "").trim();
  if (!unit) return label;
  if (!label) return unit;
  if (/\([^()]+\)\s*$/.test(label)) {
    return label.replace(/\([^()]+\)\s*$/, `(${unit})`);
  }
  return `${label} (${unit})`;
};

const MainPlotChart = memo(function MainPlotChart({
  plotType,
  activeFile,
  seriesList,
  axis,
  xDomain,
  xTicks,
  plotXFactor,
  plotXUnitLabel,
  xTickDigits,
  xTooltipDigits,
  xLabelInterval,
  yScaleMode,
  yTicksMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor = "#8884d8",
  focusedSsOverlay,
  ssOverlayStyle,
  legendWidth = 120,
  legendContent = undefined,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: MainPlotChartProps) {
  const plotYKey = useMemo<"y" | "yPositive" | "yAbsPositive">(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

  const autoMinMax = useMemo(
    () => computeMinMax(seriesList, { yKey: plotYKey }),
    [plotYKey, seriesList],
  ) as { minY: number | null; maxY: number | null } | null;

  const autoMinY = autoMinMax?.minY ?? null;
  const autoMaxY = autoMinMax?.maxY ?? null;

  const effectiveYScale = useMemo(() => {
    if (yScaleMode === "linear") return "linear";
    if (autoMinY === null || autoMaxY === null) return "linear";
    if (autoMaxY <= 0) return "linear";
    return yScaleMode;
  }, [autoMaxY, autoMinY, yScaleMode]);

  const yDomain = useMemo<[number, number]>(() => {
    const minY = autoMinMax?.minY ?? null;
    const maxY = autoMinMax?.maxY ?? null;
    const auto: [number, number] =
      minY === null || maxY === null
        ? effectiveYScale === "linear"
          ? [0, 1]
          : [1e-3, 1]
        : effectiveYScale === "linear"
          ? toDomainTuple(padLinearDomain(minY, maxY))
          : toDomainTuple(padLogDomain(minY, maxY));

    const minUserRaw = parseOptionalNumber(axis?.yMin);
    const maxUserRaw = parseOptionalNumber(axis?.yMax);
    const minUser = minUserRaw !== null ? minUserRaw / plotYFactor : null;
    const maxUser = maxUserRaw !== null ? maxUserRaw / plotYFactor : null;

    let min = minUser ?? auto[0];
    let max = maxUser ?? auto[1];

    if (effectiveYScale !== "linear") {
      if (min <= 0) min = auto[0];
      if (max <= 0) max = auto[1];
      if (min <= 0 || max <= 0) return auto;
      return toDomainTuple(padLogDomain(min, max));
    }

    return toDomainTuple(padLinearDomain(min, max));
  }, [
    autoMinMax?.maxY,
    autoMinMax?.minY,
    axis?.yMax,
    axis?.yMin,
    effectiveYScale,
    plotYFactor,
  ]);

  const yTicks = useMemo<number[] | null>(() => {
    const mode = String(yTicksMode ?? "nice");
    if (mode === "auto") {
      if (effectiveYScale !== "linear") {
        const min = Number(yDomain?.[0]);
        const max = Number(yDomain?.[1]);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        if (!(hi > 0)) return null;
        const safeLo = lo > 0 ? lo : hi / 1000;
        const expMin = Math.floor(Math.log10(safeLo));
        const expMax = Math.ceil(Math.log10(hi));
        const decades = Math.max(1, expMax - expMin);
        const decadeStep = Math.max(1, Math.ceil(decades / 6));
        return buildLogTicks(yDomain[0], yDomain[1], decadeStep);
      }
      return buildOriginAutoTicks(yDomain[0], yDomain[1], 6);
    }

    if (effectiveYScale !== "linear") {
      if (mode !== "decades") return null;
      return buildLogTicks(
        yDomain[0],
        yDomain[1],
        parseOptionalNumber(axis?.yDecadeStep) ?? undefined,
      );
    }

    if (mode === "step") {
      const stepRaw = parseOptionalNumber(axis?.yStep);
      const step = stepRaw !== null ? stepRaw / plotYFactor : null;
      return step ? buildStepTicks(yDomain[0], yDomain[1], step) : null;
    }
    const count = Math.max(2, Math.floor(Number(axis?.yTickCount) || 6));
    return buildNiceTicks(yDomain[0], yDomain[1], count, {
      preferTightRange: false,
    });
  }, [
    axis?.yDecadeStep,
    axis?.yStep,
    axis?.yTickCount,
    effectiveYScale,
    plotYFactor,
    yDomain,
    yTicksMode,
  ]);

  const chartYDataKey = useMemo(
    () => (effectiveYScale === "linear" ? plotYKey : LOG_CHART_Y_DATA_KEY),
    [effectiveYScale, plotYKey],
  );

  const chartSeriesList = useMemo<PlotSeries[]>(() => {
    if (effectiveYScale === "linear") return seriesList;
    return seriesList.map((series) => ({
      ...series,
      data: Array.isArray(series?.data)
        ? series.data.map((point) => ({
            ...point,
            [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.[plotYKey]),
          }))
        : [],
    }));
  }, [effectiveYScale, plotYKey, seriesList]);

  const chartFocusedFitLine = useMemo<PlotPoint[] | null>(() => {
    if (!Array.isArray(focusedFitLine)) return null;
    if (effectiveYScale === "linear") return focusedFitLine;
    return focusedFitLine.map((point) => ({
      ...point,
      [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.y),
    }));
  }, [effectiveYScale, focusedFitLine]);

  const chartYTicks = useMemo<number[] | null>(() => {
    if (effectiveYScale === "linear") return yTicks;
    if (!Array.isArray(yTicks)) return null;
    const nextTicks = yTicks
      .map((tick) => toLogChartValue(tick))
      .filter((tick): tick is number => tick !== null);
    return nextTicks.length >= 2 ? nextTicks : null;
  }, [effectiveYScale, yTicks]);

  const chartYDomain = useMemo<[number, number]>(() => {
    if (effectiveYScale === "linear") {
      return yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain;
    }

    if (Array.isArray(chartYTicks) && chartYTicks.length >= 2) {
      return [chartYTicks[0], chartYTicks[chartYTicks.length - 1]];
    }

    const lo = Math.min(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const hi = Math.max(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const logLo = toLogChartValue(lo);
    const logHi = toLogChartValue(hi);
    if (logLo === null || logHi === null) return [0, 1];
    return [logLo, logHi];
  }, [chartYTicks, effectiveYScale, yDomain, yTicks]);

  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(chartYTicks)
      ? chartYTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [chartYTicks, effectiveYScale, plotYFactor]);

  const yAxisNearZeroEpsilon = useMemo(() => {
    if (effectiveYScale !== "linear") return 0;
    const scaledTickStep =
      Array.isArray(yTicks) && yTicks.length >= 2
        ? Math.abs((Number(yTicks[1]) - Number(yTicks[0])) * plotYFactor)
        : 0;
    if (!Number.isFinite(scaledTickStep) || scaledTickStep <= 0) return 1e-18;
    // Keep only tiny floating-point residue around axis zero; do not alter meaningful small ticks.
    return Math.max(1e-18, scaledTickStep * 1e-9);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const yLabelInterval = useMemo(
    () =>
      effectiveYScale === "linear"
        ? computeLabelInterval(yTicks, 7)
        : computeLabelInterval(chartYTicks, 7),
    [chartYTicks, effectiveYScale, yTicks],
  );

  const isSsPlot = plotType === "ss";

  const yAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.yLabel, plotYUnitLabel),
    [activeFile?.yLabel, plotYUnitLabel],
  );
  const xAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.xLabel, plotXUnitLabel),
    [activeFile?.xLabel, plotXUnitLabel],
  );

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
        margin={{ top: 25, right: 15, left: 45, bottom: 28 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
        <XAxis
          dataKey="x"
          type="number"
          domain={xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : xDomain}
          ticks={xTicks ?? undefined}
          interval={xLabelInterval}
          label={
            xAxisLabel
              ? {
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -15,
                  fill: "currentColor",
                  opacity: 0.9,
                  fontSize: 16,
                  fontWeight: 500,
                }
              : undefined
          }
          tickFormatter={(v) => formatNumber(Number(v) * plotXFactor, { digits: xTickDigits })}
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <YAxis
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  offset: -15,
                  style: { textAnchor: "middle" },
                  fill: "currentColor",
                  opacity: 0.9,
                  fontSize: 16,
                  fontWeight: 500,
                }
              : undefined
          }
          type="number"
          scale="linear"
          domain={chartYDomain}
          ticks={chartYTicks ?? undefined}
          interval={yLabelInterval}
          tickFormatter={(v) => {
            if (effectiveYScale !== "linear") {
              const raw = Number.isFinite(Number(v)) ? Math.pow(10, Number(v)) : Number.NaN;
              return formatLogTickLabel(raw * plotYFactor);
            }
            const scaled = Number(v) * plotYFactor;
            const normalized =
              Math.abs(scaled) <= yAxisNearZeroEpsilon ? 0 : scaled;
            return formatNumber(normalized, { digits: yTickDigits });
          }}
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
            `x=${formatNumber(Number(label) * plotXFactor, {
              digits: xTooltipDigits ?? xTickDigits,
            })} ${plotXUnitLabel}`
          }
          formatter={(value, name, item: any) => {
            const rawFromPrimary = Number(item?.payload?.[plotYKey]);
            const rawFromY = Number(item?.payload?.y);
            const rawFromValue =
              effectiveYScale === "linear"
                ? Number(value)
                : Number.isFinite(Number(value))
                  ? Math.pow(10, Number(value))
                  : Number.NaN;
            const num = Number.isFinite(rawFromPrimary)
              ? rawFromPrimary
              : Number.isFinite(rawFromY)
                ? rawFromY
                : rawFromValue;
            return [
              `${formatNumber(num * plotYFactor, { digits: yTickDigits })} ${plotYUnitLabel}`,
              name,
            ];
          }}
        />

        {isSsPlot && focusedSsOverlay ? (
          <>
            <ReferenceArea
              x1={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              x2={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              fill={ssOverlayStyle.fill}
              fillOpacity={ssOverlayStyle.fillOpacity}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              stroke={ssOverlayStyle.stroke}
              strokeOpacity={ssOverlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
              stroke={ssOverlayStyle.stroke}
              strokeOpacity={ssOverlayStyle.strokeOpacity}
              strokeWidth={2}
              ifOverflow="hidden"
            />
          </>
        ) : null}

        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          width={legendWidth}
          wrapperStyle={{ right: 0, top: 0 }}
          content={legendContent}
        />

        {isSsPlot && focusedFitLine ? (
          <Line
            data={chartFocusedFitLine ?? undefined}
            dataKey={chartYDataKey}
            name="Fit"
            stroke={focusedSeriesColor}
            dot={false}
            isAnimationActive={false}
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeOpacity={0.7}
          />
        ) : null}

        {chartSeriesList.map((series, idx) => (
          <Line
            key={series.id}
            data={series.data}
            dataKey={chartYDataKey}
            name={series.name}
            stroke={COLORS[idx % COLORS.length]}
            dot={false}
            isAnimationActive={false}
            strokeWidth={
              isSsPlot && focusedSeriesId && series.id === focusedSeriesId ? 2.5 : 2
            }
            strokeOpacity={
              isSsPlot && focusedSeriesId && series.id !== focusedSeriesId ? 0.35 : 1
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

MainPlotChart.displayName = "MainPlotChart";

export default MainPlotChart;
