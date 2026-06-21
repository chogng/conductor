/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import type { IActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import {
  ActionRunner,
  toAction,
  type IAction,
  type IActionRunner,
} from "src/cs/base/common/actions";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import { IHoverService } from "src/cs/platform/hover/browser/hoverService";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import {
  TableController,
  type TableControllerProps,
} from "src/cs/workbench/contrib/table/browser/tableController";
import {
  createTableValueStepperControl,
  type TableValueStepperControl,
} from "src/cs/workbench/contrib/table/browser/tableValueStepperControl";
import { ITableWidgetService } from "src/cs/workbench/contrib/table/browser/tableWidgetService";
import { TableCommandId, TableViewId } from "src/cs/workbench/contrib/table/common/table";
import {
  TABLE_WIDGET_DEFAULT_ZOOM_PERCENT,
  TABLE_WIDGET_MAX_ZOOM_PERCENT,
  TABLE_WIDGET_MIN_ZOOM_PERCENT,
  type TableWidgetSize,
} from "src/cs/base/browser/ui/table/tableWidget";
import {
  type TableWidgetColumnHeaderSelection,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import {
  ITableDropTargetService,
} from "src/cs/workbench/services/table/browser/tableDropTargetService";
import {
  ITableService,
  type TableViewInput,
} from "src/cs/workbench/services/table/common/table";
import {
  ITemplateService,
  type TemplateMode,
} from "src/cs/workbench/services/template/common/template";

export type TableViewPaneProps = TableViewInput;

type HeaderMode = "empty" | "file";

type HeaderState = {
  readonly fileName: string;
  readonly mode: HeaderMode;
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
  private readonly zoomControl: TableValueStepperControl;
  private controller: TableController | null = null;
  private props: TableViewPaneProps | null = null;
  private headerMode: HeaderMode | null = null;

  constructor(
    @ITableService private readonly tableService: ITableService,
    @ITableDropTargetService private readonly tableDropTargetService: ITableDropTargetService,
    @ITableWidgetService private readonly tableWidgetService: ITableWidgetService,
    @ICommandService private readonly commandService: ICommandService,
    @IHoverService private readonly hoverService: IHoverService,
    @ITemplateService private readonly templateService: ITemplateService,
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
    this._register(this.templateService.onDidChangeTemplateState(() => {
      if (this.props) {
        this.update(this.props);
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
        this.hoverService,
        this.templateService.getState().mode,
      ));
      this.store.add(this.tableWidgetService.registerController(this.controller));
      this.store.add(this.controller.onDidChangeSize(() => this.updateDimensions()));
      this.store.add(this.controller.onDidChangeZoom(() => this.updateZoomControl()));
      this.content.append(this.controller.element);
    } else {
      this.controller.update(toControllerProps(
        props,
        this.tableService,
        this.commandService,
        this.hoverService,
        this.templateService.getState().mode,
      ));
    }
    const { fileName, mode } = getHeaderState(props);
    this.updateHeaderMode(mode);
    this.updateHeaderCenter(fileName, mode === "file");
    this.updateHeaderRight();
  }

  public dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    this.store.dispose();
    this.content.replaceChildren();
    this.previewPart.remove();
    super.dispose();
  }

  private createZoomControl(): TableValueStepperControl {
    const control = createTableValueStepperControl({
      ariaLabel: localize("table.zoomControl", "Table zoom"),
      decrease: {
        className: "table_view_zoom_button_minus",
        label: localize("table.zoomOut", "Zoom out"),
        keyShortcuts: "Control+-",
      },
      increase: {
        className: "table_view_zoom_button_plus",
        label: localize("table.zoomIn", "Zoom in"),
        keyShortcuts: "Control+=",
      },
      value: {
        kind: "text",
        live: "polite",
      },
    });

    this.store.add(addDisposableListener(control.decreaseButton, EventType.CLICK, () => {
      void this.commandService.executeCommand(TableCommandId.zoomOut);
    }));
    this.store.add(addDisposableListener(control.increaseButton, EventType.CLICK, () => {
      void this.commandService.executeCommand(TableCommandId.zoomIn);
    }));

    return control;
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

  private updateHeaderRight(): void {
    this.updateDimensions();
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
    this.zoomControl.setValue(`${zoomPercent}%`);
    this.zoomControl.setDisabled({
      decrease: zoomPercent <= TABLE_WIDGET_MIN_ZOOM_PERCENT,
      increase: zoomPercent >= TABLE_WIDGET_MAX_ZOOM_PERCENT,
    });
  }

  private updateDimensions(): void {
    const dimensions = formatTableWidgetSize(this.controller?.getSize() ?? null);
    setText(this.dimensions, dimensions);
    setHidden(this.dimensions, !dimensions);
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
    fileName: tableState.fileName,
    mode: hasSelectedFile ? "file" : "empty",
  };
};

const formatTableWidgetSize = (size: TableWidgetSize | null): string => {
  if (!size || size.rowCount <= 0 || size.columnCount <= 0) {
    return "";
  }

  return `${size.rowCount} × ${size.columnCount}`;
};

export const getTableColumnHeaderSelection = (
  templateMode: TemplateMode,
): TableWidgetColumnHeaderSelection =>
  templateMode === "editor" ? "multi" : "disabled";

export const getCanAdjustColumnScale = (
  templateMode: TemplateMode,
): boolean =>
  templateMode === "management";

const toControllerProps = (
  props: TableViewPaneProps,
  tableService: ITableService,
  commandService: Pick<ICommandService, "executeCommand">,
  hoverService: IHoverService,
  templateMode: TemplateMode,
): TableControllerProps => ({
  ...props,
  canAdjustColumnScale: getCanAdjustColumnScale(templateMode),
  columnHeaderSelection: getTableColumnHeaderSelection(templateMode),
  getColumnWidths: sourceKey => tableService.getColumnWidths(sourceKey),
  hoverDelegate: hoverService,
  onCopySelection: () => {
    void commandService.executeCommand(TableCommandId.copySelection);
  },
  onSelect: (target, reveal) => tableService.select(target, reveal),
  storeColumnWidths: (sourceKey, widths) => tableService.storeColumnWidths(sourceKey, widths),
  tableService,
});

export default TableViewPane;
