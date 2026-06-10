/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModelSource } from "src/cs/workbench/services/plot/common/plotModel";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";

export type ThumbnailFileLike = {
  fileId?: string;
  fileName?: string;
  yUnit?: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  x?: {
    sampledPoints?: number | null;
  };
  xAxisRole?: "vg" | "vd" | null;
};

export type ThumbnailPlotModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type ThumbnailViewProps = {
  file: ThumbnailFileLike;
  originOpenPlotOptions?: OriginPlotOptions;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  plotModel?: ThumbnailPlotModel | null;
  plotType?: PlotType;
  thumbnailService?: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
  isActive?: boolean;
  isOriginSelected?: boolean;
  showOriginSelectionBadge?: boolean;
  originSelectedBadgeLabel?: string;
};

export const createThumbnailView = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel = null,
  plotType = "iv",
  thumbnailService = null,
  isActive = false,
  isOriginSelected = false,
  originSelectedBadgeLabel = "SELECT",
  showOriginSelectionBadge = false,
}: ThumbnailViewProps): HTMLElement => {
  const root = document.createElement("div");
  const title = file.fileName ?? file.fileId ?? "";
  const classes = [
    "thumbnail_view",
    isActive ? "thumbnail_view--active" : "",
  ].filter(Boolean);
  root.className = classes.join(" ");
  if (title) {
    root.title = title;
  }

  root.append(createHeader(file), createChartThumbnail({
    file,
    originOpenPlotOptions,
    plotAxisSettings,
    plotModel,
    plotType,
    thumbnailService,
    isOriginSelected,
    originSelectedBadgeLabel,
    showOriginSelectionBadge,
  }));
  return root;
};

const createHeader = (file: ThumbnailFileLike): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_header";

  const row = document.createElement("div");
  row.className = "thumbnail_view_header_row";
  const main = document.createElement("div");
  main.className = "thumbnail_view_header_main";

  const title = document.createElement("div");
  title.className = "thumbnail_view_title";
  title.textContent = file.fileName ?? file.fileId ?? "";

  main.append(title);
  row.append(main);
  root.append(row);
  return root;
};

const createChartThumbnail = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel,
  plotType,
  thumbnailService,
  isOriginSelected,
  originSelectedBadgeLabel,
  showOriginSelectionBadge,
}: {
  readonly file: ThumbnailFileLike;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotModel: ThumbnailPlotModel | null;
  readonly plotType: PlotType;
  readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
  readonly isOriginSelected: boolean;
  readonly originSelectedBadgeLabel: string;
  readonly showOriginSelectionBadge: boolean;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_chart";
  root.style.aspectRatio = "16 / 9";
  if (plotModel && thumbnailService) {
    root.append(createPlotMainThumbnailCanvas({
      file,
      originOpenPlotOptions,
      plotAxisSettings,
      plotModel,
      plotType,
      thumbnailService,
    }));
  }

  if (showOriginSelectionBadge && isOriginSelected) {
    const badge = document.createElement("div");
    badge.className = "thumbnail_view_selection_badge";
    badge.textContent = originSelectedBadgeLabel;
    root.append(badge);
  }
  return root;
};

const createPlotMainThumbnailCanvas = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel,
  plotType,
  thumbnailService,
}: {
  readonly file: ThumbnailFileLike;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotModel: ThumbnailPlotModel;
  readonly plotType: PlotType;
  readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail">;
}): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.className = "thumbnail_view_chart_canvas";
  canvas.title = file.fileName ?? file.fileId ?? "";
  requestAnimationFrame(() => {
    thumbnailService.drawPlotThumbnail(canvas, {
      model: plotModel,
      originOpenPlotOptions,
      plotAxisSettings,
      plotType,
    });
  });
  return canvas;
};
