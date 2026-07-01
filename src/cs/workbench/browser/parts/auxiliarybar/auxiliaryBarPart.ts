import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import { toAction, type IAction } from "src/cs/base/common/actions";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";
import { ActionViewItem, type IActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import type { IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  cleanGroupedActions,
  MenuId,
  type IMenuService,
} from "src/cs/platform/actions/common/actions";
import type { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import {
  TemplateViewId,
} from "src/cs/workbench/contrib/template/common/template";
import type { TemplateMode } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import {
  ExportCommandId,
  ExportViewId,
} from "src/cs/workbench/services/export/common/export";
import {
  OriginCommandId,
  OriginExportSettingsViewId,
} from "src/cs/workbench/services/origin/common/origin";
import {
  ParametersCommandId,
  ParametersViewId,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  SearchCommandId,
  SearchViewId,
} from "src/cs/workbench/services/search/common/search";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  StorageScope,
  StorageTarget,
  type IStorageService,
} from "src/cs/platform/storage/common/storage";

const AuxiliaryBarClassName = "workbench_layout_auxiliarybar";
const AuxiliaryBarPaneId = "workbench-auxiliarybar";
const WorkbenchAuxiliaryBarWidthStorageKey = "workbench.auxiliarybar.width";
const CloseAuxiliaryBarCommandId = "workbench.action.closeAuxiliaryBar";
const AuxiliaryBarViewSwitchActionClass = "auxiliarybar_view_switch_action";

export const AUXILIARY_BAR_DEFAULT_WIDTH_PX = 280;
export const AUXILIARY_BAR_MIN_WIDTH_PX = 170;
export const AUXILIARY_BAR_MAX_WIDTH_PX = Number.POSITIVE_INFINITY;

export type AuxiliaryBarView = "template" | "search" | "export" | "parameters" | "settings";

type AuxiliaryBarViewDescriptor = {
  readonly id: AuxiliaryBarView;
  readonly commandId?: string;
  readonly workbenchMainPart: WorkbenchMainPart;
  readonly viewId: string;
};

type AuxiliaryBarViewSwitchAction = IAction & {
  readonly icon: LxIconDefinition;
};

const AuxiliaryBarViews: readonly AuxiliaryBarViewDescriptor[] = [
  {
    id: "template",
    workbenchMainPart: "table",
    viewId: TemplateViewId,
  },
  {
    id: "search",
    commandId: SearchCommandId.showSearch,
    workbenchMainPart: "chart",
    viewId: SearchViewId,
  },
  {
    id: "export",
    commandId: ExportCommandId.showExport,
    workbenchMainPart: "chart",
    viewId: ExportViewId,
  },
  {
    id: "parameters",
    commandId: ParametersCommandId.showParameters,
    workbenchMainPart: "chart",
    viewId: ParametersViewId,
  },
  {
    id: "settings",
    commandId: OriginCommandId.showExportSettings,
    workbenchMainPart: "chart",
    viewId: OriginExportSettingsViewId,
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

type AuxiliaryBarViewState = {
  readonly viewId: string;
  readonly visible: boolean;
};

type AuxiliaryBarState = {
  readonly actions: readonly IAction[];
  readonly title: string;
  readonly views: readonly AuxiliaryBarViewState[];
};

type AuxiliaryBarInput = {
  readonly workbenchMainPart: WorkbenchMainPart;
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

  public getActiveView(workbenchMainPart: WorkbenchMainPart): AuxiliaryBarView | null {
    return this.resolveActiveView(workbenchMainPart);
  }

  public getActiveViewId(workbenchMainPart: WorkbenchMainPart): string | null {
    const activeView = this.resolveActiveView(workbenchMainPart);
    return AuxiliaryBarViews.find(view => view.id === activeView)?.viewId ?? null;
  }

  public getViewIds(): readonly string[] {
    return AuxiliaryBarViews.map(view => view.viewId);
  }

  public updateState(input: AuxiliaryBarInput): AuxiliaryBarState {
    if (isAuxiliaryBarView(input.activeView)) {
      this.setActiveView(input.activeView, input.workbenchMainPart);
    }
    const activeView = this.resolveActiveView(input.workbenchMainPart);
    return {
      actions: input.visible && activeView
        ? createAuxiliaryBarActions({
            activeView,
            contextKeyService: input.contextKeyService,
            menuService: input.menuService,
            workbenchMainPart: input.workbenchMainPart,
          })
        : [],
      title: input.visible
        ? getAuxiliaryBarTitleForWorkbenchMainPart(input.workbenchMainPart, input.templateMode)
        : "",
      views: this.getViewStates(input.workbenchMainPart, input.visible),
    };
  }

  public updatePaneContainer(input: AuxiliaryBarPaneContainerInput): void {
    input.container.setTitle(input.title);
    input.container.setActions(input.actions);
  }

  private resolveActiveView(workbenchMainPart: WorkbenchMainPart): AuxiliaryBarView | null {
    const activeView = resolveAuxiliaryBarView(this.activeView, workbenchMainPart);
    if (activeView) {
      this.activeView = activeView;
    }
    return activeView;
  }

  private setActiveView(view: AuxiliaryBarView, workbenchMainPart: WorkbenchMainPart): boolean {
    const nextView = resolveAuxiliaryBarView(view, workbenchMainPart);
    if (!nextView) {
      return false;
    }
    if (this.activeView === nextView) {
      return false;
    }
    this.activeView = nextView;
    return true;
  }

  private getViewStates(
    workbenchMainPart: WorkbenchMainPart,
    visible: boolean,
  ): readonly AuxiliaryBarViewState[] {
    const activeView = this.resolveActiveView(workbenchMainPart);
    return AuxiliaryBarViews.map(view => ({
      viewId: view.viewId,
      visible: visible && view.workbenchMainPart === workbenchMainPart && view.id === activeView,
    }));
  }
}

const isAuxiliaryBarView = (view: string): view is AuxiliaryBarView =>
  AuxiliaryBarViews.some(candidate => candidate.id === view);

const getAuxiliaryBarViews = (
  workbenchMainPart: WorkbenchMainPart,
): readonly AuxiliaryBarViewDescriptor[] =>
  AuxiliaryBarViews.filter((view) => view.workbenchMainPart === workbenchMainPart);

const getDefaultAuxiliaryBarView = (
  workbenchMainPart: WorkbenchMainPart,
): AuxiliaryBarView | null => {
  if (workbenchMainPart === "chart") {
    return "export";
  }
  if (workbenchMainPart === "table") {
    return "template";
  }
  return null;
};

const getAuxiliaryBarTitleForWorkbenchMainPart = (
  workbenchMainPart: WorkbenchMainPart,
  templateMode: TemplateMode,
): string => {
  if (workbenchMainPart === "chart") {
    return localize("auxiliarybar.chart.title", "Chart");
  }

  return templateMode === "editor"
    ? localize("template.editor.title", "Template Editor")
    : localize("template.management.title", "Template Management");
};

const resolveAuxiliaryBarView = (
  view: AuxiliaryBarView,
  workbenchMainPart: WorkbenchMainPart,
): AuxiliaryBarView | null =>
  getAuxiliaryBarViews(workbenchMainPart).some((candidate) => candidate.id === view)
    ? view
    : getDefaultAuxiliaryBarView(workbenchMainPart);

const createAuxiliaryBarActions = ({
  activeView,
  contextKeyService,
  menuService,
  workbenchMainPart,
}: {
  readonly activeView: AuxiliaryBarView;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
  readonly workbenchMainPart: WorkbenchMainPart;
}): IAction[] => {
  const viewsByCommandId = new Map(
    getAuxiliaryBarViews(workbenchMainPart)
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

    if (menuAction.id !== CloseAuxiliaryBarCommandId) {
      return [];
    }

    return [toAction({
      id: menuAction.id,
      label: menuAction.label,
      tooltip: menuAction.tooltip || menuAction.label,
      enabled: menuAction.enabled,
      icon: LxIcon.close,
      run: (...args) => menuAction.run(...args),
    })];
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
