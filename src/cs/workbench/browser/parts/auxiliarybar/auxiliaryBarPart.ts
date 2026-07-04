import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import { toAction, type IAction } from "src/cs/base/common/actions";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";
import { ActionViewItem, type IActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import type { IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  cleanGroupedActions,
  MenuId,
  type IMenuService,
} from "src/cs/platform/actions/common/actions";
import type { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import type { TemplateMode } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { TemplateViewContainerId } from "src/cs/workbench/contrib/template/common/template";
import {
  ExportCommandId,
  ExportViewContainerId,
} from "src/cs/workbench/services/export/common/export";
import {
  OriginCommandId,
  OriginExportSettingsViewContainerId,
} from "src/cs/workbench/services/origin/common/origin";
import {
  ParametersCommandId,
  ParametersViewContainerId,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  SearchCommandId,
  SearchViewContainerId,
} from "src/cs/workbench/services/search/common/search";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
  StorageScope,
  StorageTarget,
  type IStorageService,
} from "src/cs/platform/storage/common/storage";

const AuxiliaryBarClassName = "workbench_layout_auxiliarybar";
const AuxiliaryBarPaneId = "workbench-auxiliarybar";
const WorkbenchAuxiliaryBarWidthStorageKey = "workbench.auxiliarybar.width";
const AuxiliaryBarViewSwitchActionClass = "auxiliarybar_view_switch_action";

export const AUXILIARY_BAR_DEFAULT_WIDTH_PX = 280;
export const AUXILIARY_BAR_MIN_WIDTH_PX = 170;
export const AUXILIARY_BAR_MAX_WIDTH_PX = Number.POSITIVE_INFINITY;

export type AuxiliaryBarView = "template" | "search" | "export" | "parameters" | "settings";

type AuxiliaryBarViewDescriptor = {
  readonly containerId: string;
  readonly id: AuxiliaryBarView;
  readonly commandId?: string;
  readonly panelViewContainerId: string;
};

type AuxiliaryBarViewSwitchAction = IAction & {
  readonly icon: LxIconDefinition;
};

const AuxiliaryBarViews: readonly AuxiliaryBarViewDescriptor[] = [
  {
    containerId: TemplateViewContainerId,
    id: "template",
    panelViewContainerId: TableViewContainerId,
  },
  {
    containerId: SearchViewContainerId,
    id: "search",
    commandId: SearchCommandId.showSearch,
    panelViewContainerId: ChartViewContainerId,
  },
  {
    containerId: ExportViewContainerId,
    id: "export",
    commandId: ExportCommandId.showExport,
    panelViewContainerId: ChartViewContainerId,
  },
  {
    containerId: ParametersViewContainerId,
    id: "parameters",
    commandId: ParametersCommandId.showParameters,
    panelViewContainerId: ChartViewContainerId,
  },
  {
    containerId: OriginExportSettingsViewContainerId,
    id: "settings",
    commandId: OriginCommandId.showExportSettings,
    panelViewContainerId: ChartViewContainerId,
  },
];

export const createAuxiliaryBarPart = (): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = AuxiliaryBarClassName;
  return element;
};

export const createAuxiliaryBarActionViewItem: IActionViewItemProvider = (
  action,
  options,
): IActionViewItem | undefined =>
  isAuxiliaryBarViewSwitchAction(action)
    ? new AuxiliaryBarViewSwitchActionViewItem(action, options)
    : action.icon
      ? new ActionViewItem(undefined, action, {
          ...options,
          icon: true,
          label: false,
        })
    : undefined;

export const clampAuxiliaryBarWidth = (width: number): number =>
  Math.max(
    AUXILIARY_BAR_MIN_WIDTH_PX,
    Math.min(AUXILIARY_BAR_MAX_WIDTH_PX, Math.round(width)),
  );

type AuxiliaryBarPaneContainerInput = {
  readonly actions: readonly IAction[];
  readonly container: IViewPaneContainer;
  readonly title: string;
};

type AuxiliaryBarState = {
  readonly actions: readonly IAction[];
  readonly title: string;
};

type AuxiliaryBarInput = {
  readonly activePanelViewContainerId: string;
  readonly activeView: string;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
  readonly templateMode: TemplateMode;
  readonly visible: boolean;
};

export class AuxiliaryBarLayout {
  private _width: number;
  private readonly onDidChangeWidthEmitter = new Emitter<number>();

  public readonly onDidChangeWidth = this.onDidChangeWidthEmitter.event;

  constructor(width = AUXILIARY_BAR_DEFAULT_WIDTH_PX) {
    this._width = clampAuxiliaryBarWidth(width);
  }

  public get width(): number {
    return this._width;
  }

  public resize(width: number): void {
    const nextWidth = clampAuxiliaryBarWidth(width);
    if (nextWidth === this._width) {
      return;
    }
    this._width = nextWidth;
    this.onDidChangeWidthEmitter.fire(nextWidth);
  }

  public dispose(): void {
    this.onDidChangeWidthEmitter.dispose();
  }
}

const createAuxiliaryBarSplitPane = (
  size?: number,
  visible = true,
): SplitViewPane => ({
  id: AuxiliaryBarPaneId,
  defaultSize: AUXILIARY_BAR_DEFAULT_WIDTH_PX,
  minSize: AUXILIARY_BAR_MIN_WIDTH_PX,
  maxSize: AUXILIARY_BAR_MAX_WIDTH_PX,
  proportionalLayout: false,
  size: size ?? AUXILIARY_BAR_DEFAULT_WIDTH_PX,
  visible,
});

export class AuxiliaryBarPart extends Disposable {
  private activeView: AuxiliaryBarView = "template";
  private readonly layout: AuxiliaryBarLayout;

  public readonly paneId = AuxiliaryBarPaneId;
  public readonly element = createAuxiliaryBarPart();
  public readonly onDidChangeWidth;

  constructor(private readonly storageService?: IStorageService) {
    super();

    this.layout = this._register(new AuxiliaryBarLayout(
      this.storageService?.getNumber(
        WorkbenchAuxiliaryBarWidthStorageKey,
        StorageScope.PROFILE,
        AUXILIARY_BAR_DEFAULT_WIDTH_PX,
      ),
    ));
    this.onDidChangeWidth = this.layout.onDidChangeWidth;
    this._register(this.layout.onDidChangeWidth((width) => {
      this.storageService?.store(
        WorkbenchAuxiliaryBarWidthStorageKey,
        width,
        StorageScope.PROFILE,
        StorageTarget.USER,
      );
    }));
  }

  public get width(): number {
    return this.layout.width;
  }

  public resize(width: number): void {
    this.layout.resize(width);
  }

  public resetWidth(): void {
    this.storageService?.remove(
      WorkbenchAuxiliaryBarWidthStorageKey,
      StorageScope.PROFILE,
    );
    this.layout.resize(AUXILIARY_BAR_DEFAULT_WIDTH_PX);
  }

  public createSplitPane(visible?: boolean): SplitViewPane {
    return createAuxiliaryBarSplitPane(this.width, visible);
  }

  public getActiveView(activePanelViewContainerId: string): AuxiliaryBarView | null {
    return this.resolveActiveView(activePanelViewContainerId);
  }

  public getActiveContainerIdForPanel(
    activePanelViewContainerId: string,
    requestedView: string,
  ): string | null {
    if (isAuxiliaryBarView(requestedView)) {
      this.setActiveView(requestedView, activePanelViewContainerId);
    }

    const activeView = this.resolveActiveView(activePanelViewContainerId);
    return AuxiliaryBarViews.find(view => view.id === activeView)?.containerId ?? null;
  }

  public updateState(input: AuxiliaryBarInput): AuxiliaryBarState {
    if (isAuxiliaryBarView(input.activeView)) {
      this.setActiveView(input.activeView, input.activePanelViewContainerId);
    }
    const activeView = this.resolveActiveView(input.activePanelViewContainerId);
    return {
      actions: input.visible && activeView
        ? createAuxiliaryBarActions({
            activeView,
            contextKeyService: input.contextKeyService,
            menuService: input.menuService,
            activePanelViewContainerId: input.activePanelViewContainerId,
          })
        : [],
      title: input.visible
        ? getAuxiliaryBarTitleForPanelViewContainer(input.activePanelViewContainerId, input.templateMode)
        : "",
    };
  }

  public updatePaneContainer(input: AuxiliaryBarPaneContainerInput): void {
    input.container.setTitle(input.title);
    input.container.setActions(input.actions);
  }

  private resolveActiveView(activePanelViewContainerId: string): AuxiliaryBarView | null {
    const activeView = resolveAuxiliaryBarView(this.activeView, activePanelViewContainerId);
    if (activeView) {
      this.activeView = activeView;
    }
    return activeView;
  }

  private setActiveView(view: AuxiliaryBarView, activePanelViewContainerId: string): boolean {
    const nextView = resolveAuxiliaryBarView(view, activePanelViewContainerId);
    if (!nextView) {
      return false;
    }
    if (this.activeView === nextView) {
      return false;
    }
    this.activeView = nextView;
    return true;
  }

}

const isAuxiliaryBarView = (view: string): view is AuxiliaryBarView =>
  AuxiliaryBarViews.some(candidate => candidate.id === view);

const getAuxiliaryBarViews = (
  activePanelViewContainerId: string,
): readonly AuxiliaryBarViewDescriptor[] =>
  AuxiliaryBarViews.filter((view) => view.panelViewContainerId === activePanelViewContainerId);

const getDefaultAuxiliaryBarView = (
  activePanelViewContainerId: string,
): AuxiliaryBarView | null => {
  if (activePanelViewContainerId === ChartViewContainerId) {
    return "export";
  }
  if (activePanelViewContainerId === TableViewContainerId) {
    return "template";
  }
  return null;
};

const getAuxiliaryBarTitleForPanelViewContainer = (
  activePanelViewContainerId: string,
  templateMode: TemplateMode,
): string => {
  if (activePanelViewContainerId === ChartViewContainerId) {
    return localize("auxiliarybar.chart.title", "Chart");
  }

  return templateMode === "editor"
    ? localize("template.editor.title", "Template Editor")
    : localize("template.management.title", "Template Management");
};

const resolveAuxiliaryBarView = (
  view: AuxiliaryBarView,
  activePanelViewContainerId: string,
): AuxiliaryBarView | null =>
  getAuxiliaryBarViews(activePanelViewContainerId).some((candidate) => candidate.id === view)
    ? view
    : getDefaultAuxiliaryBarView(activePanelViewContainerId);

const createAuxiliaryBarActions = ({
  activePanelViewContainerId,
  activeView,
  contextKeyService,
  menuService,
}: {
  readonly activePanelViewContainerId: string;
  readonly activeView: AuxiliaryBarView;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
}): IAction[] => {
  const viewsByCommandId = new Map(
    getAuxiliaryBarViews(activePanelViewContainerId)
      .filter((view): view is AuxiliaryBarViewDescriptor & {
        readonly commandId: string;
      } => !!view.commandId)
      .map((view) => [view.commandId, view]),
  );
  return cleanGroupedActions(
    menuService.getMenuActions(MenuId.AuxiliaryBarTitle, contextKeyService),
  ).flatMap((menuAction): IAction[] => {
    const view = viewsByCommandId.get(menuAction.id);
    if (view && menuAction.icon) {
      const action = toAction({
        id: menuAction.id,
        label: menuAction.label,
        tooltip: menuAction.tooltip || menuAction.label,
        class: AuxiliaryBarViewSwitchActionClass,
        enabled: menuAction.enabled,
        checked: activeView === view.id,
        icon: menuAction.icon,
        run: (...args) => menuAction.run(...args),
      });

      return [{ ...action, icon: menuAction.icon } satisfies AuxiliaryBarViewSwitchAction];
    }

    return [];
  });
};

const isAuxiliaryBarViewSwitchAction = (
  action: IAction,
): action is AuxiliaryBarViewSwitchAction =>
  action.class?.split(/\s+/g).includes(AuxiliaryBarViewSwitchActionClass) === true &&
  "icon" in action;

class AuxiliaryBarViewSwitchActionViewItem extends ActionViewItem {
  constructor(
    action: AuxiliaryBarViewSwitchAction,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, {
      ...options,
      label: false,
    });
  }

  protected override updateLabel(): void {
    super.updateLabel();
    if (!this.label || !isAuxiliaryBarViewSwitchAction(this.action)) {
      return;
    }

    const icon = createLxIcon({
      className: "auxiliarybar_view_switch_action_icon",
      icon: this.action.icon,
      size: 16,
    });
    this.label.replaceChildren(icon);
  }
}
