import { lxAdd, lxRemove } from "@chogng/lxicon";

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { PreviewFile } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import { TableView } from "src/cs/workbench/contrib/table/browser/tableView";
import type { TableBindings } from "src/cs/workbench/services/table/common/table";

export type TableViewPaneProps = {
  readonly previewBindings: TableBindings;
  readonly previewFile?: PreviewFile | null;
  readonly previewStatus?: PreviewStatus;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

type HeaderMode = "empty" | "file" | "loading";

type HeaderState = {
  readonly dimensions?: string;
  readonly fileName: string;
  readonly mode: HeaderMode;
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

export class TableViewPane {
  public readonly element: HTMLElement;
  private readonly store = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly headerLeft = document.createElement("span");
  private readonly headerCenter = document.createElement("span");
  private readonly headerRight = document.createElement("div");
  private readonly dimensions = document.createElement("span");
  private readonly actionBar = new ActionBar({
    ariaLabel: localize("table.header.actions", "Table preview actions"),
    className: "table_view_actions",
  });
  private readonly zoomControl: ZoomControl;
  private readonly view: TableView;
  private props: TableViewPaneProps;
  private headerMode: HeaderMode | null = null;
  private zoomPercent = DEFAULT_ZOOM_PERCENT;

  constructor(props: TableViewPaneProps) {
    this.props = props;
    this.view = new TableView(toViewProps(props, this.zoomPercent));
    this.zoomControl = this.createZoomControl();
    this.store.add(this.actionBar);
    this.header.className = "table_view_header";
    this.headerLeft.className = "table_view_header_left";
    this.headerCenter.className = "table_view_header_center";
    this.headerRight.className = "table_view_header_right";
    this.dimensions.className = "table_view_dimensions";
    this.content.className = "table_view_pane_content";
    this.actionBar.append(this.zoomControl.element);
    this.headerRight.append(this.dimensions, this.actionBar.domNode);
    this.header.append(this.headerLeft, this.headerCenter, this.headerRight);
    this.content.append(this.header, this.view.element);
    this.element = createPreviewPart({
      id: TableViewId,
      ariaLabel: localize("table.preview.ariaLabel", "Table preview"),
      className: "table_view_pane",
      children: this.content,
    });
    this.update(props);
  }

  public update(props: TableViewPaneProps): void {
    this.props = props;
    this.view.update(toViewProps(props, this.zoomPercent));
    const { dimensions, fileName, mode } = getHeaderState(props);
    this.updateHeaderMode(mode);
    setText(this.headerCenter, fileName);
    setHidden(this.headerCenter, mode !== "file");
    setText(this.dimensions, dimensions ?? "");
    setHidden(this.dimensions, !dimensions);
    this.updateZoomControl();
  }

  public dispose(): void {
    this.view.dispose();
    this.store.dispose();
    this.content.replaceChildren();
    this.element.remove();
  }

  private createZoomControl(): ZoomControl {
    const element = document.createElement("div");
    element.className = "table_view_zoom_control";
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", localize("table.zoomControl", "Table zoom"));

    const decreaseButton = createZoomButton({
      className: "table_view_zoom_button table_view_zoom_button_minus",
      icon: lxRemove,
      label: localize("table.zoomOut", "Zoom out"),
    });
    const value = document.createElement("span");
    value.className = "table_view_zoom_value";
    value.setAttribute("aria-live", "polite");
    const increaseButton = createZoomButton({
      className: "table_view_zoom_button table_view_zoom_button_plus",
      icon: lxAdd,
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

  private updateZoomControl(): void {
    setText(this.zoomControl.value, `${this.zoomPercent}%`);
    setDisabled(this.zoomControl.decreaseButton, this.zoomPercent <= MIN_ZOOM_PERCENT);
    setDisabled(this.zoomControl.increaseButton, this.zoomPercent >= MAX_ZOOM_PERCENT);
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
  readonly icon: () => string;
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
    case "loading":
      return localize("table.header.loading", "预览加载中");
    case "empty":
    default:
      return localize("table.header.empty", "暂无预览");
  }
};

const getHeaderState = ({
  previewFile,
  previewStatus,
}: TableViewPaneProps): HeaderState => {
  const isLoading = previewStatus?.state === "loading";
  const fileName = previewFile?.fileName
    ? String(previewFile.fileName).replace(/\.csv$/i, "")
    : "";

  const dimensions = previewFile && !isLoading
    ? {
        value: `${Math.max(0, Number(previewFile.rowCount) || 0)} × ${Math.max(0, Number(previewFile.columnCount) || 0)}`,
      }
    : null;

  return {
    dimensions: dimensions?.value,
    fileName: isLoading ? "" : fileName,
    mode: isLoading ? "loading" : fileName ? "file" : "empty",
  };
};

const toViewProps = (
  props: TableViewPaneProps,
  zoomPercent: number,
): TableViewPaneProps & { readonly zoomPercent: number } => ({
  ...props,
  zoomPercent,
});

export default TableViewPane;
