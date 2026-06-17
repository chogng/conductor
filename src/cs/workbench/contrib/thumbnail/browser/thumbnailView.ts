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
  isLoading?: boolean;
  isActive?: boolean;
  isOriginSelected?: boolean;
  showOriginSelectionBadge?: boolean;
  originSelectedBadgeLabel?: string;
};

type ThumbnailCanvasSize = {
  readonly height: number;
  readonly width: number;
};

const MAX_THUMBNAIL_LAYOUT_WAIT_FRAMES = 120;

export const createThumbnailView = ({
  file,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel = null,
  plotType = "iv",
  thumbnailService = null,
  isLoading = false,
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
    isLoading,
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
  isLoading,
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
  readonly isLoading: boolean;
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
  } else if (isLoading) {
    root.append(createThumbnailLoadingPlaceholder());
  }

  if (showOriginSelectionBadge && isOriginSelected) {
    const badge = document.createElement("div");
    badge.className = "thumbnail_view_selection_badge";
    badge.textContent = originSelectedBadgeLabel;
    root.append(badge);
  }
  return root;
};

const createThumbnailLoadingPlaceholder = (): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_chart_loading";
  root.setAttribute("aria-hidden", "true");
  root.append(
    createThumbnailLoadingLine("thumbnail_view_chart_loading_line thumbnail_view_chart_loading_line--primary"),
    createThumbnailLoadingLine("thumbnail_view_chart_loading_line thumbnail_view_chart_loading_line--secondary"),
    createThumbnailLoadingLine("thumbnail_view_chart_loading_line thumbnail_view_chart_loading_line--tertiary"),
  );
  return root;
};

const createThumbnailLoadingLine = (className: string): HTMLElement => {
  const line = document.createElement("div");
  line.className = className;
  return line;
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
  scheduleStableThumbnailDraw(canvas, () => {
    thumbnailService.drawPlotThumbnail(canvas, {
      model: plotModel,
      originOpenPlotOptions,
      plotAxisSettings,
      plotType,
    });
  });
  return canvas;
};

const scheduleStableThumbnailDraw = (
  canvas: HTMLCanvasElement,
  draw: () => void,
): void => {
  let animationFrame = 0;
  let pendingSize: ThumbnailCanvasSize | null = null;
  let waitFrames = 0;
  const resizeObserver = new ResizeObserver(() => queueDraw());

  const dispose = (): void => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    resizeObserver.disconnect();
  };

  const render = (): void => {
    animationFrame = 0;

    const nextSize = readThumbnailCanvasSize(canvas);
    if (!nextSize) {
      waitFrames += 1;
      if (waitFrames >= MAX_THUMBNAIL_LAYOUT_WAIT_FRAMES) {
        dispose();
        return;
      }
      pendingSize = null;
      queueDraw();
      return;
    }
    waitFrames = 0;

    if (!isSameThumbnailCanvasSize(pendingSize, nextSize)) {
      pendingSize = nextSize;
      queueDraw();
      return;
    }

    dispose();
    draw();
  };

  const queueDraw = (): void => {
    if (animationFrame) {
      return;
    }
    animationFrame = requestAnimationFrame(render);
  };

  resizeObserver.observe(canvas);
  queueDraw();
};

const readThumbnailCanvasSize = (canvas: HTMLCanvasElement): ThumbnailCanvasSize | null => {
  if (!canvas.isConnected) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement?.getBoundingClientRect();
  const height = Math.floor(rect.height || parentRect?.height || canvas.clientHeight || 0);
  const width = Math.floor(rect.width || parentRect?.width || canvas.clientWidth || 0);
  if (height <= 0 || width <= 0) {
    return null;
  }

  return { height, width };
};

const isSameThumbnailCanvasSize = (
  a: ThumbnailCanvasSize | null,
  b: ThumbnailCanvasSize | null,
): boolean =>
  Boolean(a && b && a.width === b.width && a.height === b.height);
