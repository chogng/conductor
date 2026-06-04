import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { SplitViewPane } from "src/cs/base/browser/ui/splitview/splitview";
import type { IAction } from "src/cs/base/common/actions";
import type { IViewPaneContainer } from "src/cs/workbench/common/views";

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
  readonly actions: readonly IAction[];
  readonly container: IViewPaneContainer;
  readonly title: string;
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

  public updatePaneContainer(input: AuxiliaryBarPaneContainerInput): void {
    input.container.setTitle(input.title);
    input.container.setActions(input.actions);
  }
}
