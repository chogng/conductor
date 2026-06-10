/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  TableCommandId,
} from "src/cs/workbench/services/table/common/table";
import type { ICommandService } from "src/cs/platform/commands/common/commands";

export type TableGestureHost = {
  readonly commandService: Pick<ICommandService, "executeCommand">;
  readonly element: HTMLElement | null;
  scrollHorizontally(delta: number): boolean;
};

export class TableGestures extends Disposable {
  public constructor(private readonly host: TableGestureHost) {
    super();
    this._register(addDisposableListener(window, EventType.WHEEL, event => {
      this.onWheel(event);
    }, { passive: false }));
  }

  private onWheel(event: WheelEvent): void {
    if (event.defaultPrevented || event.altKey || event.metaKey || !this.isTableTarget(event.target)) {
      return;
    }

    if (event.ctrlKey) {
      this.onZoomWheel(event);
      return;
    }

    if (event.shiftKey) {
      this.onHorizontalWheel(event);
    }
  }

  private onZoomWheel(event: WheelEvent): void {
    const delta = getWheelDelta(event);
    if (delta === 0) {
      return;
    }

    const commandId = delta < 0 ? TableCommandId.zoomIn : TableCommandId.zoomOut;
    event.preventDefault();
    event.stopPropagation();
    void this.host.commandService.executeCommand(commandId);
  }

  private onHorizontalWheel(event: WheelEvent): void {
    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (delta === 0 || !this.host.scrollHorizontally(delta)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  private isTableTarget(target: EventTarget | null): boolean {
    const element = this.host.element;
    return Boolean(element && target instanceof Element && element.contains(target));
  }
}

export const registerTableGestures = (host: TableGestureHost): IDisposable =>
  new TableGestures(host);

const getWheelDelta = (event: WheelEvent): number => {
  if (event.deltaY !== 0) {
    return event.deltaY;
  }

  return event.deltaX;
};
