import type { IAction } from "src/cs/base/common/actions";
import type { IMenuService } from "src/cs/platform/actions/common/actions";
import type { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import {
  AuxiliaryBarViews,
  createAuxiliaryBarActions,
  getAuxiliaryBarTitleForMode,
  resolveAuxiliaryBarView,
  type AuxiliaryBarMode,
  type TemplateAuxiliaryBarMode,
  type AuxiliaryBarView,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";

export type AuxiliaryBarViewState = {
  readonly viewId: string;
  readonly visible: boolean;
};

export type AuxiliaryBarState = {
  readonly actions: readonly IAction[];
  readonly title: string;
  readonly views: readonly AuxiliaryBarViewState[];
};

export type AuxiliaryBarInput = {
  readonly mode: AuxiliaryBarMode;
  readonly activeView: string;
  readonly contextKeyService: IContextKeyService;
  readonly menuService: IMenuService;
  readonly templateMode: TemplateAuxiliaryBarMode;
  readonly visible: boolean;
};

export class AuxiliaryBarModel {
  private activeView: AuxiliaryBarView = "template";

  public getActiveView(mode: AuxiliaryBarMode): AuxiliaryBarView {
    return this.resolveActiveView(mode);
  }

  public getActiveViewId(mode: AuxiliaryBarMode): string | null {
    const activeView = this.resolveActiveView(mode);
    return AuxiliaryBarViews.find(view => view.id === activeView)?.viewId ?? null;
  }

  public update(input: AuxiliaryBarInput): AuxiliaryBarState {
    if (isAuxiliaryBarView(input.activeView)) {
      this.setActiveView(input.activeView, input.mode);
    }
    const activeView = this.resolveActiveView(input.mode);
    return {
      actions: input.visible && input.mode === "chart"
        ? createAuxiliaryBarActions({
            activeView,
            contextKeyService: input.contextKeyService,
            menuService: input.menuService,
            mode: input.mode,
          })
        : [],
      title: input.visible ? getAuxiliaryBarTitleForMode(input.mode, input.templateMode) : "",
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

const isAuxiliaryBarView = (view: string): view is AuxiliaryBarView =>
  AuxiliaryBarViews.some(candidate => candidate.id === view);
