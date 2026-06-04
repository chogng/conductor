import {
  addDisposableListener,
  EventType,
  isEditableElement,
} from "src/cs/base/browser/dom";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
} from "src/cs/workbench/contrib/table/common/table";
import { runTableCommand } from "src/cs/workbench/contrib/table/browser/tableCommands";
import type TableViewPane from "src/cs/workbench/contrib/table/browser/tableViewPane";

export type TableActionHost = {
  readonly element: HTMLElement | null;
  readonly view: TableViewPane | null;
};

export class TableActions extends Disposable {
  public constructor(private readonly host: TableActionHost) {
    super();
    this._register(addDisposableListener(window, EventType.KEY_DOWN, event => {
      this.onKeyDown(event);
    }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.metaKey) {
      return;
    }

    const commandId = getTableCommandForKey(event);
    if (!commandId || !this.isTableFocusTarget(event.target)) {
      return;
    }

    if (runTableCommand(this.host.view, commandId)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private isTableFocusTarget(target: EventTarget | null): boolean {
    const element = this.host.element;
    if (!element || !(target instanceof Element) || !element.contains(target)) {
      return false;
    }

    return !isEditableElement(target);
  }
}

export const registerTableActions = (host: TableActionHost): IDisposable =>
  new TableActions(host);

const getTableCommandForKey = (
  event: KeyboardEvent,
): TableCommandIdValue | null => {
  const key = String(event.key || "").toLowerCase();
  if (event.ctrlKey) {
    if (key === "a") {
      return TableCommandId.selectAllColumns;
    }
    if (key === "=" || key === "+") {
      return TableCommandId.zoomIn;
    }
    if (key === "-") {
      return TableCommandId.zoomOut;
    }
    if (key === "0") {
      return TableCommandId.resetZoom;
    }
    return null;
  }

  if (key === "escape") {
    return TableCommandId.clearSelection;
  }

  return null;
};
