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
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import { TableView, type TableViewProps } from "src/cs/workbench/contrib/table/browser/tableView";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import type { TableModel, TableState } from "src/cs/workbench/contrib/table/common/tableService";

export type TableViewPaneProps = {
  readonly tableModel: TableModel;
  readonly tableState: TableState;
};

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

const DEFAULT_ZOOM_PERCENT = 100;
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_STEP_PERCENT = 10;
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
  private readonly view: TableView;
  private props: TableViewPaneProps;
  private headerMode: HeaderMode | null = null;
  private zoomPercent = DEFAULT_ZOOM_PERCENT;

  constructor(props: TableViewPaneProps) {
    super({
      id: TableViewId,
      title: localize("table.ariaLabel", "Table"),
      className: "table-view-pane-root",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.props = props;
    this.view = new TableView(toViewProps(props, this.zoomPercent));
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
    this.content.append(this.view.element);
    this.previewPart = createPreviewPart({
      id: TableViewId,
      ariaLabel: localize("table.ariaLabel", "Table"),
      actionbarContent: this.headerRight,
      className: "table_view_pane",
      children: this.content,
      titleContent: this.headerTitle,
    });
    this.body.append(this.previewPart);
    this.update(props);
  }

  public update(props: TableViewPaneProps): void {
    this.props = props;
    this.view.update(toViewProps(props, this.zoomPercent));
    const { dimensions, fileName, mode, shouldUpdateDimensions } = getHeaderState(props);
    this.updateHeaderMode(mode);
    this.updateHeaderCenter(fileName, mode === "file");
    this.updateHeaderRight(dimensions, shouldUpdateDimensions);
  }

  public dispose(): void {
    this.view.dispose();
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
    });
    const value = document.createElement("span");
    value.className = "table_view_zoom_value";
    value.setAttribute("aria-live", "polite");
    const increaseButton = createZoomButton({
      className: "table_view_zoom_button table_view_zoom_button_plus",
      icon: LxIcon.add,
      label: localize("table.zoomIn", "Zoom in"),
    });

    this.store.add(addDisposableListener(decreaseButton, EventType.CLICK, () => {
      this.setZoomPercent(this.zoomPercent - ZOOM_STEP_PERCENT);
    }));
    this.store.add(addDisposableListener(increaseButton, EventType.CLICK, () => {
      this.setZoomPercent(this.zoomPercent + ZOOM_STEP_PERCENT);
    }));

    element.append(decreaseButton, value, increaseButton);
    return {
      decreaseButton,
      element,
      increaseButton,
      value,
    };
  }

  private setZoomPercent(value: number): void {
    const nextZoomPercent = clampZoomPercent(value);
    if (nextZoomPercent === this.zoomPercent) {
      return;
    }

    this.zoomPercent = nextZoomPercent;
    this.view.update(toViewProps(this.props, this.zoomPercent));
    this.updateZoomControl();
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
    setText(this.zoomControl.value, `${this.zoomPercent}%`);
    setDisabled(this.zoomControl.decreaseButton, this.zoomPercent <= MIN_ZOOM_PERCENT);
    setDisabled(this.zoomControl.increaseButton, this.zoomPercent >= MAX_ZOOM_PERCENT);
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
}: {
  readonly className: string;
  readonly icon: LxIconDefinition;
  readonly label: string;
}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createLxIcon({
    icon,
    size: 14,
  }));
  return button;
};

const clampZoomPercent = (value: number): number =>
  Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, value));

const getHeaderLabel = (mode: HeaderMode): string => {
  switch (mode) {
    case "file":
      return localize("table.header.filename", "文件名");
    case "empty":
    default:
      return localize("table.header.empty", "暂无预览");
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

const toViewProps = (
  props: TableViewPaneProps,
  zoomPercent: number,
): TableViewProps => ({
  ...props,
  zoomPercent,
});

export default TableViewPane;
