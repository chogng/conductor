import type { ITreeElement } from "src/cs/base/browser/ui/tree/tree";

export type ObjectTreeModelNode<T> = {
  readonly children: ObjectTreeModelNode<T>[];
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly depth: number;
  readonly element: T;
  readonly key: string;
};

export type ObjectTreeModelOptions<T> = {
  readonly collapsedKeys?: string[];
  readonly getChildren?: (element: T) => T[] | undefined;
  readonly getKey: (element: T, index: number, depth: number) => string;
  readonly items: T[];
};

export type FlattenedObjectTreeNode<T> = {
  readonly depth: number;
  readonly expandable: boolean;
  readonly item: T;
  readonly key: string;
};

export class ObjectTreeModel<T> {
  private collapsedKeys: Set<string>;
  private options: ObjectTreeModelOptions<T>;

  constructor(options: ObjectTreeModelOptions<T>) {
    this.options = options;
    this.collapsedKeys = new Set(options.collapsedKeys ?? []);
  }

  update(options: ObjectTreeModelOptions<T>): void {
    this.options = options;
    if (options.collapsedKeys) {
      this.collapsedKeys = new Set(options.collapsedKeys);
    }
  }

  getCollapsedKeys(): string[] {
    return [...this.collapsedKeys];
  }

  setCollapsed(key: string, collapsed: boolean): string[] {
    if (collapsed) {
      this.collapsedKeys.add(key);
    } else {
      this.collapsedKeys.delete(key);
    }

    return this.getCollapsedKeys();
  }

  isCollapsed(key: string): boolean {
    return this.collapsedKeys.has(key);
  }

  getChildren(element: T): T[] {
    return this.options.getChildren?.(element) ?? [];
  }

  getNodeChildren(element: T): ObjectTreeModelNode<T>[] {
    return this.getChildren(element).map((child, index) =>
      this.createNode(child, index, 0),
    );
  }

  toTreeElements(): ITreeElement<T>[] {
    return this.options.items.map((item, index) =>
      this.toTreeElement(this.createNode(item, index, 0)),
    );
  }

  flatten(): FlattenedObjectTreeNode<T>[] {
    const result: FlattenedObjectTreeNode<T>[] = [];

    const visit = (node: ObjectTreeModelNode<T>) => {
      result.push({
        depth: node.depth,
        expandable: node.collapsible,
        item: node.element,
        key: node.key,
      });

      if (node.collapsible && node.collapsed) {
        return;
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    for (let index = 0; index < this.options.items.length; index += 1) {
      const item = this.options.items[index];
      if (item) {
        visit(this.createNode(item, index, 0));
      }
    }

    return result;
  }

  private createNode(
    element: T,
    index: number,
    depth: number,
  ): ObjectTreeModelNode<T> {
    const key = this.options.getKey(element, index, depth);
    const children = this.getChildren(element).map((child, childIndex) =>
      this.createNode(child, childIndex, depth + 1),
    );

    return {
      children,
      collapsible: children.length > 0,
      collapsed: this.collapsedKeys.has(key),
      depth,
      element,
      key,
    };
  }

  private toTreeElement(node: ObjectTreeModelNode<T>): ITreeElement<T> {
    return {
      children: node.children.map((child) => this.toTreeElement(child)),
      collapsed: node.collapsed,
      collapsible: node.collapsible,
      element: node.element,
    };
  }
}
