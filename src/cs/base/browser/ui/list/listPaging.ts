import { isActiveElement } from '../../dom.js';
import { range } from "src/cs/base/common/arrays";
import { asPromise, type CancelablePromise, createCancelablePromise } from "src/cs/base/common/async";
import { Event, type Event as EventType } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { ScrollbarVisibility } from "src/cs/base/common/scrollable";
import type {
  IListContextMenuEvent,
  IListElementRenderDetails,
  IListEvent,
  IListMouseEvent,
  IListRenderer,
  IListVirtualDelegate,
} from "src/cs/base/browser/ui/list/list";
import { List, type IListAccessibilityProvider, type IListOptions } from "src/cs/base/browser/ui/list/listWidget";
import type { IPagedModel } from "src/cs/base/common/paging";

export interface IPagedRenderer<TElement, TTemplateData> extends IListRenderer<TElement, TTemplateData> {
  renderPlaceholder(index: number, templateData: TTemplateData): void;
}

export interface ITemplateData<T> {
  data?: T;
  request?: CancelablePromise<unknown>;
  renderVersion: number;
}

class PagedRenderer<TElement, TTemplateData> implements IListRenderer<number, ITemplateData<TTemplateData>> {
  public get templateId(): string {
    return this.renderer.templateId;
  }

  public constructor(
    private readonly renderer: IPagedRenderer<TElement, TTemplateData>,
    private readonly modelProvider: () => IPagedModel<TElement>,
  ) {}

  public renderTemplate(container: HTMLElement): ITemplateData<TTemplateData> {
    return {
      data: this.renderer.renderTemplate(container),
      renderVersion: 0,
    };
  }

  public renderElement(
    index: number,
    _listIndex: number,
    templateData: ITemplateData<TTemplateData>,
    details?: IListElementRenderDetails,
  ): void {
    templateData.request?.cancel();
    templateData.request = undefined;
    templateData.renderVersion += 1;

    if (!templateData.data) {
      return;
    }

    const model = this.modelProvider();
    const renderVersion = templateData.renderVersion;

    if (model.isResolved(index)) {
      this.renderer.renderElement(model.get(index), index, templateData.data, details);
      return;
    }

    this.renderer.renderPlaceholder(index, templateData.data);

    const request = createCancelablePromise(token => asPromise(() => model.resolve(index, token)));
    templateData.request = request;

    request.then(element => {
      if (
        templateData.request !== request ||
        templateData.renderVersion !== renderVersion ||
        !templateData.data
      ) {
        return;
      }

      this.renderer.renderElement(element, index, templateData.data, details);
    }, () => {
      // Ignore failed or cancelled resolution for this render pass.
    }).finally(() => {
      if (templateData.request === request) {
        templateData.request = undefined;
      }
    });
  }

  public disposeElement(
    element: number,
    index: number,
    templateData: ITemplateData<TTemplateData>,
    details?: IListElementRenderDetails,
  ): void {
    templateData.request?.cancel();
    templateData.request = undefined;

    const model = this.modelProvider();
    if (templateData.data && model.isResolved(element)) {
      this.renderer.disposeElement?.(
        model.get(element),
        index,
        templateData.data,
        details,
      );
    }
  }

  public disposeTemplate(templateData: ITemplateData<TTemplateData>): void {
    templateData.request?.cancel();
    templateData.request = undefined;

    if (templateData.data) {
      this.renderer.disposeTemplate(templateData.data);
      templateData.data = undefined;
    }
  }
}

class PagedAccessibilityProvider<T> implements IListAccessibilityProvider<number> {
  public readonly getSetSize?: (index: number, listIndex: number, listLength: number) => number;
  public readonly getPosInSet?: (index: number, listIndex: number) => number;
  public readonly getWidgetRole?: IListAccessibilityProvider<number>["getWidgetRole"];
  public readonly onDidChangeActiveDescendant?: EventType<void>;

  public constructor(
    private readonly modelProvider: () => IPagedModel<T>,
    private readonly accessibilityProvider: IListAccessibilityProvider<T>,
  ) {
    if (accessibilityProvider.onDidChangeActiveDescendant) {
      this.onDidChangeActiveDescendant = accessibilityProvider.onDidChangeActiveDescendant;
    }

    const getWidgetRole = accessibilityProvider.getWidgetRole;
    if (getWidgetRole) {
      this.getWidgetRole = () => getWidgetRole.call(accessibilityProvider);
    }

    const getSetSize = accessibilityProvider.getSetSize;
    if (getSetSize) {
      this.getSetSize = (index, _listIndex, listLength) => {
        const element = this.getResolvedElement(index);
        return typeof element === "undefined"
          ? listLength
          : getSetSize.call(accessibilityProvider, element, index, listLength);
      };
    }

    const getPosInSet = accessibilityProvider.getPosInSet;
    if (getPosInSet) {
      this.getPosInSet = (index, listIndex) => {
        const element = this.getResolvedElement(index);
        return typeof element === "undefined"
          ? listIndex + 1
          : getPosInSet.call(accessibilityProvider, element, listIndex);
      };
    }
  }

  public getActiveDescendantId(index: number): string | undefined {
    const element = this.getResolvedElement(index);
    return typeof element === "undefined"
      ? undefined
      : this.accessibilityProvider.getActiveDescendantId?.(element);
  }

  public getAriaLabel(index: number): string | null | undefined {
    const element = this.getResolvedElement(index);
    return typeof element === "undefined"
      ? null
      : this.accessibilityProvider.getAriaLabel?.(element);
  }

  public getWidgetAriaLabel(): string | undefined {
    return this.accessibilityProvider.getWidgetAriaLabel?.();
  }

  public getRole(index: number): string | undefined {
    const element = this.getResolvedElement(index);
    return typeof element === "undefined"
      ? undefined
      : this.accessibilityProvider.getRole?.(element);
  }

  public isChecked(index: number): boolean | "mixed" | undefined {
    const element = this.getResolvedElement(index);
    return typeof element === "undefined"
      ? undefined
      : this.accessibilityProvider.isChecked?.(element);
  }

  private getResolvedElement(index: number): T | undefined {
    const model = this.modelProvider();
    return model.isResolved(index) ? model.get(index) : undefined;
  }
}

export interface IPagedListOptions<T> extends Omit<
  IListOptions<number>,
  "accessibilityProvider" | "delegate" | "getKey" | "items" | "renderers"
> {
  readonly accessibilityProvider?: IListAccessibilityProvider<T>;
  readonly verticalScrollMode?: ScrollbarVisibility;
}

export type IPagedListOptionsUpdate<T> = Partial<IPagedListOptions<T>>;

export class PagedList<T> implements IDisposable {
  private readonly list: List<number>;
  private readonly listDelegate: IListVirtualDelegate<number>;
  private readonly listRenderers: readonly IListRenderer<number, any>[];
  private readonly modelDisposables = new DisposableStore();
  private _model: IPagedModel<T> | undefined;
  private options: IPagedListOptions<T>;

  public readonly onDidFocus: EventType<void>;
  public readonly onDidBlur: EventType<void>;
  public readonly onDidDispose: EventType<void>;
  public readonly onMouseClick: EventType<IListMouseEvent<T>>;
  public readonly onMouseDblClick: EventType<IListMouseEvent<T>>;
  public readonly onPointer: EventType<IListMouseEvent<T>>;
  public readonly onDidChangeFocus: EventType<IListEvent<T>>;
  public readonly onDidChangeSelection: EventType<IListEvent<T>>;
  public readonly onContextMenu: EventType<IListContextMenuEvent<T>>;

  public constructor(
    container: HTMLElement,
    virtualDelegate: IListVirtualDelegate<number>,
    renderers: readonly IPagedRenderer<T, any>[],
    options: IPagedListOptions<T> = {},
  ) {
    this.options = options;
    this.listDelegate = virtualDelegate;

    const modelProvider = () => this.model;
    this.listRenderers = renderers.map(
      renderer => new PagedRenderer<T, any>(renderer, modelProvider),
    );

    this.list = new List(container, this.createListOptions([]));
    this.onDidFocus = this.list.onDidFocus;
    this.onDidBlur = this.list.onDidBlur;
    this.onDidDispose = this.list.onDidDispose;
    this.onMouseClick = Event.map<IListMouseEvent<number>, IListMouseEvent<T>>(
      this.list.onMouseClick,
      event => this.mapMouseEvent(event),
    );
    this.onMouseDblClick = Event.map<IListMouseEvent<number>, IListMouseEvent<T>>(
      this.list.onMouseDblClick,
      event => this.mapMouseEvent(event),
    );
    this.onPointer = Event.map<IListMouseEvent<number>, IListMouseEvent<T>>(
      this.list.onPointer,
      event => this.mapMouseEvent(event),
    );
    this.onDidChangeFocus = Event.map<IListEvent<number>, IListEvent<T>>(
      this.list.onDidChangeFocus,
      event => this.mapListEvent(event),
    );
    this.onDidChangeSelection = Event.filter(
      Event.map<IListEvent<number>, IListEvent<T>>(
        this.list.onDidChangeSelection,
        event => this.mapListEvent(event),
      ),
      event => event.elements.length > 0,
    );
    this.onContextMenu = Event.map<IListContextMenuEvent<number>, IListContextMenuEvent<T>>(
      this.list.onContextMenu,
      event => this.mapContextMenuEvent(event),
    );
  }

  public get model(): IPagedModel<T> {
    if (!this._model) {
      throw new Error("PagedList model has not been set");
    }

    return this._model;
  }

  public set model(model: IPagedModel<T>) {
    this.modelDisposables.clear();
    this._model = model;
    this.list.setItems(range(model.length));
    this.list.rerender();
    this.modelDisposables.add(model.onDidIncrementLength(newLength => {
      const previousLength = this.list.length;
      if (newLength <= previousLength) {
        return;
      }

      this.list.splice(previousLength, 0, range(previousLength, newLength));
    }));
  }

  public updateOptions(options: IPagedListOptionsUpdate<T>): void {
    this.options = {
      ...this.options,
      ...options,
    };
    this.list.updateOptions(this.createListOptions([]));
  }

  public getHTMLElement(): HTMLElement {
    return this.list.getViewport();
  }

  public getViewport(): HTMLDivElement {
    return this.list.getViewport();
  }

  public get widget(): List<number> {
    return this.list;
  }

  public get length(): number {
    return this.list.length;
  }

  public get scrollTop(): number {
    return this.list.scrollTop;
  }

  public set scrollTop(scrollTop: number) {
    this.list.scrollTop = scrollTop;
  }

  public isDOMFocused(): boolean {
    return isActiveElement(this.getHTMLElement());
  }

  public domFocus(): void {
    this.list.domFocus();
  }

  public focus(): void {
    this.list.focus();
  }

  public layout(height?: number, width?: number): void {
    this.list.layout(height, width);
  }

  public scrollToStart(behavior?: ScrollBehavior): void {
    this.list.scrollToStart(behavior);
  }

  public scrollToEnd(behavior?: ScrollBehavior): void {
    this.list.scrollToEnd(behavior);
  }

  public scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this.list.scrollToIndex(index, behavior);
  }

  public setFocus(indexes: readonly number[], browserEvent?: UIEvent): void {
    this.list.setFocus(indexes, browserEvent);
  }

  public getFocus(): number[] {
    return this.list.getFocus();
  }

  public setAnchor(index: number | undefined): void {
    this.list.setAnchor(index);
  }

  public getAnchor(): number | undefined {
    return this.list.getAnchor();
  }

  public focusNext(count?: number, loop?: boolean): void {
    this.list.focusNext(count, loop);
  }

  public focusPrevious(count?: number, loop?: boolean): void {
    this.list.focusPrevious(count, loop);
  }

  public focusNextPage(): void {
    this.list.focusNextPage();
  }

  public focusPreviousPage(): void {
    this.list.focusPreviousPage();
  }

  public focusFirst(): void {
    this.list.focusFirst();
  }

  public focusLast(): void {
    this.list.focusLast();
  }

  public setSelection(indexes: readonly number[], browserEvent?: UIEvent): void {
    this.list.setSelection(indexes, browserEvent);
  }

  public getSelection(): number[] {
    return this.list.getSelection();
  }

  public getSelectedElements(): T[] {
    return this.mapResolvedIndexes(this.list.getSelection());
  }

  public rerender(index?: number): void {
    this.list.rerender(index);
  }

  public rerenderIndexes(indexes: readonly number[]): void {
    this.list.rerenderIndexes(indexes);
  }

  public triggerTypeNavigation(): void {
    this.list.triggerTypeNavigation();
  }

  public reveal(index: number, relativeTop?: number): void {
    this.list.reveal(index, relativeTop);
  }

  public dispose(): void {
    this.modelDisposables.dispose();
    this.list.dispose();
  }

  private createListOptions(items: readonly number[]): IListOptions<number> {
    const { accessibilityProvider, ...options } = this.options;

    return {
      ...options,
      accessibilityProvider: accessibilityProvider
        ? new PagedAccessibilityProvider(() => this.model, accessibilityProvider)
        : undefined,
      delegate: this.listDelegate,
      getKey: index => String(index),
      items,
      renderers: this.listRenderers,
    };
  }

  private mapMouseEvent(event: IListMouseEvent<number>): IListMouseEvent<T> {
    return {
      browserEvent: event.browserEvent,
      element: typeof event.element === "number"
        ? this.getResolvedElement(event.element)
        : undefined,
      index: event.index,
    };
  }

  private mapContextMenuEvent(event: IListContextMenuEvent<number>): IListContextMenuEvent<T> {
    return {
      anchor: event.anchor,
      browserEvent: event.browserEvent,
      element: typeof event.element === "number"
        ? this.getResolvedElement(event.element)
        : undefined,
      index: event.index,
    };
  }

  private mapListEvent(event: IListEvent<number>): IListEvent<T> {
    const indexes: number[] = [];
    const elements = this.mapResolvedIndexes(event.elements, indexes);

    return {
      browserEvent: event.browserEvent,
      elements,
      indexes,
    };
  }

  private getResolvedElement(index: number): T | undefined {
    const model = this.model;
    return model.isResolved(index) ? model.get(index) : undefined;
  }

  private mapResolvedIndexes(indexes: readonly number[], resolvedIndexes?: number[]): T[] {
    const model = this.model;
    const elements: T[] = [];

    for (const index of indexes) {
      if (model.isResolved(index)) {
        resolvedIndexes?.push(index);
        elements.push(model.get(index));
      }
    }

    return elements;
  }
}
