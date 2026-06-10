/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Draws the outer frame around the plot area on the main chart canvas.
import type { PlotRect } from "src/cs/workbench/services/plot/common/plotMainLayout";

export const drawPlotFrame = (
  context: CanvasRenderingContext2D,
  plotRect: PlotRect,
): void => {
  context.save();
  context.strokeStyle = "rgba(100, 116, 139, 0.8)";
  context.lineWidth = 1;
  context.strokeRect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
  context.restore();
};
