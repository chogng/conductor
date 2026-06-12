/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ITableDropTargetService =
  createDecorator<ITableDropTargetService>("tableDropTargetService");

export interface ITableDropTargetService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeDropTarget: Event<HTMLElement | null>;

  getDropTargetElement(): HTMLElement | null;
  registerDropTargetElement(element: HTMLElement): IDisposable;
}

export class TableDropTargetService extends Disposable implements ITableDropTargetService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeDropTargetEmitter =
    this._register(new Emitter<HTMLElement | null>());
  public readonly onDidChangeDropTarget = this.onDidChangeDropTargetEmitter.event;

  private dropTargetElement: HTMLElement | null = null;

  public getDropTargetElement(): HTMLElement | null {
    return this.dropTargetElement;
  }

  public registerDropTargetElement(element: HTMLElement): IDisposable {
    if (this.dropTargetElement !== element) {
      this.dropTargetElement = element;
      this.onDidChangeDropTargetEmitter.fire(element);
    }

    return toDisposable(() => {
      if (this.dropTargetElement !== element) {
        return;
      }

      this.dropTargetElement = null;
      this.onDidChangeDropTargetEmitter.fire(null);
    });
  }
}

registerSingleton(
  ITableDropTargetService,
  TableDropTargetService,
  InstantiationType.Delayed,
);
