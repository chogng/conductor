/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import type { IActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  ActionRunner,
  toAction,
  type IAction,
  type IActionRunner,
} from "src/cs/base/common/actions";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import { IStorageService } from "src/cs/platform/storage/common/storage";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import {
  TableController,
  type TableControllerProps,
} from "src/cs/workbench/contrib/table/browser/tableController";
import { setActiveTableZoomController } from "src/cs/workbench/contrib/table/browser/tableCommands";
import { TableCommandId, TableViewId } from "src/cs/workbench/contrib/table/common/table";
import {
  TABLE_WIDGET_DEFAULT_ZOOM_PERCENT,
  TABLE_WIDGET_MAX_ZOOM_PERCENT,
  TABLE_WIDGET_MIN_ZOOM_PERCENT,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import {
  ITableDropTargetService,
} from "src/cs/workbench/services/table/browser/tableDropTargetService";
import {
  ITableService,
  type TableViewInput,
} from "src/cs/workbench/services/table/common/table";

export type TableViewPaneProps = TableViewInput;

type HeaderMode = "empty" | "file";

type HeaderState = {
  readonly dimensions?: string;
  readonly fileName: string;
  readonly mode: HeaderMode;
  readonly shouldUpdateDimensions: boolean;
};

type ZoomControl = {
  readonly element: HTMLElement;
  readonly decreaseButton: HTMLButtonElement;
  readonly increaseButton: HTMLButtonElement;
  readonly value: HTMLSpanElement;
};

const ZOOM_CONTROL_ACTION_ID = "table.header.zoom";

export class TableViewPane extends ViewPane {
  private readonly previewPart: HTMLElement;
  private readonly store = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly headerTitle = document.createElement("div");
  private readonly headerLeft = document.createElement("span");
  private readonly headerCenter = document.createElement("span");
  private readonly headerRight = document.createElement("div");
  private readonly dimensions = document.createElement("span");
  private readonly actionBar: ActionBar;
  private readonly zoomAction = toAction({
    id: ZOOM_CONTROL_ACTION_ID,
    label: localize("table.zoomControl", "Table zoom"),
    run: () => undefined,
  });
  private readonly zoomControl: ZoomControl;
  private controller: TableController | null = null;
  private props: TableViewPaneProps | null = null;
  private headerMode: HeaderMode | null = null;

  constructor(
    @ITableService private readonly tableService: ITableService,
    @ITableDropTargetService private readonly tableDropTargetService: ITableDropTargetService,
    @ICommandService private readonly commandService: ICommandService,
    @IStorageService private readonly storageService: IStorageService,
  ) {
    super({
      id: TableViewId,
      title: localize("table.ariaLabel", "Table"),
      className: "table-view-pane-root",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.zoomControl = this.createZoomControl();
    this.actionBar = new ActionBar({
      ariaLabel: localize("table.header.actions", "Table actions"),
      className: "table_view_actions",
      actionViewItemProvider: action => action.id === ZOOM_CONTROL_ACTION_ID
        ? new ZoomControlViewItem(action, this.zoomControl.element)
        : undefined,
    });
    this.store.add(this.actionBar);
    this.headerTitle.className = "table_view_header_title";
    this.headerLeft.className = "table_view_header_left";
    this.headerCenter.className = "table_view_header_center";
    this.headerRight.className = "table_view_header_right";
    this.dimensions.className = "table_view_dimensions";
    this.content.className = "table_view_pane_content";
    this.renderHeaderActions();
    this.headerTitle.append(this.headerLeft, this.headerCenter);
    this.headerRight.append(this.dimensions, this.actionBar.domNode);
    this.previewPart = createPreviewPart({
      id: TableViewId,
      ariaLabel: localize("table.ariaLabel", "Table"),
      actionbarContent: this.headerRight,
      className: "table_view_pane",
      children: this.content,
      titleContent: this.headerTitle,
    });
    this.body.append(this.previewPart);
    this._register(this.tableDropTargetService.registerDropTargetElement(this.previewPart));
    this._register(this.tableService.onDidChangeTableViewInput(() => {
      const input = this.tableService.getViewInput();
      if (input) {
        this.update(input);
      }
    }));
    const input = this.tableService.getViewInput();
    if (input) {
      this.update(input);
    }
  }

  public update(props: TableViewPaneProps): void {
    this.props = props;
    if (!this.controller) {
      this.controller = new TableController(toControllerProps(
        props,
        this.tableService,
        this.commandService,
        this.storageService,
      ));
      this.store.add(setActiveTableZoomController(this.controller));
      this.store.add(this.controller.onDidChangeZoom(() => this.updateZoomControl()));
      this.content.append(this.controller.element);
    } else {
      this.controller.update(toControllerProps(
        props,
        this.tableService,
        this.commandService,
        this.storageService,
      ));
    }
    const { dimensions, fileName, mode, shouldUpdateDimensions } = getHeaderState(props);
    this.updateHeaderMode(mode);
    this.updateHeaderCenter(fileName, mode === "file");
    this.updateHeaderRight(dimensions, shouldUpdateDimensions);
  }

  public dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    this.store.dispose();
    this.content.replaceChildren();
    this.previewPart.remove();
    super.dispose();
  }

  private createZoomControl(): ZoomControl {
    const element = document.createElement("div");
    element.className = "table_view_zoom_control";
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", localize("table.zoomControl", "Table zoom"));

    const decreaseButton = createZoomButton({
      className: "table_view_zoom_button table_view_zoom_button_minus",
      icon: LxIcon.remove,
      label: localize("table.zoomOut", "Zoom out"),
      shortcut: "Control+-",
    });
    const value = document.createElement("span");
    value.className = "table_view_zoom_value";
    value.setAttribute("aria-live", "polite");
    const increaseButton = createZoomButton({
      className: "table_view_zoom_button table_view_zoom_button_plus",
      icon: LxIcon.add,
      label: localize("table.zoomIn", "Zoom in"),
      shortcut: "Control+=",
    });

    this.store.add(addDisposableListener(decreaseButton, EventType.CLICK, () => {
      void this.commandService.executeCommand(TableCommandId.zoomOut);
    }));
    this.store.add(addDisposableListener(increaseButton, EventType.CLICK, () => {
      void this.commandService.executeCommand(TableCommandId.zoomIn);
    }));

    element.append(decreaseButton, value, increaseButton);
    return {
      decreaseButton,
      element,
      increaseButton,
      value,
    };
  }

  protected override layoutBody(_height: number, _width: number): void {
    this.controller?.layout();
  }

  private updateHeaderMode(mode: HeaderMode): void {
    if (this.headerMode === mode) {
      return;
    }

    this.headerMode = mode;
    setText(this.headerLeft, getHeaderLabel(mode));
  }

  private updateHeaderCenter(fileName: string, isVisible: boolean): void {
    setText(this.headerCenter, fileName);
    setHidden(this.headerCenter, !isVisible);
  }

  private updateHeaderRight(dimensions: string | undefined, shouldUpdateDimensions: boolean): void {
    if (shouldUpdateDimensions) {
      setText(this.dimensions, dimensions ?? "");
      setHidden(this.dimensions, !dimensions);
    }
    this.updateZoomControl();
  }

  private renderHeaderActions(): void {
    this.actionBar.clear();
    this.actionBar.push(this.zoomAction, {
      label: false,
      role: "presentation",
    });
  }

  private updateZoomControl(): void {
    const zoomPercent = this.controller?.getZoomPercent() ?? TABLE_WIDGET_DEFAULT_ZOOM_PERCENT;
    setText(this.zoomControl.value, `${zoomPercent}%`);
    setDisabled(this.zoomControl.decreaseButton, zoomPercent <= TABLE_WIDGET_MIN_ZOOM_PERCENT);
    setDisabled(this.zoomControl.increaseButton, zoomPercent >= TABLE_WIDGET_MAX_ZOOM_PERCENT);
  }
}

class ZoomControlViewItem extends Disposable implements IActionViewItem {
  private container: HTMLElement | null = null;
  private runner: IActionRunner | null = null;

  constructor(
    public readonly action: IAction,
    private readonly control: HTMLElement,
  ) {
    super();
  }

  public get actionRunner(): IActionRunner {
    if (!this.runner) {
      this.runner = this._register(new ActionRunner());
    }

    return this.runner;
  }

  public set actionRunner(actionRunner: IActionRunner) {
    this.runner = actionRunner;
  }

  public setActionContext(_context: unknown): void {}

  public render(container: HTMLElement): void {
    this.container = container;
    container.classList.add("ui-actionbar__item", "table_view_zoom_action");
    container.setAttribute("role", "presentation");
    container.append(this.control);
  }

  public isEnabled(): boolean {
    return this.action.enabled;
  }

  public focus(): void {
    this.control.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  public blur(): void {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && this.control.contains(activeElement)) {
      activeElement.blur();
    }
  }

  public override dispose(): void {
    this.control.remove();
    this.container?.remove();
    this.container = null;
    super.dispose();
  }
}

const setText = (element: HTMLElement, text: string): void => {
  if (element.textContent !== text) {
    element.textContent = text;
  }
};

const setHidden = (element: HTMLElement, hidden: boolean): void => {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
};

const setDisabled = (element: HTMLButtonElement, disabled: boolean): void => {
  if (element.disabled !== disabled) {
    element.disabled = disabled;
  }
  const ariaDisabled = String(disabled);
  if (element.getAttribute("aria-disabled") !== ariaDisabled) {
    element.setAttribute("aria-disabled", ariaDisabled);
  }
};

const createZoomButton = ({
  className,
  icon,
  label,
  shortcut,
}: {
  readonly className: string;
  readonly icon: LxIconDefinition;
  readonly label: string;
  readonly shortcut: string;
}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-keyshortcuts", shortcut);
  button.append(createLxIcon({
    icon,
    size: 14,
  }));
  return button;
};

const getHeaderLabel = (mode: HeaderMode): string => {
  switch (mode) {
    case "file":
      return localize("table.header.filename", "File name");
    case "empty":
    default:
      return localize("table.header.empty", "No preview");
  }
};

const getHeaderState = ({ tableState }: TableViewPaneProps): HeaderState => {
  const hasSelectedFile = Boolean(tableState.selectedFileId && tableState.fileName);

  return {
    dimensions: tableState.dimensions,
    fileName: tableState.fileName,
    mode: hasSelectedFile ? "file" : "empty",
    shouldUpdateDimensions: tableState.loadState.state !== "loading" || !hasSelectedFile,
  };
};

const toControllerProps = (
  props: TableViewPaneProps,
  tableService: Pick<ITableService, "select">,
  commandService: Pick<ICommandService, "executeCommand">,
  storageService: Pick<IStorageService, "getObject" | "remove" | "store">,
): TableControllerProps => ({
  ...props,
  onCopySelection: () => {
    void commandService.executeCommand(TableCommandId.copySelection);
  },
  onSelect: (target, reveal) => tableService.select(target, reveal),
  storageService,
});

export default TableViewPane;
