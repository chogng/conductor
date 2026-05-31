import SplitViewWidget, {
  type SplitViewPane,
} from "src/cs/base/browser/ui/splitview/splitviewWidget";
import type { SplitViewResizeEvent } from "src/cs/base/browser/ui/splitview/splitview";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  setWorkbenchSidebarPortal,
  type LayoutView,
  WorkbenchSidebarLayout,
} from "src/cs/workbench/browser/layout";

export type WorkbenchLayoutOptions = {
  readonly activeView: LayoutView;
  readonly children?: Node | null;
  readonly dataSidebar?: Node | null;
};

const hasWorkbenchSidebar = (activeView: LayoutView): boolean =>
  activeView === "data" || activeView === "analysis";

export class WorkbenchLayout extends Disposable {
  public readonly element: HTMLElement;
  private readonly sidebarLayout = this._register(new WorkbenchSidebarLayout());
  private widget: SplitViewWidget | null = null;

  constructor(options: WorkbenchLayoutOptions) {
    super();
    this.element = document.createElement("div");
    this.element.className = "h-full min-h-0";
    this.update(options);
  }

  public update(options: WorkbenchLayoutOptions): void {
    if (!hasWorkbenchSidebar(options.activeView)) {
      this.widget?.dispose();
      this.widget = null;
      setWorkbenchSidebarPortal(null);
      this.element.replaceChildren(createMainPane(options.children));
      return;
    }

    if (!this.widget) {
      this.widget = this._register(
        new SplitViewWidget({
          className: "h-full min-h-0",
          gap: 2,
          onDidResizeEnd: (event) => this.handleResizeEnd(event),
          orientation: "horizontal",
          panes: this.getPanes(options),
        }),
      );
      this.element.replaceChildren(this.widget.element);
    }

    this.widget.update({
      className: "h-full min-h-0",
      gap: 2,
      onDidResizeEnd: (event) => this.handleResizeEnd(event),
      orientation: "horizontal",
      panes: this.getPanes(options),
    });

    const sidebarElement = this.widget.getPaneElement("workbench-sidebar");
    const mainElement = this.widget.getPaneElement("workbench-main");
    sidebarElement?.replaceChildren();
    mainElement?.replaceChildren();

    if (sidebarElement && options.activeView === "data" && options.dataSidebar) {
      sidebarElement.append(options.dataSidebar);
    }
    if (mainElement && options.children) {
      mainElement.append(options.children);
    }

    setWorkbenchSidebarPortal(
      options.activeView === "analysis" ? (sidebarElement ?? null) : null,
    );
  }

  public override dispose(): void {
    setWorkbenchSidebarPortal(null);
    this.widget?.dispose();
    this.widget = null;
    super.dispose();
  }

  private getPanes(options: WorkbenchLayoutOptions): readonly SplitViewPane[] {
    return [
      {
        id: "workbench-sidebar",
        defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
        minSize: SIDEBAR_MIN_WIDTH_PX,
        maxSize: SIDEBAR_MAX_WIDTH_PX,
        size: this.sidebarLayout.sidebarWidth,
      },
      {
        id: "workbench-main",
        minSize: 520,
      },
    ];
  }

  private handleResizeEnd({ sizes }: SplitViewResizeEvent): void {
    const nextWidth = sizes[0];
    if (Number.isFinite(nextWidth)) {
      this.sidebarLayout.resize(nextWidth);
    }
  }
}

const createMainPane = (content: Node | null | undefined): HTMLElement => {
  const element = document.createElement("div");
  element.className = "h-full min-h-0";
  if (content) {
    element.append(content);
  }
  return element;
};

export default WorkbenchLayout;
