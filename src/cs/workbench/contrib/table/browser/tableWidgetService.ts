/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ITableWidgetService =
  createDecorator<ITableWidgetService>("tableWidgetService");

export interface ITableWidgetController {
  readonly onDidChangeZoom: Event<number>;

  focus(): void;
  getZoomPercent(): number;
  resetZoom(): boolean;
  zoomIn(): boolean;
  zoomOut(): boolean;
}

export interface ITableWidgetService {
  readonly _serviceBrand: undefined;
  readonly activeController: ITableWidgetController | null;

  registerController(controller: ITableWidgetController): IDisposable;
}

export class TableWidgetService extends Disposable implements ITableWidgetService {
  public declare readonly _serviceBrand: undefined;

  private controllers: ITableWidgetController[] = [];

  public get activeController(): ITableWidgetController | null {
    return this.controllers.at(-1) ?? null;
  }

  public registerController(controller: ITableWidgetController): IDisposable {
    if (this.controllers.includes(controller)) {
      return Disposable.None;
    }

    this.controllers.push(controller);
    return toDisposable(() => {
      this.controllers = this.controllers.filter(candidate => candidate !== controller);
    });
  }

  public override dispose(): void {
    this.controllers = [];
    super.dispose();
  }
}

registerSingleton(
  ITableWidgetService,
  TableWidgetService,
  InstantiationType.Delayed,
);
