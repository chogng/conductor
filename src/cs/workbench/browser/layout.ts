import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import SplitView, {
  type SplitViewPane,
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import {
  Parts,
  type IWorkbenchLayoutService,
  type IWorkbenchNavigationState,
  type LayoutView,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
  WorkbenchSidebarPaneId,
  WorkbenchSidebarPart,
  type SidebarPaneContainerInput,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  WorkbenchAuxiliaryBarPart,
  WorkbenchAuxiliaryBarPaneId,
  type AuxiliaryBarPaneContainerInput,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS } from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import type { IStorageService } from "src/cs/platform/storage/common/storage";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";

export {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
export type { LayoutView } from "src/cs/workbench/services/layout/browser/layoutService";

export const MAIN_MIN_WIDTH_PX = 220;
export const TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX = 240;

export type LayoutParts = {
  readonly controller?: Node | null;
  readonly workbench?: Node | null;
  readonly settings?: Node | null;
  readonly overlay?: Node | null;
  readonly sidebar?: Node | null;
  readonly auxiliaryBar?: Node | null;
};

type LayoutPane = "workbench" | "settings";

export type ViewPaneDefinition = {
  labelledBy: string;
  paneId: string;
  view: LayoutPane;
};

export type LayoutStateInput = {
  activeMainPart: WorkbenchMainPart;
  activeView: LayoutView;
  hasVisitedSettingsView: boolean;
  historyIndex: number;
  historyLength: number;
};

export type ViewPaneState = ViewPaneDefinition & {
  isActive: boolean;
  shouldMount: boolean;
};

export type LayoutState = ReturnType<typeof getLayoutState>;

const DEFAULT_WORKBENCH_NAVIGATION_STATE: IWorkbenchNavigationState = {
  activeMainPart: "table",
  activeView: "table",
  hasVisitedSettingsView: false,
  historyIndex: 0,
  historyLength: 1,
};

const LayoutPaneIds: Record<LayoutPane, string> = {
  workbench: "workbench-viewpane-main",
  settings: "workbench-viewpane-settings",
};

export const VIEW_PANES: Record<LayoutPane, ViewPaneDefinition> = {
  workbench: {
    labelledBy: WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS.table,
    paneId: LayoutPaneIds.workbench,
    view: "workbench",
  },
  settings: {
    labelledBy: WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS.settings,
    paneId: LayoutPaneIds.settings,
    view: "settings",
  },
};

let workbenchSidebarPortal: HTMLElement | null = null;

export const setWorkbenchSidebarPortal = (
  element: HTMLElement | null,
): void => {
  workbenchSidebarPortal = element;
};

export const useWorkbenchSidebarPortal = (): HTMLElement | null =>
  workbenchSidebarPortal;

const isWorkbenchView = (activeView: LayoutView): activeView is WorkbenchMainPart =>
  activeView !== "settings";

export class Layout extends Disposable {
  private readonly sidebarPart: WorkbenchSidebarPart;
  private readonly auxiliaryBarPart = this._register(new WorkbenchAuxiliaryBarPart());
  private readonly splitView = this._register(new MutableDisposable<SplitView>());
  private readonly main = document.createElement("div");
  private readonly sidebar: HTMLElement;
  private readonly auxiliaryBar = this.auxiliaryBarPart.element;
  private readonly overlay = document.createElement("div");
  private readonly controller = document.createElement("div");
  private readonly shell = document.createElement("div");
  private parts: LayoutParts = {};

  public readonly element = document.createElement("div");

  constructor(
    parent?: HTMLElement,
    private readonly workbenchLayoutService?: IWorkbenchLayoutService,
    storageService?: IStorageService,
  ) {
    super();

    this.sidebarPart = this._register(new WorkbenchSidebarPart(storageService));
    this.sidebar = this.sidebarPart.element;
    this.element.className = "workbench_layout";
    this.main.className = "workbench_layout_main";
    this.overlay.className = "workbench_layout_overlay";
    this.controller.className = "workbench_layout_controller";
    if (parent) {
      this.mount(parent);
    }

    if (this.workbenchLayoutService) {
      this._register(this.workbenchLayoutService.onDidChangeWorkbenchNavigation(() => this.render()));
    }
    this._register(this.sidebarPart.onDidChangeWidth(() => this.render()));
    this._register(this.auxiliaryBarPart.onDidChangeWidth(() => this.render()));
    if (this.workbenchLayoutService) {
      this._register(this.workbenchLayoutService.onDidChangePartVisibility((event) => {
        if (event.partId === Parts.SIDEBAR_PART || event.partId === Parts.AUXILIARYBAR_PART) {
          this.render();
        }
      }));
    }
  }

  public mount(parent: HTMLElement): void {
    parent.replaceChildren(this.element);
  }

  public get activeView(): LayoutView {
    return this.workbenchLayoutService?.activeView ?? "table";
  }

  public get activeWorkbenchMainPart(): WorkbenchMainPart {
    return this.workbenchLayoutService?.activeWorkbenchMainPart ?? "table";
  }

  public get state(): WorkbenchLayoutNavigationState {
    return this.createLayoutNavigationState();
  }

  public get sidebarVisible(): boolean {
    return this.isPartVisible(Parts.SIDEBAR_PART);
  }

  public navigateBack(): void {
    this.workbenchLayoutService?.navigateBack();
  }

  public navigateForward(): void {
    this.workbenchLayoutService?.navigateForward();
  }

  public navigateToView(view: LayoutView): void {
    this.workbenchLayoutService?.navigateToView(view);
  }

  public resetToView(view: LayoutView): void {
    this.workbenchLayoutService?.resetToView(view);
  }

  public selectView(view: string): void {
    this.workbenchLayoutService?.selectView(view);
  }

  public setParts(parts: LayoutParts): void {
    if (areLayoutPartsEqual(this.parts, parts)) {
      return;
    }

    this.parts = parts;
    this.render();
  }

  public resetLayoutState(): void {
    this.workbenchLayoutService?.resetLayoutState();
    this.sidebarPart.resetWidth();
    this.splitView.clear();
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

    if (this.shouldRenderSidebar()) {
      appendIfPresent(this.sidebar, isWorkbenchView(this.activeView)
        ? this.parts.sidebar
        : null);
    }

    if (this.shouldRenderSplit()) {
      appendIfPresent(
        this.auxiliaryBar,
        isWorkbenchView(this.activeView) ? this.parts.auxiliaryBar : null,
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

  protected updateSidebarPaneContainer(
    input: SidebarPaneContainerInput,
  ): void {
    this.sidebarPart.updatePaneContainer(input);
  }

  protected updateAuxiliaryBarPaneContainer(
    input: AuxiliaryBarPaneContainerInput,
  ): void {
    this.auxiliaryBarPart.updatePaneContainer(input);
  }

  private renderMain(): void {
    const state = this.state.layoutState;
    const workbenchPane = state.panes.workbench;
    const settingsPane = state.panes.settings;

    appendIfPresent(
      this.main,
      createPane({
        children: this.parts.workbench,
        isActive: workbenchPane.isActive,
        labelledBy: workbenchPane.labelledBy,
        paneId: workbenchPane.paneId,
      }),
    );
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

    if (!this.splitView.current) {
      this.splitView.current = new SplitView({
        className: "workbench_layout_split",
        gap: 0,
        onDidResizeEnd: (event) => this.handleResizeEnd(event),
        orientation: "horizontal",
        panes,
      });
    } else {
      this.splitView.current.update({
        className: "workbench_layout_split",
        gap: 0,
        onDidResizeEnd: (event) => this.handleResizeEnd(event),
        orientation: "horizontal",
        panes,
      });
    }

    const splitView = this.splitView.current;
    splitView.getPaneElement(WorkbenchSidebarPaneId)?.replaceChildren(this.sidebar);
    splitView.getPaneElement("workbench-main")?.replaceChildren(this.main);
    splitView
      .getPaneElement(WorkbenchAuxiliaryBarPaneId)
      ?.replaceChildren(this.auxiliaryBar);
    this.shell.className = "workbench_layout_shell";
    this.shell.replaceChildren(splitView.element);
    this.element.replaceChildren(
      this.controller,
      this.shell,
      this.overlay,
    );
  }

  private getSplitPanes(): readonly SplitViewPane[] {
    const panes: SplitViewPane[] = [];

    if (this.shouldRenderSidebar()) {
      panes.push(this.sidebarPart.createSplitPane());
    }

    panes.push({
      id: "workbench-main",
      minSize: MAIN_MIN_WIDTH_PX,
    });

    if (isWorkbenchView(this.activeView) && this.parts.auxiliaryBar) {
      panes.push(this.auxiliaryBarPart.createSplitPane());
    }

    return panes;
  }

  private handleResizeEnd({ sizes }: SplitViewResizeEvent): void {
    if (sizes.length < 1) {
      return;
    }

    const sidebarIndex = this.shouldRenderSidebar() ? 0 : -1;
    const nextWidth = sidebarIndex >= 0 ? sizes[sidebarIndex] : undefined;
    if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
      this.sidebarPart.resize(nextWidth);
    }

    const auxiliaryBarIndex = this.shouldRenderSidebar() ? 2 : 1;
    const nextAuxiliaryBarWidth = sizes[auxiliaryBarIndex];
    if (
      isWorkbenchView(this.activeView) &&
      this.parts.auxiliaryBar &&
      Number.isFinite(nextAuxiliaryBarWidth)
    ) {
      this.auxiliaryBarPart.resize(nextAuxiliaryBarWidth);
    }
  }

  override dispose(): void {
    setWorkbenchSidebarPortal(null);
    super.dispose();
  }

  private updateLayoutService(): void {
    this.workbenchLayoutService?.setPartHidden(false, Parts.EDITOR_PART);
    this.workbenchLayoutService?.layout();
  }

  private shouldRenderSidebar(): boolean {
    return isWorkbenchView(this.activeView) && this.isPartVisible(Parts.SIDEBAR_PART);
  }

  private shouldRenderSplit(): boolean {
    return isWorkbenchView(this.activeView) &&
      (this.shouldRenderSidebar() || Boolean(this.parts.auxiliaryBar));
  }

  private isPartVisible(part: Parts): boolean {
    return this.workbenchLayoutService?.isVisible(part) ?? true;
  }

  private createLayoutNavigationState(): WorkbenchLayoutNavigationState {
    const state = this.workbenchLayoutService?.getWorkbenchNavigationState() ??
      DEFAULT_WORKBENCH_NAVIGATION_STATE;

    return {
      ...state,
      layoutState: getLayoutState({
        activeMainPart: state.activeMainPart,
        activeView: state.activeView,
        hasVisitedSettingsView: state.hasVisitedSettingsView,
        historyIndex: state.historyIndex,
        historyLength: state.historyLength,
      }),
    };
  }
}

export const getLayoutState = ({
  activeMainPart,
  activeView,
  hasVisitedSettingsView,
  historyIndex,
  historyLength,
}: LayoutStateInput) => {
  const isSettingsActive = activeView === "settings";
  const isWorkbenchActive = !isSettingsActive;
  const workbenchLabelledBy = activeMainPart === "chart"
    ? WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS.chart
    : WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS.table;

  return {
    activeView,
    canNavigateBack: historyIndex > 0,
    canNavigateForward: historyIndex < historyLength - 1,
    panes: {
      workbench: {
        ...VIEW_PANES.workbench,
        labelledBy: workbenchLabelledBy,
        isActive: isWorkbenchActive,
        shouldMount: true,
      },
      settings: {
        ...VIEW_PANES.settings,
        isActive: isSettingsActive,
        shouldMount: isSettingsActive || hasVisitedSettingsView,
      },
    },
  };
};

export type WorkbenchLayoutNavigationState = IWorkbenchNavigationState & {
  layoutState: LayoutState;
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
  (left.workbench ?? null) === (right.workbench ?? null) &&
  (left.settings ?? null) === (right.settings ?? null) &&
  (left.overlay ?? null) === (right.overlay ?? null) &&
  (left.sidebar ?? null) === (right.sidebar ?? null) &&
  (left.auxiliaryBar ?? null) === (right.auxiliaryBar ?? null);
