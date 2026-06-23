import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";
import {
  replaceChildrenIfChanged,
  scheduleAtNextAnimationFrame,
} from "src/cs/base/browser/dom";
import SplitView, {
  type SplitViewPane,
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import {
  Parts,
  type IWorkbenchLayoutService,
  type IWorkbenchNavigationState,
  type LayoutView,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { SidebarPart } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { AuxiliaryBarPart } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS } from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import type { IStorageService } from "src/cs/platform/storage/common/storage";

export type { LayoutView } from "src/cs/workbench/services/layout/browser/layoutService";

const getLayoutBootNowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const getLayoutBootErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const logLayoutBoot = (stage: string, extra = ""): void => {
  if (!isLayoutBootLoggingEnabled()) {
    return;
  }

  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const isLayoutBootLoggingEnabled = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.__CONDUCTOR_BOOT_LOG__ === "function";

const measureLayoutBoot = <T>(stage: string, run: () => T): T => {
  if (!isLayoutBootLoggingEnabled()) {
    return run();
  }

  const startedAt = getLayoutBootNowMs();
  logLayoutBoot(`${stage}:start`);
  try {
    const result = run();
    logLayoutBoot(
      `${stage}:done`,
      `(duration=${Math.round(getLayoutBootNowMs() - startedAt)}ms)`,
    );
    return result;
  } catch (error) {
    logLayoutBoot(
      `${stage}:failed`,
      `(duration=${Math.round(getLayoutBootNowMs() - startedAt)}ms message=${getLayoutBootErrorMessage(error)})`,
    );
    throw error;
  }
};

export const MAIN_MIN_WIDTH_PX = 220;
export const TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX = 240;
const LAYOUT_TRANSITION_DURATION_MS = 300;

type SidebarPaneContainerInput = Parameters<SidebarPart["updatePaneContainer"]>[0];
type AuxiliaryBarPaneContainerInput = Parameters<AuxiliaryBarPart["updatePaneContainer"]>[0];

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
  private readonly sidebarPart: SidebarPart;
  private readonly auxiliaryBarPart: AuxiliaryBarPart;
  private readonly splitView = this._register(new MutableDisposable<SplitView>());
  private readonly scheduledLayoutServiceUpdate =
    this._register(new MutableDisposable());
  private readonly main = document.createElement("div");
  private readonly settingsMain = document.createElement("div");
  private readonly sidebar: HTMLElement;
  private readonly auxiliaryBar: HTMLElement;
  private readonly overlay = document.createElement("div");
  private readonly controller = document.createElement("div");
  private readonly shell = document.createElement("div");
  private readonly viewStack = document.createElement("div");
  private readonly workbenchPane = createPaneElement(VIEW_PANES.workbench.paneId);
  private readonly settingsPane = createPaneElement(VIEW_PANES.settings.paneId);
  private parts: LayoutParts = {};
  private hasRenderedAuxiliaryBarPane = false;
  private layoutTransitionPart: Parts.SIDEBAR_PART | Parts.AUXILIARYBAR_PART | null = null;
  private layoutTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly element = document.createElement("div");

  constructor(
    parent?: HTMLElement,
    private readonly workbenchLayoutService?: IWorkbenchLayoutService,
    storageService?: IStorageService,
  ) {
    super();

    this.sidebarPart = this._register(new SidebarPart(storageService));
    this.auxiliaryBarPart = this._register(new AuxiliaryBarPart(storageService));
    this.sidebar = this.sidebarPart.element;
    this.auxiliaryBar = this.auxiliaryBarPart.element;
    this.element.className = "workbench_layout";
    this.main.className = "workbench_layout_main";
    this.settingsMain.className = "workbench_layout_main workbench_layout_settings";
    this.overlay.className = "workbench_layout_overlay";
    this.controller.className = "workbench_layout_controller";
    this.shell.className = "workbench_layout_shell";
    this.viewStack.className = "workbench_layout_view_stack";
    if (parent) {
      this.mount(parent);
    }

    if (this.workbenchLayoutService) {
      this._register(this.workbenchLayoutService.onDidChangeWorkbenchNavigation(() => {
        this.clearLayoutTransition();
        this.render();
      }));
    }
    this._register(this.sidebarPart.onDidChangeWidth(() => this.render()));
    this._register(this.auxiliaryBarPart.onDidChangeWidth(() => this.render()));
    if (this.workbenchLayoutService) {
      this._register(this.workbenchLayoutService.onDidChangePartVisibility((event) => {
        if (event.partId === Parts.SIDEBAR_PART || event.partId === Parts.AUXILIARYBAR_PART) {
          this.renderWithLayoutTransition(event.partId);
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
    this.auxiliaryBarPart.resetWidth();
    this.clearLayoutTransition();
    this.splitView.clear();
    this.render();
  }

  private render(): void {
    measureLayoutBoot("workbench:layout:render", () => {
      const workbenchActive = isWorkbenchView(this.activeView);
      const renderSingleWorkbenchPane = this.shouldRenderSingleWorkbenchPane(workbenchActive);
      measureLayoutBoot("workbench:layout:render:classes", () => {
        if (this.parts.auxiliaryBar) {
          this.hasRenderedAuxiliaryBarPane = true;
        }
        this.element.classList.toggle("sidebar-hidden", !this.isPartVisible(Parts.SIDEBAR_PART));
        this.element.classList.toggle("auxiliarybar-hidden", !this.isPartVisible(Parts.AUXILIARYBAR_PART));
      });

      measureLayoutBoot("workbench:layout:render:parts", () => {
        replaceOptionalChildIfChanged(this.controller, this.parts.controller);
        this.renderWorkbenchMain();
        this.renderSettingsMain();
        replaceOptionalChildIfChanged(this.overlay, this.parts.overlay);
        replaceOptionalChildIfChanged(this.sidebar, this.parts.sidebar);
        replaceOptionalChildIfChanged(this.auxiliaryBar, this.parts.auxiliaryBar);
      });
      measureLayoutBoot("workbench:layout:render:workbench-shell", () => {
        this.renderWorkbenchShell(workbenchActive, renderSingleWorkbenchPane);
      });
      measureLayoutBoot("workbench:layout:render:view-stack", () => {
        this.renderViewStack(workbenchActive);
      });
      measureLayoutBoot("workbench:layout:render:split-relayout", () => {
        this.splitView.current?.relayout();
      });
      setWorkbenchSidebarPortal(null);

      measureLayoutBoot("workbench:layout:render:update-layout-service", () => {
        if (renderSingleWorkbenchPane) {
          this.scheduleLayoutServiceUpdate();
        } else {
          this.updateLayoutServiceNow();
        }
      });
      measureLayoutBoot("workbench:layout:render:on-did-render", () => {
        this.onDidRenderLayout();
      });
    });
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

  private renderWorkbenchMain(): void {
    const state = this.state.layoutState;
    const workbenchPane = state.panes.workbench;

    updatePaneElement(this.workbenchPane, {
      children: this.parts.workbench,
      isActive: workbenchPane.isActive,
      labelledBy: workbenchPane.labelledBy,
      paneId: workbenchPane.paneId,
    });
    replaceChildrenIfChanged(this.main, this.workbenchPane);
  }

  private renderSettingsMain(): void {
    const settingsPane = this.state.layoutState.panes.settings;

    if (!settingsPane.shouldMount) {
      replaceChildrenIfChanged(this.settingsMain);
      return;
    }

    updatePaneElement(this.settingsPane, {
      children: this.parts.settings,
      isActive: settingsPane.isActive,
      labelledBy: settingsPane.labelledBy,
      paneId: settingsPane.paneId,
    });
    replaceChildrenIfChanged(this.settingsMain, this.settingsPane);
  }

  private renderWorkbenchShell(workbenchActive: boolean, renderSingleWorkbenchPane: boolean): void {
    if (renderSingleWorkbenchPane) {
      this.renderSingleWorkbenchPane(workbenchActive);
      return;
    }

    this.renderSplit(workbenchActive);
  }

  private shouldRenderSingleWorkbenchPane(workbenchActive: boolean): boolean {
    return workbenchActive && !this.parts.sidebar && !this.parts.auxiliaryBar;
  }

  private renderSingleWorkbenchPane(workbenchActive: boolean): void {
    measureLayoutBoot("workbench:layout:render:single-main", () => {
      this.splitView.clear();
      this.shell.className = workbenchActive
        ? "workbench_layout_shell"
        : "workbench_layout_shell workbench_layout_shell--hidden";
      this.shell.setAttribute("aria-hidden", String(!workbenchActive));
      this.shell.inert = !workbenchActive;
      replaceChildrenIfChanged(this.shell, this.main);
    });
  }

  private renderSplit(workbenchActive: boolean): void {
    const panes = measureLayoutBoot("workbench:layout:render:split:panes", () => this.getSplitPanes());
    const splitClassName = measureLayoutBoot("workbench:layout:render:split:class-name", () => {
      const splitClassNames = ["workbench_layout_split"];
      if (this.hasAuxiliaryBarPane()) {
        splitClassNames.push("workbench_layout_split--with-auxiliarybar");
      }
      if (!workbenchActive) {
        splitClassNames.push("workbench_layout_split--inactive");
      }
      if (workbenchActive && this.layoutTransitionPart === Parts.SIDEBAR_PART) {
        splitClassNames.push("workbench_layout_split--animate-sidebar");
      } else if (workbenchActive && this.layoutTransitionPart === Parts.AUXILIARYBAR_PART) {
        splitClassNames.push("workbench_layout_split--animate-auxiliarybar");
      }
      return splitClassNames.join(" ");
    });

    measureLayoutBoot("workbench:layout:render:split:instance", () => {
      if (!this.splitView.current) {
        this.splitView.current = new SplitView({
          className: splitClassName,
          gap: 0,
          onDidResizeEnd: (event) => this.handleResizeEnd(event),
          orientation: "horizontal",
          panes,
        });
      } else {
        this.splitView.current.update({
          className: splitClassName,
          gap: 0,
          onDidResizeEnd: (event) => this.handleResizeEnd(event),
          orientation: "horizontal",
          panes,
        });
      }
    });

    const splitView = this.splitView.current;
    if (!splitView) {
      return;
    }

    const sidebarPane = splitView.getPaneElement(this.sidebarPart.paneId);
    if (sidebarPane) {
      measureLayoutBoot("workbench:layout:render:split:sidebar", () => {
        replaceChildrenIfChanged(sidebarPane, this.sidebar);
      });
    }
    const mainPane = splitView.getPaneElement("workbench-main");
    if (mainPane) {
      measureLayoutBoot("workbench:layout:render:split:main", () => {
        replaceChildrenIfChanged(mainPane, this.main);
      });
    }
    const auxiliaryBarPane = splitView.getPaneElement(this.auxiliaryBarPart.paneId);
    if (auxiliaryBarPane) {
      measureLayoutBoot("workbench:layout:render:split:auxiliarybar", () => {
        replaceChildrenIfChanged(auxiliaryBarPane, this.auxiliaryBar);
      });
    }
    measureLayoutBoot("workbench:layout:render:split:shell", () => {
      this.shell.className = workbenchActive
        ? "workbench_layout_shell"
        : "workbench_layout_shell workbench_layout_shell--hidden";
      this.shell.setAttribute("aria-hidden", String(!workbenchActive));
      this.shell.inert = !workbenchActive;
      replaceChildrenIfChanged(this.shell, splitView.element);
    });
  }

  private renderViewStack(workbenchActive: boolean): void {
    this.settingsMain.className = workbenchActive
      ? "workbench_layout_main workbench_layout_settings workbench_layout_settings--hidden"
      : "workbench_layout_main workbench_layout_settings";
    this.settingsMain.setAttribute("aria-hidden", String(workbenchActive));
    this.settingsMain.inert = workbenchActive;
    replaceChildrenIfChanged(this.viewStack, this.shell, this.settingsMain);
    replaceChildrenIfChanged(
      this.element,
      this.controller,
      this.viewStack,
      this.overlay,
    );
  }

  private getSplitPanes(): readonly SplitViewPane[] {
    const panes: SplitViewPane[] = [];

    panes.push(this.sidebarPart.createSplitPane(
      this.isPartVisible(Parts.SIDEBAR_PART),
    ));

    panes.push({
      id: "workbench-main",
      minSize: MAIN_MIN_WIDTH_PX,
    });

    if (this.hasAuxiliaryBarPane()) {
      panes.push(this.auxiliaryBarPart.createSplitPane(
        this.isPartVisible(Parts.AUXILIARYBAR_PART),
      ));
    }

    return panes;
  }

  private handleResizeEnd({ sizes }: SplitViewResizeEvent): void {
    if (sizes.length < 1) {
      return;
    }

    const sidebarIndex = 0;
    const sidebarVisible = this.isPartVisible(Parts.SIDEBAR_PART);
    const nextWidth = sizes[sidebarIndex];
    if (sidebarVisible && typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
      this.sidebarPart.resize(nextWidth);
    }

    if (this.hasAuxiliaryBarPane()) {
      const auxiliaryBarIndex = 2;
      const auxiliaryBarVisible = this.isPartVisible(Parts.AUXILIARYBAR_PART);
      const nextAuxiliaryBarWidth = sizes[auxiliaryBarIndex];
      if (
        auxiliaryBarVisible &&
        Number.isFinite(nextAuxiliaryBarWidth)
      ) {
        this.auxiliaryBarPart.resize(nextAuxiliaryBarWidth);
      }
    }
  }

  override dispose(): void {
    setWorkbenchSidebarPortal(null);
    this.clearLayoutTransition();
    super.dispose();
  }

  private renderWithLayoutTransition(
    part: Parts.SIDEBAR_PART | Parts.AUXILIARYBAR_PART,
  ): void {
    this.layoutTransitionPart = part;
    this.render();
    this.scheduleLayoutTransitionClear();
  }

  private scheduleLayoutTransitionClear(): void {
    if (this.layoutTransitionTimer !== null) {
      clearTimeout(this.layoutTransitionTimer);
    }

    this.layoutTransitionTimer = setTimeout(() => {
      this.layoutTransitionTimer = null;
      if (!this.layoutTransitionPart) {
        return;
      }

      this.layoutTransitionPart = null;
      this.render();
    }, LAYOUT_TRANSITION_DURATION_MS);
  }

  private clearLayoutTransition(): void {
    if (this.layoutTransitionTimer !== null) {
      clearTimeout(this.layoutTransitionTimer);
      this.layoutTransitionTimer = null;
    }
    this.layoutTransitionPart = null;
  }

  private updateLayoutService(): void {
    this.workbenchLayoutService?.setPartHidden(false, Parts.EDITOR_PART);
    this.workbenchLayoutService?.layout();
  }

  private updateLayoutServiceNow(): void {
    this.scheduledLayoutServiceUpdate.clear();
    this.updateLayoutService();
  }

  private scheduleLayoutServiceUpdate(): void {
    if (this.scheduledLayoutServiceUpdate.current) {
      return;
    }

    logLayoutBoot("workbench:layout:deferred-layout-service:scheduled");
    const targetWindow = this.element.ownerDocument.defaultView ?? window;
    this.scheduledLayoutServiceUpdate.current = scheduleAtNextAnimationFrame(targetWindow, () => {
      this.scheduledLayoutServiceUpdate.clear();
      measureLayoutBoot("workbench:layout:deferred-layout-service", () => {
        this.updateLayoutService();
      });
    });
  }

  private hasAuxiliaryBarPane(): boolean {
    return this.hasRenderedAuxiliaryBarPane || Boolean(this.parts.auxiliaryBar);
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

const createPaneElement = (paneId: string): HTMLElement => {
  const section = document.createElement("section");
  section.id = paneId;
  section.role = "region";

  return section;
};

const updatePaneElement = (
  section: HTMLElement,
  {
    children,
    isActive,
    labelledBy,
    paneId,
  }: {
    readonly children?: Node | null;
    readonly isActive: boolean;
    readonly labelledBy: string;
    readonly paneId: string;
  },
): void => {
  section.id = paneId;
  section.setAttribute("aria-labelledby", labelledBy);
  section.setAttribute("aria-hidden", String(!isActive));
  section.className = isActive
    ? "workbench_layout_pane"
    : "workbench_layout_pane workbench_layout_pane--hidden";
  if (!isActive) {
    section.inert = true;
  } else {
    section.inert = false;
  }
  replaceOptionalChildIfChanged(section, children);
};

const replaceOptionalChildIfChanged = (
  parent: HTMLElement,
  child: Node | null | undefined,
): void => {
  if (child) {
    replaceChildrenIfChanged(parent, child);
  } else {
    replaceChildrenIfChanged(parent);
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
