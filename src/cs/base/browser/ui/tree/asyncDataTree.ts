import type { ListHandle } from "src/cs/base/browser/ui/list/listWidget";
import {
  ObjectTree,
  type IObjectTreeOptions,
} from "src/cs/base/browser/ui/tree/objectTree";
import type { IAsyncDataSource, ITreeNode } from "src/cs/base/browser/ui/tree/tree";

export type IAsyncDataTreeOptions<TInput, T> =
  Omit<IObjectTreeOptions<T>, "getChildren" | "items"> & {
    readonly dataSource: IAsyncDataSource<TInput, T>;
  };

type AsyncDataTreeNode<T> = {
  readonly children: AsyncDataTreeNode<T>[];
  readonly element: T;
};

export class AsyncDataTree<TInput, T> implements ListHandle {
  private readonly tree: ObjectTree<AsyncDataTreeNode<T>>;
  private input: TInput | undefined;
  private options: IAsyncDataTreeOptions<TInput, T>;
  private refreshVersion = 0;

  constructor(host: HTMLElement, options: IAsyncDataTreeOptions<TInput, T>) {
    this.options = options;
    this.tree = new ObjectTree(host, this.createObjectTreeOptions([]));
  }

  getInput(): TInput | undefined {
    return this.input;
  }

  async setInput(input: TInput | undefined): Promise<void> {
    this.input = input;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const version = this.refreshVersion + 1;
    this.refreshVersion = version;

    if (typeof this.input === "undefined") {
      this.tree.update(this.createObjectTreeOptions([]));
      return;
    }

    const children = await this.readChildren(this.input);
    if (this.refreshVersion !== version) {
      return;
    }

    this.tree.update(this.createObjectTreeOptions(children));
  }

  update(options: IAsyncDataTreeOptions<TInput, T>): void {
    this.options = options;
    void this.refresh();
  }

  dispose(): void {
    this.refreshVersion += 1;
    this.tree.dispose();
  }

  focus(): void {
    this.tree.focus();
  }

  getViewport(): HTMLDivElement | null {
    return this.tree.getViewport();
  }

  layout(height?: number, width?: number): void {
    this.tree.layout(height, width);
  }

  scrollToEnd(behavior?: ScrollBehavior): void {
    this.tree.scrollToEnd(behavior);
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this.tree.scrollToIndex(index, behavior);
  }

  scrollToStart(behavior?: ScrollBehavior): void {
    this.tree.scrollToStart(behavior);
  }

  private createObjectTreeOptions(
    items: AsyncDataTreeNode<T>[],
  ): IObjectTreeOptions<AsyncDataTreeNode<T>> {
    const options = this.options;

    return {
      className: options.className,
      collapsedKeys: options.collapsedKeys,
      delegate: {
        getHeight: (node) => options.delegate.getHeight(node.element),
      },
      disposeEmpty: options.disposeEmpty,
      empty: options.empty,
      expandOnlyOnTwistieClick: this.mapExpandOnlyOnTwistieClick(),
      gap: options.gap,
      getChildren: (node) => node.children,
      getKey: (node, index, depth) => options.getKey(node.element, index, depth),
      items,
      minVirtualCount: options.minVirtualCount,
      onDidChangeCollapseState: options.onDidChangeCollapseState,
      onDidRenderRange: options.onDidRenderRange
        ? (event) => options.onDidRenderRange?.({
            rendered: event.rendered.map(node => this.toTreeNode(node)),
            renderedEnd: event.renderedEnd,
            renderedStart: event.renderedStart,
            visible: event.visible.map(node => this.toTreeNode(node)),
            visibleEnd: event.visibleEnd,
            visibleStart: event.visibleStart,
          })
        : undefined,
      onKeyDown: options.onKeyDown,
      onScroll: options.onScroll,
      onSelect: options.onSelect
        ? (event) =>
            options.onSelect?.({
              depth: event.depth,
              element: event.element.element,
              index: event.index,
            })
        : undefined,
      renderer: {
        renderElement: (node, index, container, details) =>
          options.renderer.renderElement(
            {
              children: node.element.children.map((child) => child.element),
              collapsible: node.collapsible,
              collapsed: node.collapsed,
              depth: node.depth,
              element: node.element.element,
            },
            index,
            container,
            details,
          ),
        disposeElement: options.renderer.disposeElement
          ? (node, index, container) =>
              options.renderer.disposeElement?.(
                {
                  children: node.element.children.map((child) => child.element),
                  collapsible: node.collapsible,
                  collapsed: node.collapsed,
                  depth: node.depth,
                  element: node.element.element,
                },
                index,
                container,
              )
          : undefined,
        disposeTemplate: options.renderer.disposeTemplate,
        renderTemplate: options.renderer.renderTemplate,
      },
      overscanRows: options.overscanRows,
      selectedKey: options.selectedKey,
      viewportClassName: options.viewportClassName,
    };
  }

  private toTreeNode(node: ITreeNode<AsyncDataTreeNode<T>>): ITreeNode<T> {
    return {
      children: node.element.children.map(child => child.element),
      collapsible: node.collapsible,
      collapsed: node.collapsed,
      depth: node.depth,
      element: node.element.element,
    };
  }

  private mapExpandOnlyOnTwistieClick():
    | boolean
    | ((node: AsyncDataTreeNode<T>) => boolean)
    | undefined {
    const { expandOnlyOnTwistieClick } = this.options;
    if (typeof expandOnlyOnTwistieClick !== "function") {
      return expandOnlyOnTwistieClick;
    }

    return (node) => expandOnlyOnTwistieClick(node.element);
  }

  private async readChildren(
    element: TInput | T,
  ): Promise<AsyncDataTreeNode<T>[]> {
    const children = await this.options.dataSource.getChildren(element);
    const nodes: AsyncDataTreeNode<T>[] = [];

    for (const child of children) {
      nodes.push({
        children: this.options.dataSource.hasChildren(child)
          ? await this.readChildren(child)
          : [],
        element: child,
      });
    }

    return nodes;
  }
}

export default AsyncDataTree;
