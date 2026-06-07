import type {
  CalculatedData,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import {
  drawPlotMainChart,
  type PlotMainChartProps,
} from "src/cs/workbench/contrib/plot/browser/plotMainChart";
import { createPlotMainChartProps } from "src/cs/workbench/contrib/plot/browser/plotMainView";

export type ThumbnailBitmapOptions = {
  readonly model: CalculatedData;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotType: PlotType;
};

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

const DEFAULT_SOURCE_SIZE: SourceSize = { width: 720, height: 420 };
const DEFAULT_CACHE_LIMIT = 48;

export const createThumbnailBitmapCache = (
  limit = DEFAULT_CACHE_LIMIT,
): ThumbnailBitmapCache => {
  const entries = new Map<string, CacheEntry>();
  let use = 0;

  const get = (options: ThumbnailBitmapOptions): HTMLCanvasElement => {
    const renderProps = createPlotMainChartProps({
      model: options.model,
      originOpenPlotOptions: options.originOpenPlotOptions,
      plotAxisSettings: options.plotAxisSettings,
      plotType: options.plotType,
    });
    const key = createCacheKey({
      modelSignature: options.model.signature,
      renderProps,
      size: DEFAULT_SOURCE_SIZE,
    });
    use += 1;

    const cached = entries.get(key);
    if (cached) {
      cached.lastUsed = use;
      return cached.canvas;
    }

    const canvas = createBitmap(renderProps, DEFAULT_SOURCE_SIZE);
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
  const width = Math.max(1, canvas.clientWidth || 320);
  const height = Math.max(1, canvas.clientHeight || 180);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  const bitmap = cache?.get(options) ??
    createBitmap(
      createPlotMainChartProps({
        model: options.model,
        originOpenPlotOptions: options.originOpenPlotOptions,
        plotAxisSettings: options.plotAxisSettings,
        plotType: options.plotType,
      }),
      DEFAULT_SOURCE_SIZE,
    );
  context.drawImage(bitmap, 0, 0, width, height);
};

const createBitmap = (
  renderProps: PlotMainChartProps,
  size: SourceSize,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  drawPlotMainChart(canvas, renderProps, size);
  return canvas;
};

const createCacheKey = ({
  modelSignature,
  renderProps,
  size,
}: {
  readonly modelSignature: string;
  readonly renderProps: PlotMainChartProps;
  readonly size: SourceSize;
}): string => [
  modelSignature,
  renderProps.plotType ?? "",
  size.width,
  size.height,
  window.devicePixelRatio || 1,
  renderProps.activeFile?.xLabel ?? "",
  renderProps.activeFile?.yLabel ?? "",
  renderProps.plotXUnitLabel ?? "",
  renderProps.plotYUnitLabel ?? "",
  renderProps.curveLineWidth ?? "",
  renderProps.curvePlotType ?? "",
  renderProps.showGrid ?? "",
  renderProps.showMajorTicks ?? "",
  renderProps.showMinorTicks ?? "",
  renderProps.minorTickCount ?? "",
  renderProps.tickLabelFontSize ?? "",
  renderProps.axisTitleFontSize ?? "",
  renderProps.yScaleMode,
  renderProps.effectiveYScale,
].join("|");

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
