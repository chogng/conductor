import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import type { PlotMainLayout } from "src/cs/workbench/contrib/plot/common/plotMainLayout";
import type { PlotMainChartProps } from "src/cs/workbench/contrib/plot/browser/plotMainChart";

const DEFAULT_TICK_LABEL_FONT_SIZE = 11;

export const resolveLabelWithUnit = (
  label: unknown,
  unit: unknown,
  fallback: string,
): string => {
  const text = String(label ?? "").trim() || fallback;
  const unitText = String(unit ?? "").trim();
  if (!unitText || text.includes("(")) return text;
  return `${text} (${unitText})`;
};

export const drawPlotAxis = (
  context: CanvasRenderingContext2D,
  layout: PlotMainLayout,
  props: PlotMainChartProps,
): void => {
  const { plotRect, scale, xMinorTicks, xTicks, yMinorTicks, yTicks } = layout;
  const tickFontSize = props.tickLabelFontSize ?? DEFAULT_TICK_LABEL_FONT_SIZE;

  context.save();
  context.strokeStyle = "rgba(100, 116, 139, 0.8)";
  context.lineWidth = 1;
  if (props.showMinorTicks !== false) {
    context.beginPath();
    for (const tick of xMinorTicks) {
      const x = scale.xToPixel(tick);
      if (!Number.isFinite(x)) continue;
      context.moveTo(x, plotRect.bottom);
      context.lineTo(x, plotRect.bottom + 4);
    }
    for (const tick of yMinorTicks) {
      const y = scale.yToPixel(tick);
      if (!Number.isFinite(y)) continue;
      context.moveTo(plotRect.left - 4, y);
      context.lineTo(plotRect.left, y);
    }
    context.stroke();
  }
  if (props.showMajorTicks !== false) {
    context.beginPath();
    for (const tick of xTicks) {
      const x = scale.xToPixel(tick);
      if (!Number.isFinite(x)) continue;
      context.moveTo(x, plotRect.bottom);
      context.lineTo(x, plotRect.bottom + 6);
    }
    for (const tick of yTicks) {
      const y = scale.yToPixel(tick);
      if (!Number.isFinite(y)) continue;
      context.moveTo(plotRect.left - 6, y);
      context.lineTo(plotRect.left, y);
    }
    context.stroke();
  }

  context.fillStyle = "rgba(71, 85, 105, 0.95)";
  context.font = `${tickFontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const tick of xTicks) {
    const x = scale.xToPixel(tick);
    if (!Number.isFinite(x)) continue;
    context.fillText(formatNumber(tick * props.plotXFactor, { digits: props.xTickDigits }), x, plotRect.bottom + 8);
  }
  context.textAlign = "right";
  context.textBaseline = "middle";
  const yDigits = Math.max(2, Math.min(6, props.xTickDigits));
  for (const tick of yTicks) {
    const y = scale.yToPixel(tick);
    if (!Number.isFinite(y)) continue;
    context.fillText(formatNumber(tick * props.plotYFactor, { digits: yDigits }), plotRect.left - 8, y);
  }

  context.restore();
};
