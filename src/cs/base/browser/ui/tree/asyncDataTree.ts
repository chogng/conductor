import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import {
  ObjectTree,
  type IObjectTreeOptions,
} from "src/cs/base/browser/ui/tree/objectTree";
import type { IAsyncDataSource } from "src/cs/base/browser/ui/tree/tree";

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
      ...options,
      delegate: {
        getHeight: (node) => options.delegate.getHeight(node.element),
      },
      expandOnlyOnTwistieClick: this.mapExpandOnlyOnTwistieClick(),
      getChildren: (node) => node.children,
      getKey: (node, index, depth) => options.getKey(node.element, index, depth),
      items,
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
      },
      selectedKey: options.selectedKey,
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
