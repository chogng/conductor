/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ITreeNode } from "src/cs/base/browser/ui/tree/tree";

export type IndexTreeElement<T> = {
  readonly children?: readonly IndexTreeElement<T>[];
  readonly element: T;
  readonly key: string;
};

export type FlattenedTreeNode<T> = {
  readonly depth: number;
  readonly expandable: boolean;
  readonly item: T;
  readonly key: string;
};

export type IndexTreeModelNode<T> = {
  readonly children: IndexTreeModelNode<T>[];
  readonly collapsed: boolean;
  readonly depth: number;
  readonly element: T;
  readonly expandable: boolean;
  readonly key: string;
};

export type IndexTreeModelSplice<T> = {
  readonly deleteCount: number;
  readonly elements: readonly FlattenedTreeNode<T>[];
  readonly start: number;
};

export type IndexTreeModelChange<T> = {
  readonly rerenderKeys: readonly string[];
  readonly splices: readonly IndexTreeModelSplice<T>[];
};

type MutableFlattenedTreeNode<T> = {
  depth: number;
  expandable: boolean;
  item: T;
  key: string;
};

type MutableIndexTreeNode<T> = {
  children: MutableIndexTreeNode<T>[];
  collapsed: boolean;
  depth: number;
  element: T;
  key: string;
};

const EMPTY_CHANGE: IndexTreeModelChange<never> = {
  rerenderKeys: [],
  splices: [],
};

export class IndexTreeModel<T> {
  private collapsedKeys: Set<string>;
  private nodes: MutableIndexTreeNode<T>[] = [];
  private nodesByKey = new Map<string, MutableIndexTreeNode<T>>();
  private visibleEntries: MutableFlattenedTreeNode<T>[] = [];
  private visibleEntrySignatures = new Map<string, string>();

  constructor(
    elements: readonly IndexTreeElement<T>[],
    collapsedKeys: readonly string[] = [],
  ) {
    this.collapsedKeys = new Set(collapsedKeys);
    this.rebuild(elements);
  }

  update(
    elements: readonly IndexTreeElement<T>[],
    collapsedKeys: readonly string[] = this.getCollapsedKeys(),
  ): IndexTreeModelChange<T> {
    const previousEntries = this.visibleEntries.slice();
    const previousItemsByKey = this.createVisibleItemsByKey(previousEntries);
    const previousSignatures = this.visibleEntrySignatures;

    this.collapsedKeys = new Set(collapsedKeys);
    this.rebuild(elements);

    return this.createChange(
      previousEntries,
      previousItemsByKey,
      previousSignatures,
    );
  }

  updateCollapsedKeys(
    collapsedKeys: readonly string[],
  ): IndexTreeModelChange<T> {
    const previousEntries = this.visibleEntries.slice();
    const previousItemsByKey = this.createVisibleItemsByKey(previousEntries);
    const previousSignatures = this.visibleEntrySignatures;

    this.collapsedKeys = new Set(collapsedKeys);
    this.rebuildFromNodes();

    return this.createChange(
      previousEntries,
      previousItemsByKey,
      previousSignatures,
    );
  }

  getCollapsedKeys(): string[] {
    return [...this.collapsedKeys];
  }

  setCollapsed(key: string, collapsed: boolean): IndexTreeModelChange<T> {
    if (this.collapsedKeys.has(key) === collapsed) {
      return EMPTY_CHANGE;
    }

    const previousEntries = this.visibleEntries.slice();
    const previousItemsByKey = this.createVisibleItemsByKey(previousEntries);
    const previousSignatures = this.visibleEntrySignatures;

    if (collapsed) {
      this.collapsedKeys.add(key);
    } else {
      this.collapsedKeys.delete(key);
    }

    this.rebuildFromNodes();

    return this.createChange(
      previousEntries,
      previousItemsByKey,
      previousSignatures,
    );
  }

  isCollapsed(key: string): boolean {
    return this.collapsedKeys.has(key);
  }

  getNode(key: string): IndexTreeModelNode<T> | null {
    const node = this.nodesByKey.get(key);
    return node ? this.toPublicNode(node) : null;
  }

  flatten(): FlattenedTreeNode<T>[] {
    return this.visibleEntries;
  }

  getTreeNode(entry: FlattenedTreeNode<T>): ITreeNode<T> {
    const node = this.nodesByKey.get(entry.key);
    if (!node) {
      throw new RangeError(`Unknown tree node key: ${entry.key}`);
    }

    return {
      children: node.children.map(child => child.element),
      collapsible: node.children.length > 0,
      collapsed: node.children.length > 0 && this.collapsedKeys.has(node.key),
      depth: node.depth,
      element: node.element,
    };
  }

  getKey(location: readonly number[]): string | null {
    return this.getNodeByLocation(location)?.key ?? null;
  }

  splice(
    location: readonly number[],
    deleteCount: number,
    toInsert: readonly IndexTreeElement<T>[] = [],
  ): IndexTreeModelChange<T> {
    if (location.length === 0) {
      throw new RangeError("Invalid tree location");
    }
    const start = location[location.length - 1];
    if (!Number.isInteger(start) || start < 0) {
      throw new RangeError(`Invalid tree location index: ${start}`);
    }
    if (!Number.isInteger(deleteCount) || deleteCount < 0) {
      throw new RangeError(`Invalid tree delete count: ${deleteCount}`);
    }

    const parentLocation = location.slice(0, -1);
    const parentNode = this.getNodeByLocation(parentLocation);
    if (parentLocation.length > 0 && !parentNode) {
      throw new RangeError(`Invalid tree parent location: ${parentLocation.join("/")}`);
    }
    const children = parentNode ? parentNode.children : this.nodes;
    if (start > children.length) {
      throw new RangeError(`Invalid tree splice start index: ${start}`);
    }

    const previousEntries = this.visibleEntries.slice();
    const previousItemsByKey = this.createVisibleItemsByKey(previousEntries);
    const previousSignatures = this.visibleEntrySignatures;
    const deletedNodes = children.splice(start, deleteCount);
    for (const deletedNode of deletedNodes) {
      this.deleteNodeKeys(deletedNode);
    }
    const depth = parentNode ? parentNode.depth + 1 : 0;
    const insertedNodes = this.createNodes(toInsert, depth);
    children.splice(start, 0, ...insertedNodes);

    this.rebuildFromNodes();

    return this.createChange(
      previousEntries,
      previousItemsByKey,
      previousSignatures,
    );
  }

  private rebuild(elements: readonly IndexTreeElement<T>[]): void {
    const previousEntriesByKey = this.createPreviousEntriesByKey();
    this.nodesByKey = new Map();
    this.nodes = this.createNodes(elements, 0);
    this.visibleEntries = this.createVisibleEntries(previousEntriesByKey);
    this.visibleEntrySignatures = this.createVisibleEntrySignatures();
  }

  private rebuildFromNodes(): void {
    const previousEntriesByKey = this.createPreviousEntriesByKey();
    this.visibleEntries = this.createVisibleEntries(previousEntriesByKey);
    this.visibleEntrySignatures = this.createVisibleEntrySignatures();
  }

  private createNodes(
    elements: readonly IndexTreeElement<T>[],
    depth: number,
  ): MutableIndexTreeNode<T>[] {
    const nodes: MutableIndexTreeNode<T>[] = [];

    for (const element of elements) {
      const node: MutableIndexTreeNode<T> = {
        children: [],
        collapsed: this.collapsedKeys.has(element.key),
        depth,
        element: element.element,
        key: element.key,
      };
      this.nodesByKey.set(node.key, node);
      node.children = this.createNodes(element.children ?? [], depth + 1);
      nodes.push(node);
    }

    return nodes;
  }

  private deleteNodeKeys(node: MutableIndexTreeNode<T>): void {
    this.nodesByKey.delete(node.key);
    for (const child of node.children) {
      this.deleteNodeKeys(child);
    }
  }

  private getNodeByLocation(
    location: readonly number[],
  ): MutableIndexTreeNode<T> | null {
    let children = this.nodes;
    let node: MutableIndexTreeNode<T> | undefined;

    for (const index of location) {
      if (!Number.isInteger(index) || index < 0 || index >= children.length) {
        return null;
      }
      node = children[index];
      children = node.children;
    }

    return node ?? null;
  }

  private createVisibleEntries(
    previousEntriesByKey: ReadonlyMap<string, MutableFlattenedTreeNode<T>>,
  ): MutableFlattenedTreeNode<T>[] {
    const entries: MutableFlattenedTreeNode<T>[] = [];

    const visit = (node: MutableIndexTreeNode<T>): void => {
      const entry = previousEntriesByKey.get(node.key) ?? {
        depth: node.depth,
        expandable: node.children.length > 0,
        item: node.element,
        key: node.key,
      };
      entry.depth = node.depth;
      entry.expandable = node.children.length > 0;
      entry.item = node.element;
      entries.push(entry);

      if (entry.expandable && this.collapsedKeys.has(node.key)) {
        return;
      }

      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of this.nodes) {
      visit(node);
    }

    return entries;
  }

  private createPreviousEntriesByKey(): Map<string, MutableFlattenedTreeNode<T>> {
    const result = new Map<string, MutableFlattenedTreeNode<T>>();
    for (const entry of this.visibleEntries) {
      result.set(entry.key, entry);
    }
    return result;
  }

  private createVisibleItemsByKey(
    entries: readonly FlattenedTreeNode<T>[],
  ): Map<string, T> {
    const result = new Map<string, T>();
    for (const entry of entries) {
      result.set(entry.key, entry.item);
    }
    return result;
  }

  private createVisibleEntrySignatures(): Map<string, string> {
    const signatures = new Map<string, string>();
    for (const entry of this.visibleEntries) {
      signatures.set(entry.key, this.createVisibleEntrySignature(entry));
    }
    return signatures;
  }

  private createVisibleEntrySignature(entry: FlattenedTreeNode<T>): string {
    const node = this.nodesByKey.get(entry.key);
    if (!node) {
      return "";
    }

    return [
      node.depth,
      node.children.length > 0 ? 1 : 0,
      node.children.length > 0 && this.collapsedKeys.has(node.key) ? 1 : 0,
      ...node.children.map(child => child.key),
    ].join("\u0000");
  }

  private createChange(
    previousEntries: readonly FlattenedTreeNode<T>[],
    previousItemsByKey: ReadonlyMap<string, T>,
    previousSignatures: ReadonlyMap<string, string>,
  ): IndexTreeModelChange<T> {
    const splices = createVisibleSplices(previousEntries, this.visibleEntries);
    const rerenderKeys = this.createRerenderKeys(
      previousItemsByKey,
      previousSignatures,
    );

    return {
      rerenderKeys,
      splices,
    };
  }

  private createRerenderKeys(
    previousItemsByKey: ReadonlyMap<string, T>,
    previousSignatures: ReadonlyMap<string, string>,
  ): string[] {
    const rerenderKeys: string[] = [];

    for (const entry of this.visibleEntries) {
      if (!previousItemsByKey.has(entry.key)) {
        continue;
      }

      if (
        previousItemsByKey.get(entry.key) !== entry.item ||
        previousSignatures.get(entry.key) !== this.visibleEntrySignatures.get(entry.key)
      ) {
        rerenderKeys.push(entry.key);
      }
    }

    return rerenderKeys;
  }

  private toPublicNode(node: MutableIndexTreeNode<T>): IndexTreeModelNode<T> {
    return {
      children: node.children.map(child => this.toPublicNode(child)),
      collapsed: this.collapsedKeys.has(node.key),
      depth: node.depth,
      element: node.element,
      expandable: node.children.length > 0,
      key: node.key,
    };
  }
}

function createVisibleSplices<T>(
  previousEntries: readonly FlattenedTreeNode<T>[],
  nextEntries: readonly FlattenedTreeNode<T>[],
): IndexTreeModelSplice<T>[] {
  if (!previousEntries.length && !nextEntries.length) {
    return [];
  }

  const previousIndexesByKey = new Map<string, number>();
  for (let index = 0; index < previousEntries.length; index += 1) {
    previousIndexesByKey.set(previousEntries[index].key, index);
  }

  const nextPreviousIndexes = nextEntries.map(entry =>
    previousIndexesByKey.get(entry.key) ?? -1);
  const retainedNextIndexes = createLongestIncreasingSubsequenceIndexes(
    nextPreviousIndexes,
  );
  const anchors = retainedNextIndexes.map(nextIndex => ({
    nextIndex,
    previousIndex: nextPreviousIndexes[nextIndex],
  }));

  const splices: IndexTreeModelSplice<T>[] = [];
  let previousAnchorIndex = -1;
  let nextAnchorIndex = -1;

  for (const anchor of [
    ...anchors,
    { nextIndex: nextEntries.length, previousIndex: previousEntries.length },
  ]) {
    const deleteStart = previousAnchorIndex + 1;
    const deleteEnd = anchor.previousIndex;
    const insertStart = nextAnchorIndex + 1;
    const insertEnd = anchor.nextIndex;
    const deleteCount = deleteEnd - deleteStart;
    const elements = nextEntries.slice(insertStart, insertEnd);

    if (deleteCount > 0 || elements.length > 0) {
      splices.push({
        deleteCount,
        elements,
        start: deleteStart,
      });
    }

    previousAnchorIndex = anchor.previousIndex;
    nextAnchorIndex = anchor.nextIndex;
  }

  return splices;
}

function createLongestIncreasingSubsequenceIndexes(
  values: readonly number[],
): number[] {
  const predecessors = new Array<number>(values.length).fill(-1);
  const tails: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value < 0) {
      continue;
    }

    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (values[tails[middle]] < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    if (low > 0) {
      predecessors[index] = tails[low - 1];
    }
    tails[low] = index;
  }

  const result: number[] = [];
  let cursor = tails[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    result.push(cursor);
    cursor = predecessors[cursor];
  }

  return result.reverse();
}
