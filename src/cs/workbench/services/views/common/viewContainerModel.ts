import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { getContextKeyRulesKeys, IContextKeyService, type ContextKeyRules } from "src/cs/platform/contextkey/common/contextkey";
import type {
  IAddedViewDescriptorRef,
  IAddedViewDescriptorState,
  IViewContainerModel,
  IViewDescriptor,
  IViewDescriptorRef,
  ViewContainer,
} from "src/cs/workbench/common/views";

type ViewDescriptorState = {
  active: boolean;
  collapsed: boolean;
  order?: number;
  size?: number;
  visible: boolean;
};

type ViewDescriptorItem = {
  readonly viewDescriptor: IViewDescriptor;
  readonly state: ViewDescriptorState;
};

export class ViewContainerModel extends Disposable implements IViewContainerModel {
  public readonly onDidChangeContainerInfo = this._register(new Emitter<{
    readonly title?: boolean;
    readonly icon?: boolean;
    readonly keybindingId?: boolean;
  }>()).event;

  private readonly onDidChangeAllViewDescriptorsEmitter = this._register(new Emitter<{
    readonly added: readonly IViewDescriptor[];
    readonly removed: readonly IViewDescriptor[];
  }>());
  public readonly onDidChangeAllViewDescriptors = this.onDidChangeAllViewDescriptorsEmitter.event;

  private readonly onDidChangeActiveViewDescriptorsEmitter = this._register(new Emitter<{
    readonly added: readonly IViewDescriptor[];
    readonly removed: readonly IViewDescriptor[];
  }>());
  public readonly onDidChangeActiveViewDescriptors = this.onDidChangeActiveViewDescriptorsEmitter.event;

  private readonly onDidAddVisibleViewDescriptorsEmitter = this._register(new Emitter<readonly IAddedViewDescriptorRef[]>());
  public readonly onDidAddVisibleViewDescriptors = this.onDidAddVisibleViewDescriptorsEmitter.event;

  private readonly onDidRemoveVisibleViewDescriptorsEmitter = this._register(new Emitter<readonly IViewDescriptorRef[]>());
  public readonly onDidRemoveVisibleViewDescriptors = this.onDidRemoveVisibleViewDescriptorsEmitter.event;

  private readonly onDidMoveVisibleViewDescriptorsEmitter = this._register(new Emitter<{
    readonly from: IViewDescriptorRef;
    readonly to: IViewDescriptorRef;
  }>());
  public readonly onDidMoveVisibleViewDescriptors = this.onDidMoveVisibleViewDescriptorsEmitter.event;

  private readonly contextKeys = new Set<string>();
  private readonly items: ViewDescriptorItem[] = [];

  public get title(): string {
    return this.viewContainer.title;
  }

  public get icon() {
    return this.viewContainer.icon;
  }

  public get keybindingId(): string | undefined {
    return this.viewContainer.openCommandActionDescriptor?.id;
  }

  public get allViewDescriptors(): readonly IViewDescriptor[] {
    return this.items.map(item => item.viewDescriptor);
  }

  public get activeViewDescriptors(): readonly IViewDescriptor[] {
    return this.items
      .filter(item => item.state.active)
      .map(item => item.viewDescriptor);
  }

  public get visibleViewDescriptors(): readonly IViewDescriptor[] {
    return this.items
      .filter(item => this.isViewDescriptorVisible(item))
      .map(item => item.viewDescriptor);
  }

  constructor(
    public readonly viewContainer: ViewContainer,
    @IContextKeyService private readonly contextKeyService: IContextKeyService,
  ) {
    super();

    this._register(Event.filter(
      this.contextKeyService.onDidChangeContext,
      event => event.affectsSome(this.contextKeys),
    )(() => this.onDidChangeContext()));
  }

  public isVisible(id: string): boolean {
    return this.isViewDescriptorVisible(this.find(id).item);
  }

  public setVisible(id: string, visible: boolean): void {
    const found = this.find(id);
    if (found.item.state.visible === visible) {
      return;
    }

    const wasVisible = this.isViewDescriptorVisible(found.item);
    found.item.state.visible = visible;
    const isVisible = this.isViewDescriptorVisible(found.item);

    if (wasVisible === isVisible) {
      return;
    }

    if (isVisible) {
      this.onDidAddVisibleViewDescriptorsEmitter.fire([this.toAddedRef(found.item)]);
    } else {
      this.onDidRemoveVisibleViewDescriptorsEmitter.fire([this.toRef(found.item)]);
    }
  }

  public isCollapsed(id: string): boolean {
    return this.find(id).item.state.collapsed;
  }

  public setCollapsed(id: string, collapsed: boolean): void {
    this.find(id).item.state.collapsed = collapsed;
  }

  public getSize(id: string): number | undefined {
    return this.find(id).item.state.size;
  }

  public setSizes(newSizes: readonly { readonly id: string; readonly size: number }[]): void {
    for (const { id, size } of newSizes) {
      this.find(id).item.state.size = size;
    }
  }

  public move(from: string, to: string): void {
    const fromIndex = this.items.findIndex(item => item.viewDescriptor.id === from);
    const toIndex = this.items.findIndex(item => item.viewDescriptor.id === to);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return;
    }

    const [item] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, item);
    this.items.forEach((current, index) => {
      current.state.order = index;
    });
    this.onDidMoveVisibleViewDescriptorsEmitter.fire({
      from: this.toRef(item),
      to: this.toRef(this.items[toIndex]),
    });
  }

  public add(states: readonly IAddedViewDescriptorState[]): void {
    const added: ViewDescriptorItem[] = [];
    for (const state of states) {
      if (this.items.some(item => item.viewDescriptor.id === state.viewDescriptor.id)) {
        continue;
      }

      this.trackContextKeys(state.viewDescriptor.when);
      added.push({
        viewDescriptor: state.viewDescriptor,
        state: {
          active: this.contextKeyService.contextMatchesRules(state.viewDescriptor.when),
          collapsed: state.collapsed ?? Boolean(state.viewDescriptor.collapsed),
          order: state.viewDescriptor.order,
          visible: state.visible ?? !state.viewDescriptor.hideByDefault,
        },
      });
    }

    if (!added.length) {
      return;
    }

    this.items.push(...added);
    this.items.sort(compareItems);
    this.onDidChangeAllViewDescriptorsEmitter.fire({
      added: added.map(item => item.viewDescriptor),
      removed: [],
    });

    const active = added.filter(item => item.state.active);
    if (active.length) {
      this.onDidChangeActiveViewDescriptorsEmitter.fire({
        added: active.map(item => item.viewDescriptor),
        removed: [],
      });
    }

    const visible = active.filter(item => this.isViewDescriptorVisible(item));
    if (visible.length) {
      this.onDidAddVisibleViewDescriptorsEmitter.fire(visible.map(item => this.toAddedRef(item)));
    }
  }

  public remove(viewDescriptors: readonly IViewDescriptor[]): void {
    const ids = new Set(viewDescriptors.map(view => view.id));
    const removed: ViewDescriptorItem[] = [];
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (!ids.has(item.viewDescriptor.id)) {
        continue;
      }

      removed.unshift(item);
      this.items.splice(index, 1);
    }

    if (!removed.length) {
      return;
    }

    this.rebuildContextKeys();
    this.onDidRemoveVisibleViewDescriptorsEmitter.fire(
      removed
        .filter(item => this.isViewDescriptorVisible(item))
        .map(item => this.toRef(item)),
    );
    this.onDidChangeActiveViewDescriptorsEmitter.fire({
      added: [],
      removed: removed
        .filter(item => item.state.active)
        .map(item => item.viewDescriptor),
    });
    this.onDidChangeAllViewDescriptorsEmitter.fire({
      added: [],
      removed: removed.map(item => item.viewDescriptor),
    });
  }

  private onDidChangeContext(): void {
    const added: IViewDescriptor[] = [];
    const removed: IViewDescriptor[] = [];
    const addedVisible: IAddedViewDescriptorRef[] = [];
    const removedVisible: IViewDescriptorRef[] = [];

    for (const item of this.items) {
      const wasActive = item.state.active;
      const wasVisible = this.isViewDescriptorVisible(item);
      item.state.active = this.contextKeyService.contextMatchesRules(item.viewDescriptor.when);

      if (wasActive !== item.state.active) {
        if (item.state.active) {
          added.push(item.viewDescriptor);
        } else {
          removed.push(item.viewDescriptor);
        }
      }

      const isVisible = this.isViewDescriptorVisible(item);
      if (wasVisible !== isVisible) {
        if (isVisible) {
          addedVisible.push(this.toAddedRef(item));
        } else {
          removedVisible.push(this.toRef(item));
        }
      }
    }

    if (added.length || removed.length) {
      this.onDidChangeActiveViewDescriptorsEmitter.fire({ added, removed });
    }
    if (removedVisible.length) {
      this.onDidRemoveVisibleViewDescriptorsEmitter.fire(removedVisible);
    }
    if (addedVisible.length) {
      this.onDidAddVisibleViewDescriptorsEmitter.fire(addedVisible);
    }
  }

  private isViewDescriptorVisible(item: ViewDescriptorItem): boolean {
    return item.state.active && item.state.visible;
  }

  private find(id: string): { readonly item: ViewDescriptorItem; readonly index: number } {
    const index = this.items.findIndex(item => item.viewDescriptor.id === id);
    if (index === -1) {
      throw new Error(`View descriptor '${id}' not found.`);
    }

    return { item: this.items[index], index };
  }

  private toRef(item: ViewDescriptorItem): IViewDescriptorRef {
    return {
      index: this.visibleIndexOf(item),
      viewDescriptor: item.viewDescriptor,
    };
  }

  private toAddedRef(item: ViewDescriptorItem): IAddedViewDescriptorRef {
    return {
      ...this.toRef(item),
      collapsed: item.state.collapsed,
      size: item.state.size,
    };
  }

  private visibleIndexOf(target: ViewDescriptorItem): number {
    let visibleIndex = 0;
    for (const item of this.items) {
      if (item === target) {
        return visibleIndex;
      }
      if (this.isViewDescriptorVisible(item)) {
        visibleIndex += 1;
      }
    }

    return visibleIndex;
  }

  private trackContextKeys(expression: ContextKeyRules): void {
    for (const key of getContextKeyRulesKeys(expression)) {
      this.contextKeys.add(key);
    }
  }

  private rebuildContextKeys(): void {
    this.contextKeys.clear();
    for (const item of this.items) {
      this.trackContextKeys(item.viewDescriptor.when);
    }
  }
}

function compareItems(a: ViewDescriptorItem, b: ViewDescriptorItem): number {
  const order = (a.state.order ?? Number.MAX_VALUE) - (b.state.order ?? Number.MAX_VALUE);
  if (order !== 0) {
    return order;
  }

  return a.viewDescriptor.id.localeCompare(b.viewDescriptor.id);
}
