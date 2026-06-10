/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Draws x and y grid lines for the plot area on the main chart canvas.
import type { PlotMainLayout } from "src/cs/workbench/services/plot/common/plotMainLayout";

export const drawPlotGrid = (
  context: CanvasRenderingContext2D,
  layout: PlotMainLayout,
): void => {
  const { plotRect, scale, xTicks, yTicks } = layout;

  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.28)";
  context.lineWidth = 1;
  for (const tick of xTicks) {
    const x = scale.xToPixel(tick);
    if (!Number.isFinite(x)) continue;
    context.beginPath();
    context.moveTo(x, plotRect.top);
    context.lineTo(x, plotRect.bottom);
    context.stroke();
  }
  for (const tick of yTicks) {
    const y = scale.yToPixel(tick);
    if (!Number.isFinite(y)) continue;
    context.beginPath();
    context.moveTo(plotRect.left, y);
    context.lineTo(plotRect.right, y);
    context.stroke();
  }
  context.restore();
};
