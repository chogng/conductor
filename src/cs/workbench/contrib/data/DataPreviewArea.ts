import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import SplitViewWidget, {
  type SplitViewPane,
} from "src/cs/base/browser/ui/splitview/splitviewWidget";
import { DisposableStore } from "src/cs/base/common/lifecycle";

export type DataPreviewAreaProps = {
  readonly importPanel?: Node | null;
  readonly tablePreview?: Node | null;
  readonly templatePanel?: Node | null;
};

export class DataPreviewAreaView {
  public readonly element: HTMLElement;
  private readonly widget: SplitViewWidget;
  private readonly store = new DisposableStore();
  private isStacked = false;
  private props: DataPreviewAreaProps;

  constructor(props: DataPreviewAreaProps) {
    this.props = props;
    this.widget = new SplitViewWidget({
      className: "data_preview_area",
      gap: 12,
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
    const orientation = this.isStacked ? "vertical" : "horizontal";
    const className = this.isStacked
      ? "data_preview_area data_preview_area--stacked"
      : "data_preview_area";
    this.widget.update({
      className,
      gap: 12,
      orientation,
      panes: getPanes(this.isStacked),
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

const getPanes = (isStacked: boolean): readonly SplitViewPane[] =>
  isStacked
    ? [
      {
        id: "import-panel",
        defaultSize: 220,
        minSize: 200,
        maxSize: 360,
      },
      {
        id: "table-preview",
        minSize: 240,
      },
      {
        id: "template-panel",
        defaultSize: 220,
        minSize: 200,
        maxSize: 360,
      },
    ]
    : [
      {
        id: "import-panel",
        defaultSize: 260,
        minSize: 200,
        maxSize: 420,
      },
      {
        id: "table-preview",
        minSize: 240,
      },
      {
        id: "template-panel",
        defaultSize: 260,
        minSize: 200,
        maxSize: 360,
      },
    ];

const replacePane = (
  widget: SplitViewWidget,
  id: string,
  content: Node | null | undefined,
): void => {
  const element = widget.getPaneElement(id);
  if (!element) {
    return;
  }
  element.replaceChildren();
  if (content) {
    element.append(content);
  }
};

export default DataPreviewArea;
