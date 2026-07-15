import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import type { IAction } from "src/cs/base/common/actions";
import { ActionViewItem, type IActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import type { IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";
import {
  StorageScope,
  StorageTarget,
  type IStorageService,
} from "src/cs/platform/storage/common/storage";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";

const SidebarClassName = "workbench_layout_sidebar";
const SidebarPaneId = "workbench-sidebar";
const WorkbenchSidebarWidthStorageKey = "workbench.sidebar.width";

export const SIDEBAR_DEFAULT_WIDTH_PX = 250;
export const SIDEBAR_MIN_WIDTH_PX = 170;
export const SIDEBAR_MAX_WIDTH_PX = Number.POSITIVE_INFINITY;

export type WorkbenchSidebarAction = IAction & {
  readonly icon?: LxIconDefinition;
};

type SidebarPaneContainerInput = {
  readonly actions: readonly IAction[];
  readonly container: IViewPaneContainer;
  readonly title: string;
};

export const createSidebarPart = (): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = SidebarClassName;
  return element;
};

export const createSidebarActionViewItem: IActionViewItemProvider = (
  action,
  options,
): IActionViewItem | undefined =>
  isWorkbenchSidebarAction(action)
    ? new SidebarActionViewItem(action, options)
    : undefined;

export const clampSidebarWidth = (width: number): number =>
  Math.max(
    SIDEBAR_MIN_WIDTH_PX,
    Math.min(SIDEBAR_MAX_WIDTH_PX, Math.round(width)),
  );

export class SidebarLayout {
  private _width: number;
  private readonly onDidChangeWidthEmitter = new Emitter<number>();

  public readonly onDidChangeWidth = this.onDidChangeWidthEmitter.event;

  constructor(width = SIDEBAR_DEFAULT_WIDTH_PX) {
    this._width = clampSidebarWidth(width);
  }

  public get width(): number {
    return this._width;
  }

  public resize(width: number): void {
    const nextWidth = clampSidebarWidth(width);
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

const createSidebarSplitPane = (
  size?: number,
  visible = true,
): SplitViewPane => ({
  id: SidebarPaneId,
  defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
  minSize: SIDEBAR_MIN_WIDTH_PX,
  maxSize: SIDEBAR_MAX_WIDTH_PX,
  proportionalLayout: false,
  size: size ?? SIDEBAR_DEFAULT_WIDTH_PX,
  visible,
});

export class SidebarPart extends Disposable {
  private readonly layout: SidebarLayout;

  public readonly paneId = SidebarPaneId;
  public readonly element = createSidebarPart();
  public readonly onDidChangeWidth;

  constructor(private readonly storageService?: IStorageService) {
    super();

    this.layout = this._register(new SidebarLayout(
      this.storageService?.getNumber(
        WorkbenchSidebarWidthStorageKey,
        StorageScope.PROFILE,
        SIDEBAR_DEFAULT_WIDTH_PX,
      ),
    ));
    this.onDidChangeWidth = this.layout.onDidChangeWidth;
    this._register(this.layout.onDidChangeWidth((width) => {
      this.storageService?.store(
        WorkbenchSidebarWidthStorageKey,
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
      WorkbenchSidebarWidthStorageKey,
      StorageScope.PROFILE,
    );
    this.layout.resize(SIDEBAR_DEFAULT_WIDTH_PX);
  }

  public createSplitPane(visible?: boolean): SplitViewPane {
    return createSidebarSplitPane(this.width, visible);
  }

  public updatePaneContainer(input: SidebarPaneContainerInput): void {
    input.container.setTitle(input.title);
    input.container.setActions(input.actions);
  }
}

const isWorkbenchSidebarAction = (
  action: IAction,
): action is WorkbenchSidebarAction =>
  "icon" in action;

class SidebarActionViewItem extends ActionViewItem {
  constructor(
    action: WorkbenchSidebarAction,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, {
      ...options,
      label: false,
    });
  }

  protected override updateLabel(): void {
    super.updateLabel();
    if (!this.label || !isWorkbenchSidebarAction(this.action)) {
      return;
    }

    const icon = this.action.icon;
    this.label.replaceChildren(
      icon
        ? createLxIcon({
            className: "sidebar_header_action_icon",
            icon,
            size: 16,
          })
        : document.createTextNode(this.action.label),
    );
  }
}
