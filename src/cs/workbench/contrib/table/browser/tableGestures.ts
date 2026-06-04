import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { TableCommandId } from "src/cs/workbench/contrib/table/common/table";
import { runTableCommand } from "src/cs/workbench/contrib/table/browser/tableCommands";
import type TableViewPane from "src/cs/workbench/contrib/table/browser/tableViewPane";

export type TableGestureHost = {
  readonly element: HTMLElement | null;
  readonly view: TableViewPane | null;
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
    if (runTableCommand(this.host.view, commandId)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private onHorizontalWheel(event: WheelEvent): void {
    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (delta === 0 || !this.host.view?.scrollHorizontally(delta)) {
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
