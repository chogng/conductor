import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  IView,
  IViewDescriptor,
  IViewPaneContainer,
  ViewContainer,
  ViewContainerLocation,
} from "src/cs/workbench/common/views";

export const IViewsService = createDecorator<IViewsService>("viewsService");

export interface IViewContainerNavigationState {
  readonly activeViewContainerId: string | null;
  readonly historyIndex: number;
  readonly historyLength: number;
  readonly location: ViewContainerLocation;
}

export interface IViewsService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeViewContainerNavigation: Event<IViewContainerNavigationState>;
  readonly onDidChangeViewContainerVisibility: Event<{
    readonly id: string;
    readonly visible: boolean;
    readonly location: ViewContainerLocation;
  }>;
  readonly onDidChangeViewVisibility: Event<{
    readonly id: string;
    readonly visible: boolean;
  }>;
  readonly onDidChangeFocusedView: Event<void>;

  getViewContainerNavigationState(location: ViewContainerLocation): IViewContainerNavigationState;
  getViewContainers(location: ViewContainerLocation): readonly ViewContainer[];
  getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | null;
  isViewContainerVisible(id: string): boolean;
  isViewContainerActive(id: string): boolean;
  openViewContainer(id: string, focus?: boolean): Promise<ViewContainer | null>;
  navigateViewContainerBack(location: ViewContainerLocation): ViewContainer | null;
  navigateViewContainerForward(location: ViewContainerLocation): ViewContainer | null;
  resetViewContainerNavigation(location: ViewContainerLocation, id: string): ViewContainer | null;
  closeViewContainer(id: string): void;
  getVisibleViewContainer(location: ViewContainerLocation): ViewContainer | null;
  getViewContainerElement(id: string): unknown | null;
  getActiveViewPaneContainerWithId(viewContainerId: string): IViewPaneContainer | null;
  getFocusedView(): IViewDescriptor | null;
  getFocusedViewName(): string;

  addViewToContainer(containerId: string, view: IView): IView | null;
  setViewVisible(id: string, visible: boolean): boolean;
  isViewVisible(id: string): boolean;
  openView<T extends IView>(id: string, focus?: boolean): Promise<T | null>;
  closeView(id: string): void;
  getActiveViewWithId<T extends IView>(id: string): T | null;
  getViewWithId<T extends IView>(id: string): T | null;
  getViewProgressIndicator(id: string): unknown | undefined;
}
