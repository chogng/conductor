import { Emitter } from "src/cs/base/common/event";
import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import SplitView, {
  type SplitViewPane,
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import {
  INITIAL_VISITED_VIEWS_STATE,
  LayoutViewSwitchIds,
  markVisitedLayoutView,
  navigateLayoutBack,
  navigateLayoutForward,
  navigateToLayoutPage,
  resetVisitedAnalysisLayoutView,
  resolveLayoutView,
  type VisitedLayoutViewsState,
} from "src/cs/workbench/browser/actions/layoutActions";
import {
  Parts,
  type IWorkbenchLayoutService,
} from "src/cs/workbench/services/layout/browser/layoutService";

export const SIDEBAR_DEFAULT_WIDTH_PX = 300;
export const SIDEBAR_MIN_WIDTH_PX = 220;
export const SIDEBAR_MAX_WIDTH_PX = 520;
export const WORKBENCH_STACK_LAYOUT_THRESHOLD_PX = 860;
export const TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX = 250;

export type LayoutParts = {
  readonly controller?: Node | null;
  readonly data?: Node | null;
  readonly analysis?: Node | null;
  readonly settings?: Node | null;
  readonly overlay?: Node | null;
  readonly sidebar?: Node | null;
  readonly auxiliaryBar?: Node | null;
};

export type LayoutView = "data" | "analysis" | "settings";

export type LayoutNavigationState = {
  activeView: LayoutView;
  history: LayoutView[];
  historyIndex: number;
};

export type ViewPaneDefinition = {
  labelledBy: string;
  paneId: string;
  view: LayoutView;
};

export type LayoutStateInput = {
  activeView: LayoutView;
  hasVisitedAnalysisView: boolean;
  hasVisitedSettingsView: boolean;
  historyIndex: number;
  historyLength: number;
};

export type ViewPaneState = ViewPaneDefinition & {
  isActive: boolean;
  shouldMount: boolean;
};

export type LayoutState = ReturnType<typeof getLayoutState>;

export const INITIAL_LAYOUT_NAVIGATION_STATE: LayoutNavigationState = {
  activeView: "data",
  history: ["data"],
  historyIndex: 0,
};

const LayoutPaneIds: Record<LayoutView, string> = {
  data: "analysis-viewpane-data",
  analysis: "analysis-viewpane-analysis",
  settings: "analysis-viewpane-settings",
};

export const VIEW_PANES: Record<LayoutView, ViewPaneDefinition> = {
  data: {
    labelledBy: LayoutViewSwitchIds.data,
    paneId: LayoutPaneIds.data,
    view: "data",
  },
  analysis: {
    labelledBy: LayoutViewSwitchIds.analysis,
    paneId: LayoutPaneIds.analysis,
    view: "analysis",
  },
  settings: {
    labelledBy: LayoutViewSwitchIds.settings,
    paneId: LayoutPaneIds.settings,
    view: "settings",
  },
};

export const clampSidebarWidth = (width: number): number =>
  Math.max(
    SIDEBAR_MIN_WIDTH_PX,
    Math.min(SIDEBAR_MAX_WIDTH_PX, Math.round(width)),
  );

export class WorkbenchSidebarLayout {
  private _sidebarWidth = SIDEBAR_DEFAULT_WIDTH_PX;
  private readonly onDidChangeWidthEmitter = new Emitter<number>();

  public readonly onDidChangeWidth = this.onDidChangeWidthEmitter.event;

  public get sidebarWidth(): number {
    return this._sidebarWidth;
  }

  public resize(width: number): void {
    const nextWidth = clampSidebarWidth(width);
    if (nextWidth === this._sidebarWidth) {
      return;
    }
    this._sidebarWidth = nextWidth;
    this.onDidChangeWidthEmitter.fire(nextWidth);
  }

  public dispose(): void {
    this.onDidChangeWidthEmitter.dispose();
  }
}

let workbenchSidebarPortal: HTMLElement | null = null;

export const setWorkbenchSidebarPortal = (
  element: HTMLElement | null,
): void => {
  workbenchSidebarPortal = element;
};

export const useWorkbenchSidebarPortal = (): HTMLElement | null =>
  workbenchSidebarPortal;

const hasSidebar = (activeView: LayoutView): boolean =>
  activeView === "data" || activeView === "analysis";

export class Layout extends Disposable {
  private readonly navigation = this._register(new WorkbenchLayoutNavigation());
  private readonly sidebarLayout = this._register(new WorkbenchSidebarLayout());
  private readonly auxiliaryBarLayout = this._register(new WorkbenchSidebarLayout());
  private readonly splitView = this._register(new MutableDisposable<SplitView>());
  private readonly main = document.createElement("div");
  private readonly sidebar = document.createElement("div");
  private readonly auxiliaryBar = document.createElement("div");
  private readonly overlay = document.createElement("div");
  private readonly controller = document.createElement("div");
  private readonly shell = document.createElement("div");
  private parts: LayoutParts = {};
  private isStacked = false;

  public readonly element = document.createElement("div");

  constructor(
    parent?: HTMLElement,
    private readonly workbenchLayoutService?: IWorkbenchLayoutService,
  ) {
    super();

    this.element.className = "workbench_layout";
    this.main.className = "workbench_layout_main";
    this.sidebar.className = "workbench_layout_sidebar";
    this.auxiliaryBar.className = "workbench_layout_auxiliarybar";
    this.overlay.className = "workbench_layout_overlay";
    this.controller.className = "workbench_layout_controller";
    if (parent) {
      this.mount(parent);
    }

    this._register(this.navigation.onDidChangeState(() => this.render()));
    this._register(this.sidebarLayout.onDidChangeWidth(() => this.render()));
    this._register(this.auxiliaryBarLayout.onDidChangeWidth(() => this.render()));
    this._register(
      new DisposableResizeObserver(getWindow(this.element), () => {
        this.syncResponsiveState();
      }).observe(this.element),
    );
    this.syncResponsiveState();
  }

  public mount(parent: HTMLElement): void {
    parent.replaceChildren(this.element);
  }

  public get activeView(): LayoutView {
    return this.navigation.getState().activeView;
  }

  public get state(): WorkbenchLayoutNavigationState {
    return this.navigation.getState();
  }

  public navigateBack(): void {
    this.navigation.navigateBack();
  }

  public navigateForward(): void {
    this.navigation.navigateForward();
  }

  public navigateToView(view: LayoutView): void {
    this.navigation.navigateToView(view);
  }

  public selectView(view: string): void {
    this.navigation.selectView(view);
  }

  public resetAnalysisViewVisit(): void {
    this.navigation.resetAnalysisViewVisit();
  }

  public setParts(parts: LayoutParts): void {
    if (areLayoutPartsEqual(this.parts, parts)) {
      return;
    }

    this.parts = parts;
    this.render();
  }

  private render(): void {
    this.controller.replaceChildren();
    this.main.replaceChildren();
    this.sidebar.replaceChildren();
    this.auxiliaryBar.replaceChildren();
    this.overlay.replaceChildren();

    appendIfPresent(this.controller, this.parts.controller);
    this.renderMain();
    appendIfPresent(this.overlay, this.parts.overlay);

    if (hasSidebar(this.activeView)) {
      appendIfPresent(this.sidebar, this.activeView === "data"
        ? this.parts.sidebar
        : null);
      appendIfPresent(
        this.auxiliaryBar,
        this.activeView === "data" ? this.parts.auxiliaryBar : null,
      );
      this.renderSplit();
      setWorkbenchSidebarPortal(null);
    } else {
      this.splitView.clear();
      setWorkbenchSidebarPortal(null);
      this.element.replaceChildren(this.controller, this.main, this.overlay);
    }

    this.updateLayoutService();
    this.onDidRenderLayout();
  }

  protected onDidRenderLayout(): void {}

  private renderMain(): void {
    const state = this.navigation.getState().layoutState;
    const dataPane = state.panes.data;
    const analysisPane = state.panes.analysis;
    const settingsPane = state.panes.settings;

    appendIfPresent(
      this.main,
      createPane({
        children: this.parts.data,
        isActive: dataPane.isActive,
        labelledBy: dataPane.labelledBy,
        paneId: dataPane.paneId,
      }),
    );
    if (analysisPane.shouldMount) {
      appendIfPresent(
        this.main,
        createPane({
          children: this.parts.analysis,
          isActive: analysisPane.isActive,
          labelledBy: analysisPane.labelledBy,
          paneId: analysisPane.paneId,
        }),
      );
    }
    if (settingsPane.shouldMount) {
      appendIfPresent(
        this.main,
        createPane({
          children: this.parts.settings,
          isActive: settingsPane.isActive,
          labelledBy: settingsPane.labelledBy,
          paneId: settingsPane.paneId,
        }),
      );
    }
  }

  private renderSplit(): void {
    const panes = this.getSplitPanes();
    const orientation = this.isStacked ? "vertical" : "horizontal";
    const shellClassName = this.isStacked
      ? "workbench_layout_shell workbench_layout_shell--stacked"
      : "workbench_layout_shell";

    if (!this.splitView.current) {
      this.splitView.current = new SplitView({
        className: "workbench_layout_split",
        gap: 0,
        onDidResizeEnd: (event) => this.handleResizeEnd(event),
        orientation,
        panes,
      });
    } else {
      this.splitView.current.update({
        className: "workbench_layout_split",
        gap: 0,
        onDidResizeEnd: (event) => this.handleResizeEnd(event),
        orientation,
        panes,
      });
    }

    const splitView = this.splitView.current;
    splitView.getPaneElement("workbench-sidebar")?.replaceChildren(this.sidebar);
    splitView.getPaneElement("workbench-main")?.replaceChildren(this.main);
    splitView
      .getPaneElement("workbench-auxiliarybar")
      ?.replaceChildren(this.auxiliaryBar);
    this.shell.className = shellClassName;
    this.shell.replaceChildren(splitView.element);
    this.element.replaceChildren(
      this.controller,
      this.shell,
      this.overlay,
    );
  }

  private getSplitPanes(): readonly SplitViewPane[] {
    if (this.isStacked) {
      const panes: SplitViewPane[] = [
        {
          id: "workbench-sidebar",
          defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
          minSize: SIDEBAR_MIN_WIDTH_PX,
          maxSize: SIDEBAR_MAX_WIDTH_PX,
        },
        {
          id: "workbench-main",
          minSize: 320,
        },
      ];

      if (this.activeView === "data" && this.parts.auxiliaryBar) {
        panes.push({
          id: "workbench-auxiliarybar",
          defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
          minSize: SIDEBAR_MIN_WIDTH_PX,
          maxSize: SIDEBAR_MAX_WIDTH_PX,
        });
      }

      return panes;
    }

    const panes: SplitViewPane[] = [
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

    if (this.activeView === "data" && this.parts.auxiliaryBar) {
      panes.push({
        id: "workbench-auxiliarybar",
        defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
        minSize: SIDEBAR_MIN_WIDTH_PX,
        maxSize: SIDEBAR_MAX_WIDTH_PX,
        size: this.auxiliaryBarLayout.sidebarWidth,
      });
    }

    return panes;
  }

  private handleResizeEnd({ sizes }: SplitViewResizeEvent): void {
    if (this.isStacked || sizes.length < 1) {
      return;
    }

    const nextWidth = sizes[0];
    if (Number.isFinite(nextWidth)) {
      this.sidebarLayout.resize(nextWidth);
    }

    const nextAuxiliaryBarWidth = sizes[2];
    if (
      this.activeView === "data" &&
      this.parts.auxiliaryBar &&
      Number.isFinite(nextAuxiliaryBarWidth)
    ) {
      this.auxiliaryBarLayout.resize(nextAuxiliaryBarWidth);
    }
  }

  private syncResponsiveState(): void {
    const nextIsStacked =
      this.element.clientWidth > 0 &&
      this.element.clientWidth < WORKBENCH_STACK_LAYOUT_THRESHOLD_PX;
    if (nextIsStacked === this.isStacked) {
      return;
    }

    this.isStacked = nextIsStacked;
    this.render();
  }

  override dispose(): void {
    setWorkbenchSidebarPortal(null);
    super.dispose();
  }

  private updateLayoutService(): void {
    this.workbenchLayoutService?.setPartHidden(
      !hasSidebar(this.activeView),
      Parts.SIDEBAR_PART,
    );
    this.workbenchLayoutService?.setPartHidden(false, Parts.EDITOR_PART);
    this.workbenchLayoutService?.layout();
  }
}

export const getLayoutState = ({
  activeView,
  hasVisitedAnalysisView,
  hasVisitedSettingsView,
  historyIndex,
  historyLength,
}: LayoutStateInput) => {
  const isDataActive = activeView === "data";
  const isAnalysisActive = activeView === "analysis";
  const isSettingsActive = activeView === "settings";

  return {
    activeView,
    canNavigateBack: historyIndex > 0,
    canNavigateForward: historyIndex < historyLength - 1,
    panes: {
      data: {
        ...VIEW_PANES.data,
        isActive: isDataActive,
        shouldMount: true,
      },
      analysis: {
        ...VIEW_PANES.analysis,
        isActive: isAnalysisActive,
        shouldMount: isAnalysisActive || hasVisitedAnalysisView,
      },
      settings: {
        ...VIEW_PANES.settings,
        isActive: isSettingsActive,
        shouldMount: isSettingsActive || hasVisitedSettingsView,
      },
    },
  };
};

export class WorkbenchLayoutNavigation extends Disposable {
  private navigation = INITIAL_LAYOUT_NAVIGATION_STATE;
  private visitedViews = INITIAL_VISITED_VIEWS_STATE;
  private readonly onDidChangeStateEmitter = this._register(
    new Emitter<WorkbenchLayoutNavigationState>(),
  );

  public readonly onDidChangeState = this.onDidChangeStateEmitter.event;

  constructor() {
    super();
    this.markActiveViewVisited();
  }

  public getState(): WorkbenchLayoutNavigationState {
    return this.createState();
  }

  public navigateToView(nextView: LayoutView): void {
    this.setNavigation(navigateToLayoutPage(this.navigation, nextView));
  }

  public navigateBack(): void {
    this.setNavigation(navigateLayoutBack(this.navigation));
  }

  public navigateForward(): void {
    this.setNavigation(navigateLayoutForward(this.navigation));
  }

  public selectView(nextView: string): void {
    const resolvedView = resolveLayoutView(nextView);
    if (resolvedView) {
      this.navigateToView(resolvedView);
    }
  }

  public resetAnalysisViewVisit(): void {
    this.visitedViews = resetVisitedAnalysisLayoutView(this.visitedViews);
    this.fireStateChange();
  }

  private setNavigation(nextNavigation: LayoutNavigationState): void {
    if (nextNavigation === this.navigation) {
      return;
    }
    this.navigation = nextNavigation;
    this.markActiveViewVisited();
    this.blurActiveElement();
    this.fireStateChange();
  }

  private markActiveViewVisited(): void {
    this.visitedViews = markVisitedLayoutView(
      this.visitedViews,
      this.navigation.activeView,
    );
  }

  private createState(): WorkbenchLayoutNavigationState {
    const activeView = this.navigation.activeView;
    return {
      activeView,
      layoutState: getLayoutState({
        activeView,
        hasVisitedAnalysisView: this.visitedViews.hasVisitedAnalysisView,
        hasVisitedSettingsView: this.visitedViews.hasVisitedSettingsView,
        historyIndex: this.navigation.historyIndex,
        historyLength: this.navigation.history.length,
      }),
      visitedViews: this.visitedViews,
    };
  }

  private fireStateChange(): void {
    this.onDidChangeStateEmitter.fire(this.createState());
  }

  private blurActiveElement(): void {
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement instanceof HTMLElement &&
      typeof activeElement.blur === "function"
    ) {
      activeElement.blur();
    }
  }
}

export type WorkbenchLayoutNavigationState = {
  activeView: LayoutView;
  layoutState: LayoutState;
  visitedViews: VisitedLayoutViewsState;
};

const createPane = ({
  children,
  isActive,
  labelledBy,
  paneId,
}: {
  readonly children?: Node | null;
  readonly isActive: boolean;
  readonly labelledBy: string;
  readonly paneId: string;
}): HTMLElement => {
  const section = document.createElement("section");
  section.id = paneId;
  section.role = "region";
  section.setAttribute("aria-labelledby", labelledBy);
  section.setAttribute("aria-hidden", String(!isActive));
  section.className = isActive
    ? "workbench_layout_pane"
    : "workbench_layout_pane workbench_layout_pane--hidden";
  if (!isActive) {
    section.inert = true;
  }
  appendIfPresent(section, children);
  return section;
};

const appendIfPresent = (
  parent: HTMLElement,
  child: Node | null | undefined,
): void => {
  if (child) {
    parent.append(child);
  }
};

const areLayoutPartsEqual = (
  left: LayoutParts,
  right: LayoutParts,
): boolean =>
  (left.controller ?? null) === (right.controller ?? null) &&
  (left.data ?? null) === (right.data ?? null) &&
  (left.analysis ?? null) === (right.analysis ?? null) &&
  (left.settings ?? null) === (right.settings ?? null) &&
  (left.overlay ?? null) === (right.overlay ?? null) &&
  (left.sidebar ?? null) === (right.sidebar ?? null) &&
  (left.auxiliaryBar ?? null) === (right.auxiliaryBar ?? null);
