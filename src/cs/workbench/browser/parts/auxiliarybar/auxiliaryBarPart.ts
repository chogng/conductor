import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";
import {
  AuxiliaryBarViews,
  createAuxiliaryBarActions,
  getAuxiliaryBarTitle,
  resolveAuxiliaryBarView,
  type AuxiliaryBarMode,
  type AuxiliaryBarView,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";

export const WorkbenchAuxiliaryBarClassName = "workbench_layout_auxiliarybar";
export const WorkbenchAuxiliaryBarPaneId = "workbench-auxiliarybar";

export const AUXILIARY_BAR_DEFAULT_WIDTH_PX = 300;
export const AUXILIARY_BAR_MIN_WIDTH_PX = 220;
export const AUXILIARY_BAR_MAX_WIDTH_PX = 520;

export const createAuxiliaryBarPart = (): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = WorkbenchAuxiliaryBarClassName;
  return element;
};

export const clampAuxiliaryBarWidth = (width: number): number =>
  Math.max(
    AUXILIARY_BAR_MIN_WIDTH_PX,
    Math.min(AUXILIARY_BAR_MAX_WIDTH_PX, Math.round(width)),
  );

export type AuxiliaryBarPaneContainerInput = {
  readonly container: IViewPaneContainer;
  readonly mode: AuxiliaryBarMode;
  readonly onDidChangeActiveView: () => void;
  readonly visible: boolean;
};

export type AuxiliaryBarViewState = {
  readonly viewId: string;
  readonly visible: boolean;
};

export type AuxiliaryBarPaneContainerState = {
  readonly activeView: AuxiliaryBarView;
  readonly views: readonly AuxiliaryBarViewState[];
};

export class WorkbenchAuxiliaryBarLayout {
  private _width = AUXILIARY_BAR_DEFAULT_WIDTH_PX;
  private readonly onDidChangeWidthEmitter = new Emitter<number>();

  public readonly onDidChangeWidth = this.onDidChangeWidthEmitter.event;

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

export const createAuxiliaryBarSplitPane = (
  size?: number,
): SplitViewPane => ({
  id: WorkbenchAuxiliaryBarPaneId,
  defaultSize: AUXILIARY_BAR_DEFAULT_WIDTH_PX,
  minSize: AUXILIARY_BAR_MIN_WIDTH_PX,
  maxSize: AUXILIARY_BAR_MAX_WIDTH_PX,
  ...(typeof size === "number" ? { size } : {}),
});

export class WorkbenchAuxiliaryBarPart extends Disposable {
  private readonly layout = this._register(new WorkbenchAuxiliaryBarLayout());
  private activeView: AuxiliaryBarView = "template";

  public readonly element = createAuxiliaryBarPart();
  public readonly onDidChangeWidth = this.layout.onDidChangeWidth;

  public get width(): number {
    return this.layout.width;
  }

  public resize(width: number): void {
    this.layout.resize(width);
  }

  public createSplitPane(): SplitViewPane {
    return createAuxiliaryBarSplitPane(this.width);
  }

  public createDefaultSplitPane(): SplitViewPane {
    return createAuxiliaryBarSplitPane();
  }

  public getActiveView(mode: AuxiliaryBarMode): AuxiliaryBarView {
    return this.resolveActiveView(mode);
  }

  public getActiveViewId(mode: AuxiliaryBarMode): string | null {
    const activeView = this.resolveActiveView(mode);
    return AuxiliaryBarViews.find(view => view.id === activeView)?.viewId ?? null;
  }

  public updatePaneContainer(
    input: AuxiliaryBarPaneContainerInput,
  ): AuxiliaryBarPaneContainerState {
    const activeView = this.resolveActiveView(input.mode);
    input.container.setTitle(
      input.visible ? getAuxiliaryBarTitle(input.mode) : "",
    );
    input.container.setActions(
      input.visible && input.mode === "chart"
        ? createAuxiliaryBarActions({
            activeView,
            mode: input.mode,
            onSelect: (view) => {
              if (this.setActiveView(view, input.mode)) {
                input.onDidChangeActiveView();
              }
            },
          })
        : [],
    );
    return {
      activeView,
      views: this.getViewStates(input.mode, input.visible),
    };
  }

  private resolveActiveView(mode: AuxiliaryBarMode): AuxiliaryBarView {
    this.activeView = resolveAuxiliaryBarView(this.activeView, mode);
    return this.activeView;
  }

  private setActiveView(view: AuxiliaryBarView, mode: AuxiliaryBarMode): boolean {
    const nextView = resolveAuxiliaryBarView(view, mode);
    if (this.activeView === nextView) {
      return false;
    }
    this.activeView = nextView;
    return true;
  }

  private getViewStates(
    mode: AuxiliaryBarMode,
    visible: boolean,
  ): readonly AuxiliaryBarViewState[] {
    const activeView = this.resolveActiveView(mode);
    return AuxiliaryBarViews.map(view => ({
      viewId: view.viewId,
      visible: visible && view.mode === mode && view.id === activeView,
    }));
  }
}
