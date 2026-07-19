/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createPlotMainLayout,
  type ChartScale,
} from "src/cs/workbench/services/plot/common/plotMainLayout";
import type {
  PlotMainPoint,
  PlotMainRenderModel,
} from "src/cs/workbench/services/plot/common/plotModel";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
} from "src/cs/workbench/services/plot/common/plotSettings";
import { createPlotMainRenderModel } from "src/cs/workbench/services/plot/browser/plotRenderModel";
import type { ThumbnailBitmapOptions } from "src/cs/workbench/services/thumbnail/common/thumbnail";

export type ThumbnailBitmapCache = {
  readonly clear: () => void;
  readonly dispose: () => void;
  readonly get: (options: ThumbnailBitmapOptions) => HTMLCanvasElement;
};

type CacheEntry = {
  readonly canvas: HTMLCanvasElement;
  lastUsed: number;
};

type SourceSize = {
  readonly height: number;
  readonly width: number;
};

type ThumbnailRenderOptions = {
  readonly lineWidth: number;
  readonly model: PlotMainRenderModel;
};

const DEFAULT_SOURCE_SIZE: SourceSize = { width: 720, height: 420 };
const DEFAULT_CACHE_LIMIT = 48;
const DEFAULT_LINE_WIDTH = 2;
const THUMBNAIL_COLORS = [
  "#515151",
  "#F14040",
  "#1A6FDF",
  "#37AD6B",
  "#B177DE",
  "#CC9900",
  "#00CBCC",
  "#7D4E4E",
  "#8E8E00",
  "#FB6501",
  "#6699CC",
  "#6FB802",
] as const;

export const createThumbnailBitmapCache = (
  limit = DEFAULT_CACHE_LIMIT,
): ThumbnailBitmapCache => {
  const entries = new Map<string, CacheEntry>();
  let use = 0;

  const get = (options: ThumbnailBitmapOptions): HTMLCanvasElement => {
    const renderOptions = createThumbnailRenderOptions(options);
    const key = createCacheKey({
      options,
      renderOptions,
      size: DEFAULT_SOURCE_SIZE,
    });
    use += 1;

    const cached = entries.get(key);
    if (cached) {
      cached.lastUsed = use;
      return cached.canvas;
    }

    const canvas = createBitmap(renderOptions, DEFAULT_SOURCE_SIZE);
    entries.set(key, { canvas, lastUsed: use });
    trimCache(entries, limit);
    return canvas;
  };

  const clear = (): void => {
    entries.clear();
  };

  return {
    clear,
    dispose: clear,
    get,
  };
};

export const drawThumbnailBitmap = ({
  cache,
  canvas,
  options,
}: {
  readonly cache?: ThumbnailBitmapCache | null;
  readonly canvas: HTMLCanvasElement;
  readonly options: ThumbnailBitmapOptions;
}): void => {
  const size = resolveCanvasSize(canvas);
  if (!size) {
    return;
  }

  const { width, height } = size;
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
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
  context.clearRect(0, 0, width, height);
  const bitmap = cache?.get(options) ??
    createBitmap(
      createThumbnailRenderOptions(options),
      DEFAULT_SOURCE_SIZE,
    );
  context.drawImage(bitmap, 0, 0, width, height);
};

const resolveCanvasSize = (
  canvas: HTMLCanvasElement,
): { height: number; width: number } | null => {
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

  return {
    height,
    width,
  };
};

const createThumbnailRenderOptions = (
  options: ThumbnailBitmapOptions,
): ThumbnailRenderOptions => ({
  lineWidth: resolveLineWidth(options.originOpenPlotOptions?.lineWidth),
  model: createPlotMainRenderModel(options.model),
});

const createBitmap = (
  renderOptions: ThumbnailRenderOptions,
  size: SourceSize,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  drawThumbnailPlot(canvas, renderOptions, size);
  return canvas;
};

const drawThumbnailPlot = (
  canvas: HTMLCanvasElement,
  { lineWidth, model }: ThumbnailRenderOptions,
  size: SourceSize,
): void => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.width * dpr));
  canvas.height = Math.max(1, Math.round(size.height * dpr));
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  const layout = createPlotMainLayout(size.width, size.height, {
    showAxes: false,
    xDomain: model.xDomain,
    yDomain: model.yDomain,
    yScaleMode: "linear",
  });
  for (const [seriesIndex, series] of model.seriesList.entries()) {
    const points = (Array.isArray(series.data) ? series.data : [])
      .map(point => createThumbnailPoint(point, layout.scale))
      .filter((point): point is { readonly x: number; readonly y: number } => Boolean(point));
    drawLine(
      context,
      points,
      String(series.color ?? "").trim() || getThumbnailColor(seriesIndex),
      lineWidth,
    );
  }
};

const createThumbnailPoint = (
  point: PlotMainPoint,
  scale: ChartScale,
): { readonly x: number; readonly y: number } | null => {
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: scale.xToPixel(x),
    y: scale.yToPixel(y),
  };
};

const drawLine = (
  context: CanvasRenderingContext2D,
  points: readonly { readonly x: number; readonly y: number }[],
  color: string,
  lineWidth: number,
): void => {
  if (points.length < 2) {
    return;
  }

  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
};

const createCacheKey = ({
  options,
  renderOptions,
  size,
}: {
  readonly options: ThumbnailBitmapOptions;
  readonly renderOptions: ThumbnailRenderOptions;
  readonly size: SourceSize;
}): string => {
  const axisSettings = normalizePlotAxisSettings(
    options.plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  return [
    options.model.signature,
    options.plotType,
    size.width,
    size.height,
    window.devicePixelRatio || 1,
    renderOptions.model.xUnitLabel,
    renderOptions.model.yUnitLabel,
    renderOptions.lineWidth,
    Number(options.originOpenPlotOptions?.type ?? ""),
    axisSettings.showGrid,
    axisSettings.showMajorTicks,
    axisSettings.showMinorTicks,
    axisSettings.minorTickCount,
    axisSettings.tickLabelFontSize,
    axisSettings.axisTitleFontSize,
  ].join("|");
};

const resolveLineWidth = (value: unknown): number => {
  const lineWidth = Number(value);
  return Number.isFinite(lineWidth) && lineWidth > 0
    ? lineWidth
    : DEFAULT_LINE_WIDTH;
};

const getThumbnailColor = (seriesIndex: number): string =>
  THUMBNAIL_COLORS[((seriesIndex % THUMBNAIL_COLORS.length) + THUMBNAIL_COLORS.length) % THUMBNAIL_COLORS.length]!;

const trimCache = (entries: Map<string, CacheEntry>, limit: number): void => {
  const maxEntries = Math.max(1, Math.floor(limit));
  while (entries.size > maxEntries) {
    let oldestKey: string | null = null;
    let oldestUse = Number.POSITIVE_INFINITY;
    for (const [key, entry] of entries) {
      if (entry.lastUsed < oldestUse) {
        oldestKey = key;
        oldestUse = entry.lastUsed;
      }
    }

    if (!oldestKey) {
      return;
    }
    entries.delete(oldestKey);
  }
};
