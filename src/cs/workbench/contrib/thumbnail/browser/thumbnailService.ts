import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  createThumbnailPlotBitmapCache,
  drawThumbnailPlotBitmap,
  type ThumbnailPlotBitmapOptions,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailPlotBitmap";

export const IThumbnailService = createDecorator<IThumbnailService>("thumbnailService");

export interface IThumbnailService {
  readonly _serviceBrand: undefined;

  clear(): void;
  drawPlotThumbnail(canvas: HTMLCanvasElement, options: ThumbnailPlotBitmapOptions): void;
}

export class BrowserThumbnailService extends Disposable implements IThumbnailService {
  public declare readonly _serviceBrand: undefined;

  private readonly plotBitmapCache = createThumbnailPlotBitmapCache();

  clear(): void {
    this.plotBitmapCache.clear();
  }

  drawPlotThumbnail(canvas: HTMLCanvasElement, options: ThumbnailPlotBitmapOptions): void {
    drawThumbnailPlotBitmap({
      cache: this.plotBitmapCache,
      canvas,
      options,
    });
  }

  override dispose(): void {
    this.plotBitmapCache.dispose();
    super.dispose();
  }
}

registerSingleton(IThumbnailService, BrowserThumbnailService, InstantiationType.Delayed);
