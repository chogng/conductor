/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  IndexTreeModel,
  type FlattenedTreeNode,
  type IndexTreeElement,
  type IndexTreeModelChange,
} from "src/cs/base/browser/ui/tree/indexTreeModel";
import type { ITreeElement, ITreeNode } from "src/cs/base/browser/ui/tree/tree";

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

export class ObjectTreeModel<T> {
  private readonly model: IndexTreeModel<T>;
  private options: ObjectTreeModelOptions<T>;

  constructor(options: ObjectTreeModelOptions<T>) {
    this.options = options;
    const collapsedKeys = new Set(options.collapsedKeys ?? []);
    this.model = new IndexTreeModel(
      this.createIndexTreeElements(options.items, 0, collapsedKeys),
      options.collapsedKeys,
    );
  }

  update(options: ObjectTreeModelOptions<T>): IndexTreeModelChange<T> {
    this.options = options;
    const collapsedKeys = options.collapsedKeys ?? this.model.getCollapsedKeys();
    return this.model.update(
      this.createIndexTreeElements(options.items, 0, new Set(collapsedKeys)),
      collapsedKeys,
    );
  }

  getCollapsedKeys(): string[] {
    return this.model.getCollapsedKeys();
  }

  setCollapsed(key: string, collapsed: boolean): IndexTreeModelChange<T> {
    const collapsedKeys = new Set(this.model.getCollapsedKeys());
    if (collapsed) {
      collapsedKeys.add(key);
    } else {
      collapsedKeys.delete(key);
    }

    return this.model.update(
      this.createIndexTreeElements(this.options.items, 0, collapsedKeys),
      [...collapsedKeys],
    );
  }

  isCollapsed(key: string): boolean {
    return this.model.isCollapsed(key);
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

  flatten(): FlattenedTreeNode<T>[] {
    return this.model.flatten();
  }

  getTreeNode(entry: FlattenedTreeNode<T>): ITreeNode<T> {
    return {
      children: this.getChildren(entry.item),
      collapsible: entry.expandable,
      collapsed: entry.expandable && this.model.isCollapsed(entry.key),
      depth: entry.depth,
      element: entry.item,
    };
  }

  getVisibleDescendants(
    element: T,
    depth: number,
  ): FlattenedTreeNode<T>[] {
    const result: FlattenedTreeNode<T>[] = [];

    const visitChildren = (parent: T, parentDepth: number) => {
      const children = this.getChildren(parent);
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child) {
          continue;
        }

        const entry = this.createFlattenedNode(child, index, parentDepth + 1);
        result.push(entry);

        if (entry.expandable && !this.model.isCollapsed(entry.key)) {
          visitChildren(child, entry.depth);
        }
      }
    };

    visitChildren(element, depth);
    return result;
  }

  private createIndexTreeElements(
    items: readonly T[],
    depth: number,
    collapsedKeys: ReadonlySet<string>,
  ): IndexTreeElement<T>[] {
    const elements: IndexTreeElement<T>[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) {
        continue;
      }

      const key = this.options.getKey(item, index, depth);
      const children = this.getChildren(item);
      elements.push({
        children: collapsedKeys.has(key)
          ? this.createCollapsedChildIndexTreeElements(children, depth + 1)
          : this.createIndexTreeElements(children, depth + 1, collapsedKeys),
        element: item,
        key,
      });
    }

    return elements;
  }

  private createCollapsedChildIndexTreeElements(
    items: readonly T[],
    depth: number,
  ): IndexTreeElement<T>[] {
    return items.map((item, index) => ({
      children: [],
      element: item,
      key: this.options.getKey(item, index, depth),
    }));
  }

  private createFlattenedNode(
    element: T,
    index: number,
    depth: number,
  ): FlattenedTreeNode<T> {
    const key = this.options.getKey(element, index, depth);
    const children = this.getChildren(element);

    return {
      depth,
      expandable: children.length > 0,
      item: element,
      key,
    };
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
      collapsed: this.model.isCollapsed(key),
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
