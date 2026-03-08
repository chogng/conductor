// @ts-nocheck
import React, { useMemo } from "react";
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
import { formatNumber } from "../../lib/analysisMath";
import { COLORS } from "../../lib/chartColors";
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
} from "../../lib/analysisChartsUtils";

const MainPlotChart = React.memo(function MainPlotChart({
  plotType,
  activeFile,
  seriesList,
  axis,
  xDomain,
  xTicks,
  xTickDigits,
  xLabelInterval,
  yScaleMode,
  yTicksMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor,
  focusedSsOverlay,
  ssOverlayStyle,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) {
  const plotYKey = useMemo(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

  const autoMinMax = useMemo(
    () => computeMinMax(seriesList, { yKey: plotYKey }),
    [plotYKey, seriesList],
  );

  const autoMinY = autoMinMax?.minY ?? null;
  const autoMaxY = autoMinMax?.maxY ?? null;

  const effectiveYScale = useMemo(() => {
    if (yScaleMode === "linear") return "linear";
    if (autoMinY === null || autoMaxY === null) return "linear";
    if (autoMaxY <= 0) return "linear";
    return yScaleMode; // 'log' | 'logAbs'
  }, [autoMaxY, autoMinY, yScaleMode]);

  const yDomain = useMemo(() => {
    const auto =
      autoMinMax.minY === null || autoMinMax.maxY === null
        ? effectiveYScale === "linear"
          ? [0, 1]
          : [1e-3, 1]
        : effectiveYScale === "linear"
          ? padLinearDomain(autoMinMax.minY, autoMinMax.maxY)
          : padLogDomain(autoMinMax.minY, autoMinMax.maxY);

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
      return padLogDomain(min, max);
    }

    return padLinearDomain(min, max);
  }, [
    autoMinMax.maxY,
    autoMinMax.minY,
    axis?.yMax,
    axis?.yMin,
    effectiveYScale,
    plotYFactor,
  ]);

  const yTicks = useMemo(() => {
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
      return buildLogTicks(yDomain[0], yDomain[1], axis?.yDecadeStep);
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

  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(yTicks)
      ? yTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const yLabelInterval = useMemo(
    () => (effectiveYScale === "linear" ? computeLabelInterval(yTicks, 7) : 0),
    [effectiveYScale, yTicks],
  );

  const isSsPlot = plotType === "ss";

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
        margin={{ top: 5, right: 15, left: 45, bottom: 28 }}
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
            activeFile?.xLabel
              ? {
                value: activeFile.xLabel,
                position: "insideBottom",
                offset: -15,
                fill: "currentColor",
                opacity: 0.9,
                fontSize: 16,
                fontWeight: 500,
              }
              : undefined
          }
          tickFormatter={(v) => formatNumber(v, { digits: xTickDigits })}
          stroke="currentColor"
          className="text-text-secondary text-xs"
          tick={{ fill: "currentColor", opacity: 0.6 }}
          allowDataOverflow
        />
        <YAxis
          label={
            activeFile?.yLabel
              ? {
                value: activeFile.yLabel,
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
          scale={effectiveYScale === "linear" ? "linear" : "log"}
          domain={yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain}
          ticks={yTicks ?? undefined}
          interval={yLabelInterval}
          tickFormatter={(v) => {
            const scaled = v * plotYFactor;
            if (effectiveYScale !== "linear") {
              if (!Number.isFinite(scaled) || scaled === 0) return "0";
              const exp = Math.floor(Math.log10(Math.abs(scaled)));
              return `1e${exp}`;
            }
            return formatNumber(scaled, { digits: yTickDigits });
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
            `x=${formatNumber(label, { digits: xTickDigits })}`
          }
          formatter={(value, name) => {
            const num =
              typeof value === "number"
                ? value
                : value === null || value === undefined
                  ? NaN
                  : Number(value);
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
          width={120}
          wrapperStyle={{ right: 0, top: 0 }}
        />

        {isSsPlot && focusedFitLine ? (
          <Line
            data={focusedFitLine}
            dataKey="y"
            name="Fit"
            stroke={focusedSeriesColor}
            dot={false}
            isAnimationActive={false}
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeOpacity={0.7}
          />
        ) : null}

        {seriesList.map((series, idx) => (
          <Line
            key={series.id}
            data={series.data}
            dataKey={plotYKey}
            name={series.name}
            stroke={COLORS[idx % COLORS.length]}
            dot={false}
            isAnimationActive={false}
            strokeWidth={
              isSsPlot && focusedSeriesId && series.id === focusedSeriesId
                ? 2.5
                : 2
            }
            strokeOpacity={
              isSsPlot && focusedSeriesId && series.id !== focusedSeriesId
                ? 0.35
                : 1
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

MainPlotChart.displayName = "MainPlotChart";

export default MainPlotChart;
