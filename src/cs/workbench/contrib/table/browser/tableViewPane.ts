/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ScrollableElement } from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import type { Stepper } from "src/cs/base/browser/ui/stepper/stepper";
import {
  Action,
  toAction,
} from "src/cs/base/common/actions";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import { createCenterAreaShell } from "src/cs/workbench/browser/parts/centerArea/centerArea";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  TableController,
  type TableControllerProps,
} from "src/cs/workbench/contrib/table/browser/tableController";
import { TableDropTarget } from "src/cs/workbench/contrib/table/browser/tableDropTarget";
import {
  createTableZoomStepperActionViewItem,
  syncTableZoomStepper,
  type TableStepperActions,
} from "src/cs/workbench/contrib/table/browser/tableStepper";
import { ITableWidgetService } from "src/cs/workbench/contrib/table/browser/tableWidgetService";
import {
  COPY_TABLE_SELECTION_COMMAND_ID,
  RESET_TABLE_ZOOM_COMMAND_ID,
  ZOOM_IN_TABLE_COMMAND_ID,
  ZOOM_OUT_TABLE_COMMAND_ID,
} from "src/cs/workbench/contrib/table/browser/tableCommands";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import type { ITableColumnHeaderSelection, ITableSize } from "src/cs/base/browser/ui/table/table";
import {
  areTableSourcesEqual,
  ITableService,
  type TableSheetTab,
  type TableSource,
  type TableViewInput,
} from "src/cs/workbench/services/table/common/table";
import {
  ITemplateViewStateService,
  type TemplateMode,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";

export type TableViewPaneProps = TableViewInput;

const ZOOM_CONTROL_ACTION_ID = "table.header.zoom";
const TABLE_VIEW_PANE_EMPTY_CLASS = "table_view_pane--empty";

export class TableViewPane extends ViewPane {
  private readonly centerArea: HTMLElement;
  private readonly store = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly headerTitle = document.createElement("div");
  private readonly sheetTabList = document.createElement("div");
  private readonly sheetTabScroller: ScrollableElement;
  private readonly headerRight = document.createElement("div");
  private readonly dimensions = document.createElement("span");
  private readonly actionBar: ActionBar;
  private readonly zoomControlAction = toAction({
    id: ZOOM_CONTROL_ACTION_ID,
    label: localize("table.zoomControl", "Table zoom"),
    run: () => undefined,
  });
  private readonly zoomInAction: Action;
  private readonly zoomOutAction: Action;
  private readonly resetZoomAction: Action;
  private readonly zoomStepperActions: TableStepperActions;
  private zoomControl: Stepper | null = null;
  private controller: TableController | null = null;
  private pendingControllerRender: IDisposable | null = null;
  private props: TableViewPaneProps | null = null;
  private activeHeaderSource: TableSource | null = null;
  private headerSheets: readonly TableSheetTab[] = [];
  private disposed = false;

  constructor(
    @ITableService private readonly tableService: ITableService,
    @ITableWidgetService private readonly tableWidgetService: ITableWidgetService,
    @ICommandService private readonly commandService: ICommandService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @ITemplateViewStateService private readonly templateViewStateService: ITemplateViewStateService,
  ) {
    super({
      id: TableViewId,
      title: localize("table.ariaLabel", "Table"),
      className: "table-view-pane-root",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.zoomOutAction = this.store.add(new Action(
      ZOOM_OUT_TABLE_COMMAND_ID,
      localize("table.zoomOut", "Zoom out"),
      "",
      true,
      () => this.commandService.executeCommand(ZOOM_OUT_TABLE_COMMAND_ID),
    ));
    this.zoomOutAction.icon = LxIcon.remove;
    this.resetZoomAction = this.store.add(new Action(
      RESET_TABLE_ZOOM_COMMAND_ID,
      localize("table.resetZoom", "Reset table zoom"),
      "",
      true,
      () => this.commandService.executeCommand(RESET_TABLE_ZOOM_COMMAND_ID),
    ));
    this.zoomInAction = this.store.add(new Action(
      ZOOM_IN_TABLE_COMMAND_ID,
      localize("table.zoomIn", "Zoom in"),
      "",
      true,
      () => this.commandService.executeCommand(ZOOM_IN_TABLE_COMMAND_ID),
    ));
    this.zoomInAction.icon = LxIcon.add;
    this.zoomStepperActions = {
      decrease: this.zoomOutAction,
      increase: this.zoomInAction,
      reset: this.resetZoomAction,
    };
    this.actionBar = new ActionBar({
      ariaLabel: localize("table.header.actions", "Table actions"),
      className: "table_view_actions",
      actionViewItemProvider: action => {
        if (action.id !== ZOOM_CONTROL_ACTION_ID) {
          return undefined;
        }

        const item = createTableZoomStepperActionViewItem(action, this.zoomStepperActions);
        this.zoomControl = item.stepper;
        this.updateZoomControl();
        return item;
      },
    });
    this.store.add(this.actionBar);
    this.headerTitle.className = "table_view_header_title";
    this.sheetTabList.className = "table_view_sheet_tablist";
    this.sheetTabList.setAttribute("role", "tablist");
    this.sheetTabList.setAttribute("aria-label", localize("table.header.sheetTabs", "Sheets"));
    this.headerRight.className = "table_view_toolbar";
    this.headerRight.setAttribute("role", "toolbar");
    this.headerRight.setAttribute("aria-label", localize("table.header.toolbar", "Table toolbar"));
    this.dimensions.className = "table_view_dimensions";
    this.content.className = "table_view_pane_content";
    this.renderHeaderActions();
    this.headerTitle.append(this.sheetTabList);
    this.sheetTabScroller = this.store.add(new ScrollableElement({
      axis: "x",
      handleMouseWheel: true,
      root: this.headerTitle,
      verticalScrollbarVisibility: "hidden",
      viewport: this.sheetTabList,
    }));
    this.headerRight.append(this.dimensions);
    this.actionBar.domNode.hidden = true;
    this.store.add(addDisposableListener(this.sheetTabList, EventType.CLICK, event => {
      this.onSheetTabListClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.sheetTabList, EventType.KEY_DOWN, event => {
      this.onSheetTabListKeyDown(event as KeyboardEvent);
    }));
    this.centerArea = createCenterAreaShell({
      id: TableViewId,
      ariaLabel: localize("table.ariaLabel", "Table"),
      actionbarContent: this.headerRight,
      className: "table_view_pane",
      children: this.content,
      titleContent: this.headerTitle,
    });
    this.centerArea.classList.add(TABLE_VIEW_PANE_EMPTY_CLASS);
    this.body.append(this.centerArea);
    this._register(this.instantiationService.createInstance(TableDropTarget, this.centerArea));
    this._register(this.tableService.onDidChangeTableViewInput(() => {
      const input = this.tableService.getViewInput();
      if (input) {
        this.update(input);
      }
    }));
    this._register(this.templateViewStateService.onDidChangeTemplateState(() => {
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
    this.updateHeader(props);
    if (this.controller) {
      this.updateController(props);
    } else {
      this.scheduleControllerRender();
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.pendingControllerRender?.dispose();
    this.pendingControllerRender = null;
    this.controller?.dispose();
    this.controller = null;
    this.store.dispose();
    this.content.replaceChildren();
    this.centerArea.remove();
    super.dispose();
  }

  private scheduleControllerRender(): void {
    if (this.pendingControllerRender) {
      return;
    }

    this.pendingControllerRender = this.store.add(scheduleAtNextAnimationFrame(window, () => {
      this.pendingControllerRender = null;
      this.renderController();
    }));
  }

  private renderController(): void {
    if (this.disposed || !this.props) {
      return;
    }

    this.controller = new TableController(toControllerProps(
      this.props,
      this.tableService,
      this.commandService,
      this.templateViewStateService.getState().mode,
    ));
    this.store.add(this.tableWidgetService.registerController(this.controller));
    this.store.add(this.controller.onDidChangeSize(() => this.updateDimensions()));
    this.store.add(this.controller.onDidChangeZoom(() => this.onControllerZoomChanged()));
    this.content.append(this.controller.element);
    this.controller.element.append(this.actionBar.domNode);
    this.controller.layout();
    this.updateHeaderRight();
  }

  private updateController(props: TableViewPaneProps): void {
    this.controller?.update(toControllerProps(
      props,
      this.tableService,
      this.commandService,
      this.templateViewStateService.getState().mode,
    ));
    this.updateHeaderRight();
  }

  private updateHeader(props: TableViewPaneProps): void {
    this.centerArea.classList.toggle(TABLE_VIEW_PANE_EMPTY_CLASS, !hasVisibleTableFile(props.tableState.file));
    this.updateSheetTabs(
      props.tableState.sheets,
      props.tableState.source ?? props.tableState.file?.source ?? null,
    );
    this.updateHeaderRight();
  }

  protected override layoutBody(_height: number, _width: number): void {
    this.controller?.layout();
    this.sheetTabScroller.update();
    this.revealActiveSheetTab();
  }

  private updateSheetTabs(
    sheets: readonly TableSheetTab[],
    activeSource: TableSource | null,
  ): void {
    const shouldRevealActive = this.headerSheets.length === 0 ||
      !areTableSourcesEqual(this.activeHeaderSource, activeSource);
    this.activeHeaderSource = activeSource;
    this.headerSheets = sheets;
    setHidden(this.sheetTabList, sheets.length === 0);
    if (!sheets.length) {
      this.sheetTabList.replaceChildren();
      this.sheetTabScroller.setScrollPosition({ scrollLeft: 0 });
      return;
    }

    const previousScrollLeft = this.sheetTabList.scrollLeft;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < sheets.length; index += 1) {
      const sheet = sheets[index]!;
      const isSelected = areTableSourcesEqual(activeSource, sheet.source);
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "table_view_sheet_tab";
      tab.dataset.tableViewSheetTabIndex = String(index);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", isSelected ? "true" : "false");
      tab.tabIndex = isSelected ? 0 : -1;
      tab.title = getSheetTabTitle(sheet);
      tab.textContent = sheet.label;
      fragment.append(tab);
    }
    this.sheetTabList.replaceChildren(fragment);
    this.sheetTabScroller.setScrollPosition({ scrollLeft: previousScrollLeft });
    this.sheetTabScroller.update();
    if (shouldRevealActive) {
      this.revealActiveSheetTab();
    }
  }

  private onSheetTabListClick(event: MouseEvent): void {
    const index = getSheetTabButtonIndex(getSheetTabButtonFromEventTarget(event.target));
    if (index === null) {
      return;
    }

    this.openSheetTab(index);
  }

  private onSheetTabListKeyDown(event: KeyboardEvent): void {
    const tabButtons = this.getSheetTabButtons();
    if (!tabButtons.length) {
      return;
    }

    const currentIndex = getSheetTabButtonIndex(getSheetTabButtonFromEventTarget(event.target));
    const selectedIndex = tabButtons.findIndex(tab => tab.getAttribute("aria-selected") === "true");
    const anchorIndex = currentIndex ?? Math.max(0, selectedIndex);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (anchorIndex + tabButtons.length - 1) % tabButtons.length;
        break;
      case "ArrowRight":
        nextIndex = (anchorIndex + 1) % tabButtons.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabButtons.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openSheetTab(nextIndex);
    this.focusSheetTab(nextIndex);
  }

  private openSheetTab(index: number): void {
    const sheet = this.headerSheets[index];
    if (!sheet || areTableSourcesEqual(this.props?.tableState.source, sheet.source)) {
      return;
    }

    this.tableService.open(sheet.source);
  }

  private focusSheetTab(index: number): void {
    this.getSheetTabButtons()[index]?.focus();
  }

  private revealActiveSheetTab(): void {
    const activeTab = this.sheetTabList.querySelector<HTMLElement>(
      '.table_view_sheet_tab[aria-selected="true"]',
    );
    if (!activeTab) {
      return;
    }

    const viewportBounds = this.sheetTabList.getBoundingClientRect();
    const activeTabBounds = activeTab.getBoundingClientRect();
    let scrollLeft = this.sheetTabList.scrollLeft;
    if (activeTabBounds.right > viewportBounds.right) {
      scrollLeft += activeTabBounds.right - viewportBounds.right;
    } else if (activeTabBounds.left < viewportBounds.left) {
      scrollLeft -= viewportBounds.left - activeTabBounds.left;
    } else {
      return;
    }

    this.sheetTabScroller.setScrollPosition({ scrollLeft });
  }

  private getSheetTabButtons(): HTMLButtonElement[] {
    return Array.from(this.sheetTabList.querySelectorAll<HTMLButtonElement>(".table_view_sheet_tab"));
  }

  private updateHeaderRight(): void {
    this.updateDimensions();
    this.updateZoomControl();
  }

  private renderHeaderActions(): void {
    this.actionBar.clear();
    this.zoomControl = null;
    this.actionBar.push(this.zoomControlAction, {
      label: false,
      role: "presentation",
    });
  }

  private onControllerZoomChanged(): void {
    this.updateZoomControl();
  }

  private updateZoomControl(): void {
    syncTableZoomStepper(
      this.zoomControl,
      this.zoomStepperActions,
      this.controller?.getZoomPercent(),
    );
  }

  private updateDimensions(): void {
    const size = this.controller?.getSize() ?? null;
    const dimensions = formatTableWidgetSize(size);
    setText(this.dimensions, dimensions);
    setHidden(this.dimensions, !dimensions);
    setHidden(this.actionBar.domNode, !dimensions);
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

const formatTableWidgetSize = (size: ITableSize | null): string => {
  if (!size || size.rowCount <= 0 || size.columnCount <= 0) {
    return "";
  }

  return `${size.rowCount} \u00d7 ${size.columnCount}`;
};

const hasVisibleTableFile = (file: TableViewPaneProps["tableState"]["file"]): boolean =>
  Boolean(file && file.rowCount > 0 && file.columnCount > 0);

const getSheetTabTitle = (sheet: TableSheetTab): string => {
  const dimensions = sheet.rowCount > 0 && sheet.columnCount > 0
    ? ` (${sheet.rowCount} \u00d7 ${sheet.columnCount})`
    : "";
  return `${sheet.label}${dimensions}`;
};

const getSheetTabButtonFromEventTarget = (
  target: EventTarget | null,
): HTMLButtonElement | null => {
  if (target instanceof Element) {
    return target.closest<HTMLButtonElement>(".table_view_sheet_tab");
  }

  return null;
};

const getSheetTabButtonIndex = (
  tab: HTMLButtonElement | null,
): number | null => {
  const index = Math.floor(Number(tab?.dataset.tableViewSheetTabIndex));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

export const getTableColumnHeaderSelection = (
  templateMode: TemplateMode,
): ITableColumnHeaderSelection =>
  templateMode === "editor" ? "multi" : "single";

export const getCanAdjustColumnScale = (
  templateMode: TemplateMode,
): boolean =>
  templateMode === "management";

const toControllerProps = (
  props: TableViewPaneProps,
  tableService: ITableService,
  commandService: Pick<ICommandService, "executeCommand">,
  templateMode: TemplateMode,
): TableControllerProps => ({
  ...props,
  canAdjustColumnScale: getCanAdjustColumnScale(templateMode),
  columnHeaderSelection: getTableColumnHeaderSelection(templateMode),
  commandService,
  getColumnWidths: source => tableService.getColumnWidths(source),
  onCopySelection: () => {
    void commandService.executeCommand(COPY_TABLE_SELECTION_COMMAND_ID);
  },
  onSelect: (target, reveal) => tableService.select(target, reveal),
  storeColumnWidths: (source, widths) => tableService.storeColumnWidths(source, widths),
});

export default TableViewPane;
