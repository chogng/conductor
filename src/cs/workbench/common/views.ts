import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable, toDisposable } from "src/cs/base/common/lifecycle";
import type { IAction } from "src/cs/base/common/actions";
import type { URI } from "src/cs/base/common/uri";
import type { ContextKeyExpression } from "src/cs/platform/contextkey/common/contextkey";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";

export const VIEWS_LOG_ID = "views";
export const VIEWS_LOG_NAME = "Views";

export namespace Extensions {
  export const ViewContainersRegistry = "workbench.registry.view.containers";
  export const ViewsRegistry = "workbench.registry.view";
}

export const enum ViewContainerLocation {
  Sidebar,
  Panel,
  AuxiliaryBar,
}

export function ViewContainerLocationToString(viewContainerLocation: ViewContainerLocation): string {
  switch (viewContainerLocation) {
    case ViewContainerLocation.Sidebar:
      return "sidebar";
    case ViewContainerLocation.Panel:
      return "panel";
    case ViewContainerLocation.AuxiliaryBar:
      return "auxiliarybar";
  }
}

export const enum WindowEnablement {
  Editor = 1,
  Sessions = 2,
  Both = 3,
}

export type OpenCommandActionDescriptor = {
  readonly id: string;
  readonly title?: string;
  readonly mnemonicTitle?: string;
  readonly order?: number;
};

export interface IViewContainerDescriptor {
  readonly id: string;
  readonly title: string;
  readonly icon?: URI | string;
  readonly order?: number;
  readonly ctorDescriptor: SyncDescriptor<IViewPaneContainer>;
  readonly openCommandActionDescriptor?: OpenCommandActionDescriptor;
  readonly storageId?: string;
  readonly hideIfEmpty?: boolean;
  readonly alwaysUseContainerInfo?: boolean;
  readonly rejectAddedViews?: boolean;
  readonly windowEnablement?: WindowEnablement;
  requestedIndex?: number;
}

export interface IViewContainersRegistry {
  readonly onDidRegister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>;
  readonly onDidDeregister: Event<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>;
  readonly all: readonly ViewContainer[];

  registerViewContainer(
    viewContainerDescriptor: IViewContainerDescriptor,
    location: ViewContainerLocation,
    options?: { readonly isDefault?: boolean; readonly doNotRegisterOpenCommand?: boolean },
  ): ViewContainer;
  deregisterViewContainer(viewContainer: ViewContainer): void;
  get(id: string): ViewContainer | undefined;
  getViewContainers(location: ViewContainerLocation): readonly ViewContainer[];
  getViewContainerLocation(container: ViewContainer): ViewContainerLocation | undefined;
  getDefaultViewContainers(location: ViewContainerLocation): readonly ViewContainer[];
}

export interface ViewContainer extends IViewContainerDescriptor {}

type RegisteredViewContainer = ViewContainer & {
  openCommandActionDescriptor?: OpenCommandActionDescriptor;
};

class ViewContainersRegistry extends Disposable implements IViewContainersRegistry {
  private readonly onDidRegisterEmitter = this._register(
    new Emitter<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>(),
  );
  public readonly onDidRegister = this.onDidRegisterEmitter.event;

  private readonly onDidDeregisterEmitter = this._register(
    new Emitter<{ viewContainer: ViewContainer; viewContainerLocation: ViewContainerLocation }>(),
  );
  public readonly onDidDeregister = this.onDidDeregisterEmitter.event;

  private readonly viewContainers = new Map<ViewContainerLocation, ViewContainer[]>();
  private readonly defaultViewContainers = new Set<ViewContainer>();

  public get all(): readonly ViewContainer[] {
    return Array.from(this.viewContainers.values()).flat();
  }

  public registerViewContainer(
    viewContainerDescriptor: IViewContainerDescriptor,
    viewContainerLocation: ViewContainerLocation,
    options?: { readonly isDefault?: boolean; readonly doNotRegisterOpenCommand?: boolean },
  ): ViewContainer {
    const existing = this.get(viewContainerDescriptor.id);
    if (existing) {
      return existing;
    }

    const viewContainer: RegisteredViewContainer = {
      ...viewContainerDescriptor,
      openCommandActionDescriptor: options?.doNotRegisterOpenCommand
        ? undefined
        : viewContainerDescriptor.openCommandActionDescriptor ?? { id: viewContainerDescriptor.id },
    };

    const containers = this.viewContainers.get(viewContainerLocation) ?? [];
    containers.push(viewContainer);
    this.viewContainers.set(viewContainerLocation, containers);

    if (options?.isDefault) {
      this.defaultViewContainers.add(viewContainer);
    }

    this.onDidRegisterEmitter.fire({ viewContainer, viewContainerLocation });
    return viewContainer;
  }

  public deregisterViewContainer(viewContainer: ViewContainer): void {
    for (const [location, containers] of this.viewContainers) {
      const index = containers.indexOf(viewContainer);
      if (index === -1) {
        continue;
      }

      containers.splice(index, 1);
      if (!containers.length) {
        this.viewContainers.delete(location);
      }
      this.defaultViewContainers.delete(viewContainer);
      this.onDidDeregisterEmitter.fire({ viewContainer, viewContainerLocation: location });
      return;
    }
  }

  public get(id: string): ViewContainer | undefined {
    return this.all.find(viewContainer => viewContainer.id === id);
  }

  public getViewContainers(location: ViewContainerLocation): readonly ViewContainer[] {
    return this.viewContainers.get(location) ?? [];
  }

  public getViewContainerLocation(container: ViewContainer): ViewContainerLocation | undefined {
    for (const [location, containers] of this.viewContainers) {
      if (containers.includes(container)) {
        return location;
      }
    }

    return undefined;
  }

  public getDefaultViewContainers(location: ViewContainerLocation): readonly ViewContainer[] {
    return this.getViewContainers(location).filter(viewContainer => this.defaultViewContainers.has(viewContainer));
  }
}

Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistry());

export interface IViewDescriptor {
  readonly type?: string;
  readonly id: string;
  readonly name: string;
  readonly ctorDescriptor: SyncDescriptor<IView>;
  readonly when?: ContextKeyExpression;
  readonly order?: number;
  readonly weight?: number;
  readonly collapsed?: boolean;
  readonly canToggleVisibility?: boolean;
  readonly canMoveView?: boolean;
  readonly containerIcon?: URI | string;
  readonly containerTitle?: string;
  readonly singleViewPaneContainerTitle?: string;
  readonly hideByDefault?: boolean;
  readonly workspace?: boolean;
  readonly group?: string;
  readonly remoteAuthority?: string | readonly string[];
  readonly virtualWorkspace?: string;
  readonly openCommandActionDescriptor?: OpenCommandActionDescriptor;
  readonly windowEnablement?: WindowEnablement;
}

export interface IViewDescriptorRef {
  readonly viewDescriptor: IViewDescriptor;
  readonly index: number;
}

export interface IAddedViewDescriptorRef extends IViewDescriptorRef {
  readonly collapsed: boolean;
  readonly size?: number;
}

export interface IAddedViewDescriptorState {
  readonly viewDescriptor: IViewDescriptor;
  readonly collapsed?: boolean;
  readonly visible?: boolean;
}

export enum ViewContentGroups {
  Open = "2_open",
  Debug = "4_debug",
  SCM = "5_scm",
  More = "9_more",
}

export interface IViewContentDescriptor {
  readonly content: string;
  readonly when?: ContextKeyExpression;
  readonly group?: ViewContentGroups;
  readonly order?: number;
}

export interface IViewsRegistry {
  readonly onViewsRegistered: Event<readonly { readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }[]>;
  readonly onViewsDeregistered: Event<{ readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }>;
  readonly onDidChangeContainer: Event<{
    readonly views: readonly IViewDescriptor[];
    readonly from: ViewContainer;
    readonly to: ViewContainer;
  }>;
  readonly onDidChangeViewWelcomeContent: Event<string>;

  registerViews(views: readonly IViewDescriptor[], viewContainer: ViewContainer): void;
  registerViews2(views: readonly { readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }[]): void;
  deregisterViews(views: readonly IViewDescriptor[], viewContainer: ViewContainer): void;
  moveViews(views: readonly IViewDescriptor[], viewContainer: ViewContainer): void;
  getViews(viewContainer: ViewContainer): readonly IViewDescriptor[];
  getView(id: string): IViewDescriptor | null;
  getViewContainer(id: string): ViewContainer | null;
  registerViewWelcomeContent(id: string, viewContent: IViewContentDescriptor): IDisposable;
  registerViewWelcomeContent2<TKey>(id: string, viewContentMap: ReadonlyMap<TKey, IViewContentDescriptor>): Map<TKey, IDisposable>;
  getViewWelcomeContent(id: string): readonly IViewContentDescriptor[];
}

class ViewsRegistry extends Disposable implements IViewsRegistry {
  private readonly onViewsRegisteredEmitter = this._register(
    new Emitter<readonly { readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }[]>(),
  );
  public readonly onViewsRegistered = this.onViewsRegisteredEmitter.event;

  private readonly onViewsDeregisteredEmitter = this._register(
    new Emitter<{ readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }>(),
  );
  public readonly onViewsDeregistered = this.onViewsDeregisteredEmitter.event;

  private readonly onDidChangeContainerEmitter = this._register(new Emitter<{
    readonly views: readonly IViewDescriptor[];
    readonly from: ViewContainer;
    readonly to: ViewContainer;
  }>());
  public readonly onDidChangeContainer = this.onDidChangeContainerEmitter.event;

  private readonly onDidChangeViewWelcomeContentEmitter = this._register(new Emitter<string>());
  public readonly onDidChangeViewWelcomeContent = this.onDidChangeViewWelcomeContentEmitter.event;

  private readonly viewContainers: ViewContainer[] = [];
  private readonly views = new Map<ViewContainer, IViewDescriptor[]>();
  private readonly viewWelcomeContents = new Map<string, IViewContentDescriptor[]>();

  public registerViews(views: readonly IViewDescriptor[], viewContainer: ViewContainer): void {
    this.registerViews2([{ views, viewContainer }]);
  }

  public registerViews2(views: readonly { readonly views: readonly IViewDescriptor[]; readonly viewContainer: ViewContainer }[]): void {
    for (const { views: descriptors, viewContainer } of views) {
      this.addViews(descriptors, viewContainer);
    }

    this.onViewsRegisteredEmitter.fire(views);
  }

  public deregisterViews(viewDescriptors: readonly IViewDescriptor[], viewContainer: ViewContainer): void {
    const views = this.removeViews(viewDescriptors, viewContainer);
    if (views.length) {
      this.onViewsDeregisteredEmitter.fire({ views, viewContainer });
    }
  }

  public moveViews(viewsToMove: readonly IViewDescriptor[], viewContainer: ViewContainer): void {
    for (const container of this.views.keys()) {
      if (container === viewContainer) {
        continue;
      }

      const views = this.removeViews(viewsToMove, container);
      if (!views.length) {
        continue;
      }

      this.addViews(views, viewContainer);
      this.onDidChangeContainerEmitter.fire({ views, from: container, to: viewContainer });
    }
  }

  public getViews(viewContainer: ViewContainer): readonly IViewDescriptor[] {
    return this.views.get(viewContainer) ?? [];
  }

  public getView(id: string): IViewDescriptor | null {
    for (const viewContainer of this.viewContainers) {
      const viewDescriptor = this.getViews(viewContainer).find(view => view.id === id);
      if (viewDescriptor) {
        return viewDescriptor;
      }
    }

    return null;
  }

  public getViewContainer(id: string): ViewContainer | null {
    for (const viewContainer of this.viewContainers) {
      if (this.getViews(viewContainer).some(view => view.id === id)) {
        return viewContainer;
      }
    }

    return null;
  }

  public registerViewWelcomeContent(id: string, viewContent: IViewContentDescriptor): IDisposable {
    const contents = this.viewWelcomeContents.get(id) ?? [];
    contents.push(viewContent);
    contents.sort(compareViewContentDescriptors);
    this.viewWelcomeContents.set(id, contents);
    this.onDidChangeViewWelcomeContentEmitter.fire(id);

    return toDisposable(() => {
      const current = this.viewWelcomeContents.get(id);
      if (!current) {
        return;
      }

      const index = current.indexOf(viewContent);
      if (index !== -1) {
        current.splice(index, 1);
      }

      if (!current.length) {
        this.viewWelcomeContents.delete(id);
      }

      this.onDidChangeViewWelcomeContentEmitter.fire(id);
    });
  }

  public registerViewWelcomeContent2<TKey>(
    id: string,
    viewContentMap: ReadonlyMap<TKey, IViewContentDescriptor>,
  ): Map<TKey, IDisposable> {
    const disposables = new Map<TKey, IDisposable>();
    for (const [key, viewContent] of viewContentMap) {
      disposables.set(key, this.registerViewWelcomeContent(id, viewContent));
    }

    return disposables;
  }

  public getViewWelcomeContent(id: string): readonly IViewContentDescriptor[] {
    return this.viewWelcomeContents.get(id) ?? [];
  }

  private addViews(viewDescriptors: readonly IViewDescriptor[], viewContainer: ViewContainer): void {
    if (!this.viewContainers.includes(viewContainer)) {
      this.viewContainers.push(viewContainer);
    }

    const views = this.views.get(viewContainer) ?? [];
    for (const viewDescriptor of viewDescriptors) {
      if (!views.some(view => view.id === viewDescriptor.id)) {
        views.push(viewDescriptor);
      }
    }

    this.views.set(viewContainer, views);
  }

  private removeViews(viewDescriptors: readonly IViewDescriptor[], viewContainer: ViewContainer): IViewDescriptor[] {
    const views = this.views.get(viewContainer);
    if (!views) {
      return [];
    }

    const descriptorIds = new Set(viewDescriptors.map(viewDescriptor => viewDescriptor.id));
    const removed: IViewDescriptor[] = [];

    for (let index = views.length - 1; index >= 0; index -= 1) {
      const view = views[index];
      if (!descriptorIds.has(view.id)) {
        continue;
      }

      removed.unshift(view);
      views.splice(index, 1);
    }

    if (!views.length) {
      this.views.delete(viewContainer);
      const containerIndex = this.viewContainers.indexOf(viewContainer);
      if (containerIndex !== -1) {
        this.viewContainers.splice(containerIndex, 1);
      }
    }

    return removed;
  }
}

function compareViewContentDescriptors(a: IViewContentDescriptor, b: IViewContentDescriptor): number {
  const aGroup = a.group ?? ViewContentGroups.More;
  const bGroup = b.group ?? ViewContentGroups.More;
  if (aGroup !== bGroup) {
    return aGroup.localeCompare(bGroup);
  }

  return (a.order ?? 5) - (b.order ?? 5);
}

Registry.add(Extensions.ViewsRegistry, new ViewsRegistry());

export interface IView extends IDisposable {
  readonly id: string;
  readonly element: HTMLElement;

  focus(): void;
  layout?(height: number, width: number): void;
  isVisible(): boolean;
  isBodyVisible(): boolean;
  setVisible(visible: boolean): boolean;
  setExpanded(expanded: boolean): boolean;
  getProgressIndicator(): unknown | undefined;
}

export interface IViewContainerModel {
  readonly viewContainer: ViewContainer;
  readonly title: string;
  readonly icon: URI | string | undefined;
  readonly keybindingId: string | undefined;
  readonly onDidChangeContainerInfo: Event<{
    readonly title?: boolean;
    readonly icon?: boolean;
    readonly keybindingId?: boolean;
    readonly badgeEnablement?: boolean;
  }>;
  readonly allViewDescriptors: readonly IViewDescriptor[];
  readonly onDidChangeAllViewDescriptors: Event<{
    readonly added: readonly IViewDescriptor[];
    readonly removed: readonly IViewDescriptor[];
  }>;
  readonly activeViewDescriptors: readonly IViewDescriptor[];
  readonly onDidChangeActiveViewDescriptors: Event<{
    readonly added: readonly IViewDescriptor[];
    readonly removed: readonly IViewDescriptor[];
  }>;
  readonly visibleViewDescriptors: readonly IViewDescriptor[];
  readonly onDidAddVisibleViewDescriptors: Event<readonly IAddedViewDescriptorRef[]>;
  readonly onDidRemoveVisibleViewDescriptors: Event<readonly IViewDescriptorRef[]>;
  readonly onDidMoveVisibleViewDescriptors: Event<{
    readonly from: IViewDescriptorRef;
    readonly to: IViewDescriptorRef;
  }>;

  isVisible(id: string): boolean;
  setVisible(id: string, visible: boolean): void;
  isCollapsed(id: string): boolean;
  setCollapsed(id: string, collapsed: boolean): void;
  getSize(id: string): number | undefined;
  setSizes(newSizes: readonly { readonly id: string; readonly size: number }[]): void;
  move(from: string, to: string): void;
  add(addedViewDescriptorStates: readonly IAddedViewDescriptorState[]): void;
  remove(viewDescriptors: readonly IViewDescriptor[]): void;
}

export interface IViewPaneContainer extends IDisposable {
  readonly element: HTMLElement;
  readonly title: string;
  readonly actions: readonly IAction[];
  readonly contextActions: readonly IAction[];
  readonly onDidAddViews: Event<readonly IView[]>;
  readonly onDidRemoveViews: Event<readonly IView[]>;
  readonly onDidChangeViewVisibility: Event<IView>;
  readonly views: readonly IView[];

  setVisible(visible: boolean): void;
  isVisible(): boolean;
  focus(): void;
  layout?(height?: number, width?: number): void;
  getActionsContext(): unknown;
  getView(viewId: string): IView | undefined;
  addView(view: IView, options?: { readonly dispose?: boolean }): IView;
  setTitle(title: string): void;
  setActions(actions: readonly IAction[], contextActions?: readonly IAction[]): void;
  openView(viewId: string, focus?: boolean): IView | undefined;
  removeView(viewId: string): void;
  toggleViewVisibility(viewId: string): void;
}

export interface IViewBadge {
  readonly tooltip: string;
  readonly value: number;
}

export const IViewDescriptorService = createDecorator<IViewDescriptorService>("viewDescriptorService");

export const enum ViewVisibilityState {
  Default = 0,
  Expand = 1,
}

export interface IViewDescriptorService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeViewContainers: Event<{
    readonly added: readonly { readonly container: ViewContainer; readonly location: ViewContainerLocation }[];
    readonly removed: readonly { readonly container: ViewContainer; readonly location: ViewContainerLocation }[];
  }>;
  readonly onDidChangeContainer: Event<{
    readonly views: readonly IViewDescriptor[];
    readonly from: ViewContainer;
    readonly to: ViewContainer;
  }>;

  readonly viewContainers: readonly ViewContainer[];

  getViewDescriptorById(viewId: string): IViewDescriptor | null;
  getViewLocationById(viewId: string): ViewContainerLocation | null;
  getViewContainerByViewId(viewId: string): ViewContainer | null;
  getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null;
  getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null;
  getDefaultContainerById(viewId: string): ViewContainer | null;
  getViewContainerModel(container: ViewContainer): IViewContainerModel;
  getViewContainerById(id: string): ViewContainer | null;
  getViewContainersByLocation(location: ViewContainerLocation): readonly ViewContainer[];
  getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined;
  moveViewsToContainer(
    views: readonly IViewDescriptor[],
    viewContainer: ViewContainer,
    visibilityState?: ViewVisibilityState,
  ): void;
}
