import SplitViewWidget, {
  type SplitViewPane,
} from "src/cs/base/browser/ui/splitview/splitviewWidget";

export type DataPreviewAreaProps = {
  readonly tabPanel?: Node | null;
  readonly tablePreview?: Node | null;
};

export class DataPreviewAreaView {
  public readonly element: HTMLElement;
  private readonly widget: SplitViewWidget;

  constructor(props: DataPreviewAreaProps) {
    this.widget = new SplitViewWidget({
      className: "flex-1 min-h-0",
      gap: 16,
      orientation: "horizontal",
      panes: getPanes(),
    });
    this.element = this.widget.element;
    this.update(props);
  }

  public update(props: DataPreviewAreaProps): void {
    this.widget.update({
      className: "flex-1 min-h-0",
      gap: 16,
      orientation: "horizontal",
      panes: getPanes(),
    });
    replacePane(this.widget, "tab-panel", props.tabPanel);
    replacePane(this.widget, "table-preview", props.tablePreview);
  }

  public dispose(): void {
    this.widget.dispose();
  }
}

const DataPreviewArea = (props: DataPreviewAreaProps): any =>
  new DataPreviewAreaView(props).element;

const getPanes = (): readonly SplitViewPane[] => [
  {
    id: "tab-panel",
    defaultSize: 300,
    minSize: 250,
    maxSize: 460,
  },
  {
    id: "table-preview",
    minSize: 420,
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
