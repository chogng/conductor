import type { IAction } from "src/cs/base/common/actions";
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
  readonly onDidChangeActiveView: () => void;
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
    const activeView = this.resolveActiveView(input.mode);
    return {
      actions: input.visible && input.mode === "chart"
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
