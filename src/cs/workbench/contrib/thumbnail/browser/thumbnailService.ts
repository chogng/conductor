import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  createThumbnailBitmapCache,
  drawThumbnailBitmap,
  type ThumbnailBitmapOptions,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailBitmap";

export const IThumbnailService = createDecorator<IThumbnailService>("thumbnailService");

export interface IThumbnailService {
  readonly _serviceBrand: undefined;

  clear(): void;
  drawPlotThumbnail(canvas: HTMLCanvasElement, options: ThumbnailBitmapOptions): void;
}

export class BrowserThumbnailService extends Disposable implements IThumbnailService {
  public declare readonly _serviceBrand: undefined;

  private readonly bitmapCache = createThumbnailBitmapCache();

  clear(): void {
    this.bitmapCache.clear();
  }

  drawPlotThumbnail(canvas: HTMLCanvasElement, options: ThumbnailBitmapOptions): void {
    drawThumbnailBitmap({
      cache: this.bitmapCache,
      canvas,
      options,
    });
  }

  override dispose(): void {
    this.bitmapCache.dispose();
    super.dispose();
  }
}

registerSingleton(IThumbnailService, BrowserThumbnailService, InstantiationType.Delayed);
