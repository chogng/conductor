import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import { toAction, type IAction } from "src/cs/base/common/actions";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";
import { ActionViewItem, type IActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import type { IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { TemplateMode } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
  type ViewContainer,
  ViewContainerLocation,
} from "src/cs/workbench/common/views";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
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

type AuxiliaryBarViewSwitchAction = IAction & {
  readonly icon: LxIcon;
};

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
  readonly templateMode: TemplateMode;
  readonly visible: boolean;
  readonly viewsService: Pick<
    IViewsService,
    "getViewContainerNavigationState" | "getViewContainers" | "isViewContainerActive" | "openViewContainer"
  >;
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

  public updateState(input: AuxiliaryBarInput): AuxiliaryBarState {
    return {
      actions: input.visible
        ? createAuxiliaryBarActions({
            viewsService: input.viewsService,
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

}

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

const createAuxiliaryBarActions = ({
  viewsService,
}: {
  readonly viewsService: Pick<
    IViewsService,
    "getViewContainerNavigationState" | "getViewContainers" | "isViewContainerActive" | "openViewContainer"
  >;
}): IAction[] => {
  const activeContainerId = viewsService.getViewContainerNavigationState(
    ViewContainerLocation.AuxiliaryBar,
  ).activeViewContainerId;
  return [...viewsService.getViewContainers(ViewContainerLocation.AuxiliaryBar)]
    .filter(viewContainer => viewsService.isViewContainerActive(viewContainer.id))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .flatMap((viewContainer): IAction[] => {
      if (isLxIcon(viewContainer.icon)) {
        const action = toAction({
          id: viewContainer.id,
          label: viewContainer.title,
          tooltip: viewContainer.title,
          class: AuxiliaryBarViewSwitchActionClass,
          enabled: true,
          checked: activeContainerId === viewContainer.id,
          icon: viewContainer.icon,
          run: () => viewsService.openViewContainer(viewContainer.id),
        });

        return [{ ...action, icon: viewContainer.icon } satisfies AuxiliaryBarViewSwitchAction];
      }

      return [];
    });
};

const isLxIcon = (icon: ViewContainer["icon"]): icon is LxIcon =>
  typeof icon === "object" &&
  icon !== null &&
  "id" in icon &&
  typeof icon.id === "string";

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
