import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import SplitView, {
  type SplitViewPane,
} from "src/cs/base/browser/ui/splitview/splitview";
import { DisposableStore } from "src/cs/base/common/lifecycle";

import "src/cs/workbench/contrib/data/DataPreviewArea.css";

export type DataPreviewAreaProps = {
  readonly importPanel?: Node | null;
  readonly joinTableAndTemplateCards?: boolean;
  readonly tablePreview?: Node | null;
  readonly templatePanel?: Node | null;
};

export class DataPreviewAreaView {
  public readonly element: HTMLElement;
  private readonly widget: SplitView;
  private readonly store = new DisposableStore();
  private isStacked = false;
  private props: DataPreviewAreaProps;

  constructor(props: DataPreviewAreaProps) {
    this.props = props;
    this.widget = new SplitView({
      className: "data_preview_area",
      gap: 0,
      orientation: "horizontal",
      panes: getPanes(false),
    });
    this.element = this.widget.element;
    this.store.add(this.widget);
    this.store.add(
      new DisposableResizeObserver(getWindow(this.element), () => {
        this.syncResponsiveState();
      }).observe(this.element),
    );
    this.render();
    this.syncResponsiveState();
  }

  public update(props: DataPreviewAreaProps): void {
    this.props = props;
    this.render();
  }

  public dispose(): void {
    this.store.dispose();
  }

  private render(): void {
    const hasImportPanel = Boolean(this.props.importPanel);
    const joinsTableAndTemplate =
      Boolean(this.props.joinTableAndTemplateCards) && !hasImportPanel;
    const orientation = this.isStacked ? "vertical" : "horizontal";
    const classNames = ["data_preview_area"];
    if (this.isStacked) {
      classNames.push("data_preview_area--stacked");
    }
    if (joinsTableAndTemplate) {
      classNames.push("data_preview_area--joined_cards");
    }
    this.widget.update({
      className: classNames.join(" "),
      gap: 0,
      orientation,
      panes: getPanes(this.isStacked, hasImportPanel),
    });
    replacePane(this.widget, "import-panel", this.props.importPanel);
    replacePane(this.widget, "table-preview", this.props.tablePreview);
    replacePane(this.widget, "template-panel", this.props.templatePanel);
  }

  private syncResponsiveState(): void {
    const nextIsStacked =
      this.element.clientWidth > 0 &&
      this.element.clientWidth < DATA_PREVIEW_STACK_THRESHOLD_PX;
    if (nextIsStacked === this.isStacked) {
      return;
    }

    this.isStacked = nextIsStacked;
    this.render();
  }
}

const DataPreviewArea = (props: DataPreviewAreaProps): any =>
  new DataPreviewAreaView(props).element;

const DATA_PREVIEW_STACK_THRESHOLD_PX = 700;

const getPanes = (
  isStacked: boolean,
  hasImportPanel = true,
): readonly SplitViewPane[] => {
  const panes: SplitViewPane[] = [];

  if (hasImportPanel) {
    panes.push(
      {
        id: "import-panel",
        className: "data_preview_area_import_pane",
        defaultSize: isStacked ? 220 : 260,
        minSize: 200,
        maxSize: isStacked ? 360 : 420,
      },
    );
  }

  panes.push(
    {
      id: "table-preview",
      className: "data_preview_area_table_pane",
      minSize: 240,
    },
    {
      id: "template-panel",
      className: "data_preview_area_template_pane",
      defaultSize: isStacked ? 220 : 260,
      minSize: 200,
      maxSize: 360,
    },
  );

  return panes;
};

const replacePane = (
  widget: SplitView,
  id: string,
  content: Node | null | undefined,
): void => {
  const element = widget.getPaneElement(id);
  if (!element) {
    return;
  }

  const currentChild = element.firstChild;
  if (content) {
    if (currentChild === content && element.childNodes.length === 1) {
      return;
    }

    element.replaceChildren(content);
    return;
  }

  if (currentChild) {
    element.replaceChildren();
  }
};

export default DataPreviewArea;
