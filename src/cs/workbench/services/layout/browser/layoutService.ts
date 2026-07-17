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

export interface IWorkbenchLayoutService extends ILayoutServiceType {
  readonly _serviceBrand: undefined;

  readonly onDidChangePartVisibility: EventType<IPartVisibilityChangeEvent>;

  layout(): void;
  isVisible(part: Parts): boolean;
  resetLayoutState(): void;
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
  private readonly visibleParts = new Set<Parts>([
    Parts.TITLEBAR_PART,
    Parts.SIDEBAR_PART,
    Parts.EDITOR_PART,
    Parts.PANEL_PART,
    Parts.AUXILIARYBAR_PART,
  ]);
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

  public get mainContainer(): HTMLElement {
    return this.resolveMainContainer();
  }

  public get activeContainer(): HTMLElement {
    return this.mainContainer;
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

  private resolveMainContainer(): HTMLElement {
    const workbench = document.querySelector<HTMLElement>(".workbench_layout");
    if (workbench) {
      return workbench;
    }

    return document.getElementById("root") ?? document.body;
  }
}

registerSingleton(
  IWorkbenchLayoutService,
  BrowserWorkbenchLayoutService,
  InstantiationType.Delayed,
);
