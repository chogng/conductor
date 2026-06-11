import {
  Emitter,
  Event,
  type Event as EventType,
} from "src/cs/base/common/event";
import { Dimension, getClientArea, type IDimension } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { refineServiceDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
  type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import {
  ILayoutService,
  type ILayoutOffsetInfo,
  type ILayoutService as ILayoutServiceType,
} from "src/cs/platform/layout/browser/layoutService";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";

export const IWorkbenchLayoutService = refineServiceDecorator<
  ILayoutServiceType,
  IWorkbenchLayoutService
>(ILayoutService);

export const enum Parts {
  TITLEBAR_PART = "workbench.parts.titlebar",
  SIDEBAR_PART = "workbench.parts.sidebar",
  EDITOR_PART = "workbench.parts.editor",
  PANEL_PART = "workbench.parts.panel",
  AUXILIARYBAR_PART = "workbench.parts.auxiliarybar",
}

const StoredLayoutParts = [
  Parts.TITLEBAR_PART,
  Parts.SIDEBAR_PART,
  Parts.EDITOR_PART,
  Parts.PANEL_PART,
  Parts.AUXILIARYBAR_PART,
] as const;
const DefaultVisibleParts = new Set<Parts>(StoredLayoutParts);
const WorkbenchPartHiddenStoragePrefix = "workbench.part.hidden.";

export interface IPartVisibilityChangeEvent {
  readonly partId: string;
  readonly visible: boolean;
}

export type LayoutView = WorkbenchMainPart | "settings";

export interface IWorkbenchNavigationState {
  readonly activeMainPart: WorkbenchMainPart;
  readonly activeView: LayoutView;
  readonly hasVisitedSettingsView: boolean;
  readonly historyIndex: number;
  readonly historyLength: number;
}

type LayoutNavigationState = {
  readonly activeMainPart: WorkbenchMainPart;
  readonly activeView: LayoutView;
  readonly history: readonly LayoutView[];
  readonly historyIndex: number;
};

const INITIAL_LAYOUT_NAVIGATION_STATE: LayoutNavigationState = {
  activeMainPart: "table",
  activeView: "table",
  history: ["table"],
  historyIndex: 0,
};

export interface IWorkbenchLayoutService extends ILayoutServiceType {
  readonly _serviceBrand: undefined;

  readonly onDidChangePartVisibility: EventType<IPartVisibilityChangeEvent>;
  readonly onDidChangeWorkbenchNavigation: EventType<IWorkbenchNavigationState>;

  readonly activeView: LayoutView;
  readonly activeWorkbenchMainPart: WorkbenchMainPart;

  getWorkbenchNavigationState(): IWorkbenchNavigationState;
  navigateBack(): void;
  navigateForward(): void;
  navigateToView(view: LayoutView): void;
  layout(): void;
  isVisible(part: Parts): boolean;
  resetLayoutState(): void;
  resetToView(view: LayoutView): void;
  selectView(view: string): void;
  setPartHidden(hidden: boolean, part: Parts): void;
}

export class BrowserWorkbenchLayoutService
  extends Disposable
  implements IWorkbenchLayoutService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidLayoutMainContainerEmitter =
    this._register(new Emitter<IDimension>());
  private readonly onDidLayoutContainerEmitter = this._register(new Emitter<{
    readonly container: HTMLElement;
    readonly dimension: IDimension;
  }>());
  private readonly onDidLayoutActiveContainerEmitter =
    this._register(new Emitter<IDimension>());
  private readonly onDidChangePartVisibilityEmitter =
    this._register(new Emitter<IPartVisibilityChangeEvent>());
  private readonly onDidChangeWorkbenchNavigationEmitter =
    this._register(new Emitter<IWorkbenchNavigationState>());
  private readonly visibleParts = new Set<Parts>([
    Parts.TITLEBAR_PART,
    Parts.SIDEBAR_PART,
    Parts.EDITOR_PART,
    Parts.PANEL_PART,
    Parts.AUXILIARYBAR_PART,
  ]);
  private navigation = INITIAL_LAYOUT_NAVIGATION_STATE;
  private hasVisitedSettingsView = false;
  private dimension: IDimension = Dimension.None;

  constructor(
    @IStorageService private readonly storageService: IStorageServiceType,
  ) {
    super();
    this.restorePartVisibility();
  }

  public readonly onDidLayoutMainContainer = this.onDidLayoutMainContainerEmitter.event;
  public readonly onDidLayoutContainer = this.onDidLayoutContainerEmitter.event;
  public readonly onDidLayoutActiveContainer = this.onDidLayoutActiveContainerEmitter.event;
  public readonly onDidAddContainer: ILayoutServiceType["onDidAddContainer"] =
    Event.None as ILayoutServiceType["onDidAddContainer"];
  public readonly onDidChangeActiveContainer: ILayoutServiceType["onDidChangeActiveContainer"] =
    Event.None as ILayoutServiceType["onDidChangeActiveContainer"];
  public readonly onDidChangePartVisibility = this.onDidChangePartVisibilityEmitter.event;
  public readonly onDidChangeWorkbenchNavigation =
    this.onDidChangeWorkbenchNavigationEmitter.event;

  public get mainContainer(): HTMLElement {
    return this.resolveMainContainer();
  }

  public get activeContainer(): HTMLElement {
    return this.mainContainer;
  }

  public get activeView(): LayoutView {
    return this.navigation.activeView;
  }

  public get activeWorkbenchMainPart(): WorkbenchMainPart {
    return this.navigation.activeMainPart;
  }

  public get containers(): Iterable<HTMLElement> {
    return [this.mainContainer];
  }

  public get mainContainerDimension(): IDimension {
    return this.dimension;
  }

  public get activeContainerDimension(): IDimension {
    return this.dimension;
  }

  public get mainContainerOffset(): ILayoutOffsetInfo {
    return { top: 0, quickPickTop: 0 };
  }

  public get activeContainerOffset(): ILayoutOffsetInfo {
    return this.mainContainerOffset;
  }

  public getContainer(_window: Window): HTMLElement {
    return this.mainContainer;
  }

  public whenContainerStylesLoaded(_window: Window): Promise<void> | undefined {
    return Promise.resolve();
  }

  public focus(): void {
    this.activeContainer.focus();
  }

  public getWorkbenchNavigationState(): IWorkbenchNavigationState {
    return this.createNavigationState();
  }

  public navigateBack(): void {
    this.setNavigation(navigateLayoutBack(this.navigation));
  }

  public navigateForward(): void {
    this.setNavigation(navigateLayoutForward(this.navigation));
  }

  public navigateToView(view: LayoutView): void {
    this.setNavigation(navigateToLayoutPage(this.navigation, view));
  }

  public layout(): void {
    const container = this.mainContainer;
    const dimension = getClientArea(container);
    this.dimension = dimension;
    this.onDidLayoutMainContainerEmitter.fire(dimension);
    this.onDidLayoutActiveContainerEmitter.fire(dimension);
    this.onDidLayoutContainerEmitter.fire({ container, dimension });
  }

  public isVisible(part: Parts): boolean {
    return this.visibleParts.has(part);
  }

  public setPartHidden(hidden: boolean, part: Parts): void {
    const isVisible = this.visibleParts.has(part);
    if (hidden === !isVisible) {
      return;
    }

    if (hidden) {
      this.visibleParts.delete(part);
    } else {
      this.visibleParts.add(part);
    }

    this.storageService.store(
      this.getHiddenPartStorageKey(part),
      hidden,
      StorageScope.PROFILE,
      StorageTarget.USER,
    );

    this.onDidChangePartVisibilityEmitter.fire({
      partId: part,
      visible: !hidden,
    });
  }

  public resetLayoutState(): void {
    const changedParts = StoredLayoutParts.filter(part => !this.visibleParts.has(part));
    this.visibleParts.clear();
    for (const part of DefaultVisibleParts) {
      this.visibleParts.add(part);
    }

    this.storageService.removeByPrefix(
      WorkbenchPartHiddenStoragePrefix,
      StorageScope.PROFILE,
    );

    for (const part of changedParts) {
      this.onDidChangePartVisibilityEmitter.fire({
        partId: part,
        visible: true,
      });
    }
  }

  public resetToView(view: LayoutView): void {
    this.setNavigation({
      activeMainPart: resolveActiveMainPart(view, this.navigation.activeMainPart),
      activeView: view,
      history: [view],
      historyIndex: 0,
    });
  }

  public selectView(view: string): void {
    const resolvedView = resolveLayoutView(view);
    if (resolvedView) {
      this.navigateToView(resolvedView);
    }
  }

  private restorePartVisibility(): void {
    for (const part of StoredLayoutParts) {
      if (this.storageService.getBoolean(
        this.getHiddenPartStorageKey(part),
        StorageScope.PROFILE,
        false,
      )) {
        this.visibleParts.delete(part);
      }
    }
  }

  private getHiddenPartStorageKey(part: Parts): string {
    return `${WorkbenchPartHiddenStoragePrefix}${part}`;
  }

  private setNavigation(nextNavigation: LayoutNavigationState): void {
    if (nextNavigation === this.navigation) {
      return;
    }

    this.navigation = nextNavigation;
    this.markActiveViewVisited();
    this.blurActiveElement();
    this.onDidChangeWorkbenchNavigationEmitter.fire(this.createNavigationState());
  }

  private markActiveViewVisited(): void {
    if (this.navigation.activeView === "settings") {
      this.hasVisitedSettingsView = true;
    }
  }

  private createNavigationState(): IWorkbenchNavigationState {
    return {
      activeMainPart: this.navigation.activeMainPart,
      activeView: this.navigation.activeView,
      hasVisitedSettingsView: this.hasVisitedSettingsView,
      historyIndex: this.navigation.historyIndex,
      historyLength: this.navigation.history.length,
    };
  }

  private blurActiveElement(): void {
    if (typeof document === "undefined") {
      return;
    }

    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement instanceof HTMLElement &&
      typeof activeElement.blur === "function"
    ) {
      activeElement.blur();
    }
  }

  private resolveMainContainer(): HTMLElement {
    const workbench = document.querySelector<HTMLElement>(".workbench_layout");
    if (workbench) {
      return workbench;
    }

    return document.getElementById("root") ?? document.body;
  }
}

const navigateToLayoutPage = (
  prevState: LayoutNavigationState,
  nextPage: LayoutView,
): LayoutNavigationState => {
  if (prevState.activeView === nextPage) {
    return prevState;
  }

  const truncatedHistory = prevState.history.slice(
    0,
    prevState.historyIndex + 1,
  );
  const nextHistory = [...truncatedHistory, nextPage];

  return {
    activeMainPart: resolveActiveMainPart(nextPage, prevState.activeMainPart),
    activeView: nextPage,
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
};

const navigateLayoutBack = (
  prevState: LayoutNavigationState,
): LayoutNavigationState => {
  if (prevState.historyIndex <= 0) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex - 1;
  const activeView = prevState.history[nextIndex];
  return {
    ...prevState,
    activeMainPart: resolveActiveMainPart(activeView, prevState.activeMainPart),
    activeView,
    historyIndex: nextIndex,
  };
};

const navigateLayoutForward = (
  prevState: LayoutNavigationState,
): LayoutNavigationState => {
  if (prevState.historyIndex >= prevState.history.length - 1) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex + 1;
  const activeView = prevState.history[nextIndex];
  return {
    ...prevState,
    activeMainPart: resolveActiveMainPart(activeView, prevState.activeMainPart),
    activeView,
    historyIndex: nextIndex,
  };
};

const resolveLayoutView = (value: string): LayoutView | null => {
  if (value === "table" || value === "chart" || value === "settings") {
    return value;
  }

  return null;
};

const resolveActiveMainPart = (
  view: LayoutView,
  fallback: WorkbenchMainPart,
): WorkbenchMainPart =>
  view === "table" || view === "chart" ? view : fallback;

registerSingleton(
  IWorkbenchLayoutService,
  BrowserWorkbenchLayoutService,
  InstantiationType.Delayed,
);
