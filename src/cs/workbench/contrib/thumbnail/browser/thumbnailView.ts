/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotRenderModel, PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";

export type ThumbnailViewFile = {
  readonly title?: string;
};

export type ThumbnailPlotModel = PlotRenderModel;

export type ThumbnailViewProps = {
  file: ThumbnailViewFile;
  drawStrategy?: ThumbnailDrawStrategy;
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

type ThumbnailDrawStrategy = "eager" | "stable";

const MAX_THUMBNAIL_LAYOUT_WAIT_FRAMES = 120;

export const createThumbnailView = ({
  file,
  drawStrategy = "stable",
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
  const title = file.title ?? "";
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
    drawStrategy,
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

export const updateThumbnailView = (
  root: HTMLElement,
  props: ThumbnailViewProps,
): boolean => {
  if (!root.classList.contains("thumbnail_view")) {
    return false;
  }

  const title = props.file.title ?? "";
  root.classList.toggle("thumbnail_view--active", props.isActive === true);
  if (title) {
    root.title = title;
  } else {
    root.removeAttribute("title");
  }

  const titleElement = root.querySelector<HTMLElement>(".thumbnail_view_title");
  if (titleElement) {
    titleElement.textContent = title;
  }

  const chart = root.querySelector<HTMLElement>(".thumbnail_view_chart");
  if (!chart) {
    return false;
  }

  updateChartThumbnail(chart, {
    drawStrategy: props.drawStrategy ?? "stable",
    file: props.file,
    isLoading: props.isLoading === true,
    isOriginSelected: props.isOriginSelected === true,
    originOpenPlotOptions: props.originOpenPlotOptions,
    originSelectedBadgeLabel: props.originSelectedBadgeLabel ?? "SELECT",
    plotAxisSettings: props.plotAxisSettings,
    plotModel: props.plotModel ?? null,
    plotType: props.plotType ?? "iv",
    showOriginSelectionBadge: props.showOriginSelectionBadge === true,
    thumbnailService: props.thumbnailService ?? null,
  });
  return true;
};

const createHeader = (file: ThumbnailViewFile): HTMLElement => {
  const root = document.createElement("div");
  root.className = "thumbnail_view_header";

  const row = document.createElement("div");
  row.className = "thumbnail_view_header_row";
  const main = document.createElement("div");
  main.className = "thumbnail_view_header_main";

  const title = document.createElement("div");
  title.className = "thumbnail_view_title";
  title.textContent = file.title ?? "";

  main.append(title);
  row.append(main);
  root.append(row);
  return root;
};

const createChartThumbnail = ({
  file,
  drawStrategy,
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
  readonly file: ThumbnailViewFile;
  readonly drawStrategy: ThumbnailDrawStrategy;
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
      drawStrategy,
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

const updateChartThumbnail = (
  root: HTMLElement,
  props: {
    readonly file: ThumbnailViewFile;
    readonly drawStrategy: ThumbnailDrawStrategy;
    readonly originOpenPlotOptions?: OriginPlotOptions;
    readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
    readonly plotModel: ThumbnailPlotModel | null;
    readonly plotType: PlotType;
    readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail"> | null;
    readonly isLoading: boolean;
    readonly isOriginSelected: boolean;
    readonly originSelectedBadgeLabel: string;
    readonly showOriginSelectionBadge: boolean;
  },
): void => {
  root.style.aspectRatio = "16 / 9";
  const existingBadge = root.querySelector<HTMLElement>(".thumbnail_view_selection_badge");
  if (props.plotModel && props.thumbnailService) {
    const plotModel = props.plotModel;
    const thumbnailService = props.thumbnailService;
    root.querySelector(".thumbnail_view_chart_loading")?.remove();
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.thumbnail_view_chart_canvas");
    if (canvas) {
      canvas.classList.remove("thumbnail_view_chart_loading_canvas");
      canvas.title = props.file.title ?? "";
      drawOrScheduleThumbnailDraw(canvas, props.drawStrategy, () => {
        thumbnailService.drawPlotThumbnail(canvas, {
          model: plotModel,
          originOpenPlotOptions: props.originOpenPlotOptions,
          plotAxisSettings: props.plotAxisSettings,
          plotType: props.plotType,
        });
      });
    } else {
      replaceChartContent(root, createPlotMainThumbnailCanvas({
        drawStrategy: props.drawStrategy,
        file: props.file,
        originOpenPlotOptions: props.originOpenPlotOptions,
        plotAxisSettings: props.plotAxisSettings,
        plotModel: props.plotModel,
        plotType: props.plotType,
        thumbnailService: props.thumbnailService,
      }));
    }
  } else if (props.isLoading) {
    if (
      !root.querySelector("canvas.thumbnail_view_chart_canvas") &&
      !root.querySelector(".thumbnail_view_chart_loading")
    ) {
      replaceChartContent(root, createThumbnailLoadingPlaceholder());
    }
  } else {
    replaceChartContent(root, null);
  }

  updateOriginSelectionBadge(root, existingBadge, props);
};

const replaceChartContent = (
  root: HTMLElement,
  content: HTMLElement | null,
): void => {
  for (const child of [...root.children]) {
    if (child.classList.contains("thumbnail_view_selection_badge")) {
      continue;
    }
    child.remove();
  }
  if (content) {
    root.prepend(content);
  }
};

const updateOriginSelectionBadge = (
  root: HTMLElement,
  existingBadge: HTMLElement | null,
  props: {
    readonly isOriginSelected: boolean;
    readonly originSelectedBadgeLabel: string;
    readonly showOriginSelectionBadge: boolean;
  },
): void => {
  if (!props.showOriginSelectionBadge || !props.isOriginSelected) {
    existingBadge?.remove();
    return;
  }

  const badge = existingBadge ?? document.createElement("div");
  badge.className = "thumbnail_view_selection_badge";
  badge.textContent = props.originSelectedBadgeLabel;
  if (!badge.parentElement) {
    root.append(badge);
  }
};

const createThumbnailLoadingPlaceholder = (): HTMLElement => {
  const canvas = document.createElement("canvas");
  canvas.className = "thumbnail_view_chart_canvas thumbnail_view_chart_loading_canvas";
  canvas.setAttribute("aria-hidden", "true");
  drawOrScheduleThumbnailDraw(canvas, "eager", () => drawThumbnailLoadingPlaceholder(canvas));
  return canvas;
};

const createPlotMainThumbnailCanvas = ({
  file,
  drawStrategy,
  originOpenPlotOptions,
  plotAxisSettings,
  plotModel,
  plotType,
  thumbnailService,
}: {
  readonly file: ThumbnailViewFile;
  readonly drawStrategy: ThumbnailDrawStrategy;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotModel: ThumbnailPlotModel;
  readonly plotType: PlotType;
  readonly thumbnailService: Pick<IThumbnailService, "drawPlotThumbnail">;
}): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.className = "thumbnail_view_chart_canvas";
  canvas.title = file.title ?? "";
  drawOrScheduleThumbnailDraw(canvas, drawStrategy, () => {
    thumbnailService.drawPlotThumbnail(canvas, {
      model: plotModel,
      originOpenPlotOptions,
      plotAxisSettings,
      plotType,
    });
  });
  return canvas;
};

const drawOrScheduleThumbnailDraw = (
  canvas: HTMLCanvasElement,
  drawStrategy: ThumbnailDrawStrategy,
  draw: () => void,
): void => {
  if (readThumbnailCanvasSize(canvas)) {
    draw();
    return;
  }

  scheduleThumbnailDraw(canvas, drawStrategy, draw);
};

const scheduleThumbnailDraw = (
  canvas: HTMLCanvasElement,
  drawStrategy: ThumbnailDrawStrategy,
  draw: () => void,
): void => {
  let animationFrame = 0;
  let didDraw = false;
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

  const drawNow = (): boolean => {
    if (didDraw || !readThumbnailCanvasSize(canvas)) {
      return false;
    }

    didDraw = true;
    dispose();
    draw();
    return true;
  };

  const render = (): void => {
    animationFrame = 0;
    if (didDraw) {
      return;
    }

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

    if (drawStrategy === "eager") {
      drawNow();
      return;
    }

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
  if (drawStrategy === "eager") {
    queueMicrotask(() => drawNow());
  }
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

const drawThumbnailLoadingPlaceholder = (canvas: HTMLCanvasElement): void => {
  const size = readThumbnailCanvasSize(canvas);
  if (!size) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(size.width * dpr));
  const targetHeight = Math.max(1, Math.round(size.height * dpr));
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  const left = Math.max(12, Math.round(size.width * 0.08));
  const right = Math.max(left + 1, size.width - Math.max(12, Math.round(size.width * 0.07)));
  const top = Math.max(10, Math.round(size.height * 0.12));
  const bottom = Math.max(top + 1, size.height - Math.max(10, Math.round(size.height * 0.12)));

  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(120, 132, 148, 0.34)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();

  context.strokeStyle = "rgba(120, 132, 148, 0.18)";
  for (let index = 1; index <= 3; index += 1) {
    const x = left + ((right - left) * index) / 4;
    const y = top + ((bottom - top) * index) / 4;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  const drawCurve = (
    color: string,
    points: readonly [number, number][],
  ): void => {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    for (const [index, point] of points.entries()) {
      const x = left + (right - left) * point[0];
      const y = top + (bottom - top) * point[1];
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  };

  drawCurve("rgba(51, 112, 185, 0.72)", [
    [0.06, 0.74],
    [0.2, 0.68],
    [0.36, 0.52],
    [0.52, 0.38],
    [0.72, 0.28],
    [0.94, 0.18],
  ]);
  drawCurve("rgba(205, 120, 48, 0.58)", [
    [0.06, 0.46],
    [0.22, 0.5],
    [0.4, 0.43],
    [0.58, 0.35],
    [0.76, 0.39],
    [0.94, 0.3],
  ]);
};
