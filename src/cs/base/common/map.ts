/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "./uri.js";

interface ResourceMapKeyFn {
  (resource: URI): string;
}

class ResourceMapEntry<T> {
  public constructor(
    public readonly uri: URI,
    public readonly value: T,
  ) {}
}

function isResourceMapEntries<T>(
  arg: ResourceMap<T> | ResourceMapKeyFn | readonly (readonly [URI, T])[] | undefined,
): arg is readonly (readonly [URI, T])[] {
  return Array.isArray(arg);
}

export class ResourceMap<T> implements Map<URI, T> {
  private static readonly defaultToKey = (resource: URI): string => resource.toString();

  public readonly [Symbol.toStringTag] = "ResourceMap";

  private readonly map: Map<string, ResourceMapEntry<T>>;
  private readonly toKey: ResourceMapKeyFn;

  public constructor(toKey?: ResourceMapKeyFn);
  public constructor(other?: ResourceMap<T>, toKey?: ResourceMapKeyFn);
  public constructor(entries?: readonly (readonly [URI, T])[], toKey?: ResourceMapKeyFn);
  public constructor(
    arg?: ResourceMap<T> | ResourceMapKeyFn | readonly (readonly [URI, T])[],
    toKey?: ResourceMapKeyFn,
  ) {
    if (arg instanceof ResourceMap) {
      this.map = new Map(arg.map);
      this.toKey = toKey ?? ResourceMap.defaultToKey;
    } else if (isResourceMapEntries(arg)) {
      this.map = new Map();
      this.toKey = toKey ?? ResourceMap.defaultToKey;
      for (const [resource, value] of arg) {
        this.set(resource, value);
      }
    } else {
      this.map = new Map();
      this.toKey = arg ?? ResourceMap.defaultToKey;
    }
  }

  public set(resource: URI, value: T): this {
    this.map.set(this.toKey(resource), new ResourceMapEntry(resource, value));
    return this;
  }

  public get(resource: URI): T | undefined {
    return this.map.get(this.toKey(resource))?.value;
  }

  public has(resource: URI): boolean {
    return this.map.has(this.toKey(resource));
  }

  public get size(): number {
    return this.map.size;
  }

  public clear(): void {
    this.map.clear();
  }

  public delete(resource: URI): boolean {
    return this.map.delete(this.toKey(resource));
  }

  public forEach(callbackfn: (value: T, key: URI, map: Map<URI, T>) => void, thisArg?: unknown): void {
    for (const entry of this.map.values()) {
      callbackfn.call(thisArg, entry.value, entry.uri, this);
    }
  }

  public *values(): MapIterator<T> {
    for (const entry of this.map.values()) {
      yield entry.value;
    }
  }

  public *keys(): MapIterator<URI> {
    for (const entry of this.map.values()) {
      yield entry.uri;
    }
  }

  public *entries(): MapIterator<[URI, T]> {
    for (const entry of this.map.values()) {
      yield [entry.uri, entry.value];
    }
  }

  public *[Symbol.iterator](): MapIterator<[URI, T]> {
    yield* this.entries();
  }
}

export class ResourceSet implements Set<URI> {
  public readonly [Symbol.toStringTag] = "ResourceSet";

  private readonly resourceMap: ResourceMap<URI>;

  public constructor(toKey?: ResourceMapKeyFn);
  public constructor(entries: readonly URI[], toKey?: ResourceMapKeyFn);
  public constructor(entriesOrKey?: readonly URI[] | ResourceMapKeyFn, toKey?: ResourceMapKeyFn) {
    if (!entriesOrKey || typeof entriesOrKey === "function") {
      this.resourceMap = new ResourceMap(entriesOrKey);
    } else {
      this.resourceMap = new ResourceMap(toKey);
      entriesOrKey.forEach(this.add, this);
    }
  }

  public get size(): number {
    return this.resourceMap.size;
  }

  public add(value: URI): this {
    this.resourceMap.set(value, value);
    return this;
  }

  public clear(): void {
    this.resourceMap.clear();
  }

  public delete(value: URI): boolean {
    return this.resourceMap.delete(value);
  }

  public forEach(callbackfn: (value: URI, value2: URI, set: Set<URI>) => void, thisArg?: unknown): void {
    this.resourceMap.forEach((_value, key) => callbackfn.call(thisArg, key, key, this));
  }

  public has(value: URI): boolean {
    return this.resourceMap.has(value);
  }

  public entries(): SetIterator<[URI, URI]> {
    return this.resourceMap.entries() as unknown as SetIterator<[URI, URI]>;
  }

  public keys(): SetIterator<URI> {
    return this.resourceMap.keys() as unknown as SetIterator<URI>;
  }

  public values(): SetIterator<URI> {
    return this.resourceMap.keys() as unknown as SetIterator<URI>;
  }

  public [Symbol.iterator](): SetIterator<URI> {
    return this.keys();
  }
}

interface LinkedMapItem<K, V> {
  previous: LinkedMapItem<K, V> | undefined;
  next: LinkedMapItem<K, V> | undefined;
  key: K;
  value: V;
}

export const enum Touch {
  None = 0,
  AsOld = 1,
  AsNew = 2,
}

export class LinkedMap<K, V> implements Map<K, V> {
  public readonly [Symbol.toStringTag] = "LinkedMap";

  private readonly map = new Map<K, LinkedMapItem<K, V>>();
  private head: LinkedMapItem<K, V> | undefined;
  private tail: LinkedMapItem<K, V> | undefined;
  private mapSize = 0;
  private state = 0;

  public clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
    this.mapSize = 0;
    this.state++;
  }

  public isEmpty(): boolean {
    return !this.head && !this.tail;
  }

  public get size(): number {
    return this.mapSize;
  }

  public get first(): V | undefined {
    return this.head?.value;
  }

  public get last(): V | undefined {
    return this.tail?.value;
  }

  public has(key: K): boolean {
    return this.map.has(key);
  }

  public get(key: K, touch: Touch = Touch.None): V | undefined {
    const item = this.map.get(key);
    if (!item) {
      return undefined;
    }

    if (touch !== Touch.None) {
      this.touch(item, touch);
    }
    return item.value;
  }

  public set(key: K, value: V, touch: Touch = Touch.None): this {
    let item = this.map.get(key);
    if (item) {
      item.value = value;
      if (touch !== Touch.None) {
        this.touch(item, touch);
      }
    } else {
      item = { key, value, next: undefined, previous: undefined };
      if (touch === Touch.AsOld) {
        this.addItemFirst(item);
      } else {
        this.addItemLast(item);
      }
      this.map.set(key, item);
      this.mapSize++;
    }

    return this;
  }

  public delete(key: K): boolean {
    return this.remove(key) !== undefined;
  }

  public remove(key: K): V | undefined {
    const item = this.map.get(key);
    if (!item) {
      return undefined;
    }

    this.map.delete(key);
    this.removeItem(item);
    this.mapSize--;
    return item.value;
  }

  public shift(): V | undefined {
    if (!this.head && !this.tail) {
      return undefined;
    }
    if (!this.head || !this.tail) {
      throw new Error("Invalid list");
    }

    const item = this.head;
    this.map.delete(item.key);
    this.removeItem(item);
    this.mapSize--;
    return item.value;
  }

  public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    const state = this.state;
    let current = this.head;
    while (current) {
      callbackfn.call(thisArg, current.value, current.key, this);
      if (this.state !== state) {
        throw new Error("LinkedMap got modified during iteration.");
      }
      current = current.next;
    }
  }

  public keys(): MapIterator<K> {
    const map = this;
    const state = this.state;
    let current = this.head;
    const iterator: MapIterator<K> = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
        // no-op
      },
      next(): IteratorResult<K> {
        if (map.state !== state) {
          throw new Error("LinkedMap got modified during iteration.");
        }
        if (current) {
          const result = { value: current.key, done: false };
          current = current.next;
          return result;
        }

        return { value: undefined, done: true };
      },
    };
    return iterator;
  }

  public values(): MapIterator<V> {
    const map = this;
    const state = this.state;
    let current = this.head;
    const iterator: MapIterator<V> = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
        // no-op
      },
      next(): IteratorResult<V> {
        if (map.state !== state) {
          throw new Error("LinkedMap got modified during iteration.");
        }
        if (current) {
          const result = { value: current.value, done: false };
          current = current.next;
          return result;
        }

        return { value: undefined, done: true };
      },
    };
    return iterator;
  }

  public entries(): MapIterator<[K, V]> {
    const map = this;
    const state = this.state;
    let current = this.head;
    const iterator: MapIterator<[K, V]> = {
      [Symbol.iterator]() {
        return iterator;
      },
      [Symbol.dispose]() {
        // no-op
      },
      next(): IteratorResult<[K, V]> {
        if (map.state !== state) {
          throw new Error("LinkedMap got modified during iteration.");
        }
        if (current) {
          const result: IteratorResult<[K, V]> = { value: [current.key, current.value], done: false };
          current = current.next;
          return result;
        }

        return { value: undefined, done: true };
      },
    };
    return iterator;
  }

  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  protected trimOld(newSize: number): void {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }

    let current = this.head;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this.map.delete(current.key);
      current = current.next;
      currentSize--;
    }

    this.head = current;
    this.mapSize = currentSize;
    if (current) {
      current.previous = undefined;
    }
    this.state++;
  }

  protected trimNew(newSize: number): void {
    if (newSize >= this.size) {
      return;
    }
    if (newSize === 0) {
      this.clear();
      return;
    }

    let current = this.tail;
    let currentSize = this.size;
    while (current && currentSize > newSize) {
      this.map.delete(current.key);
      current = current.previous;
      currentSize--;
    }

    this.tail = current;
    this.mapSize = currentSize;
    if (current) {
      current.next = undefined;
    }
    this.state++;
  }

  private addItemFirst(item: LinkedMapItem<K, V>): void {
    if (!this.head && !this.tail) {
      this.tail = item;
    } else if (!this.head) {
      throw new Error("Invalid list");
    } else {
      item.next = this.head;
      this.head.previous = item;
    }

    this.head = item;
    this.state++;
  }

  private addItemLast(item: LinkedMapItem<K, V>): void {
    if (!this.head && !this.tail) {
      this.head = item;
    } else if (!this.tail) {
      throw new Error("Invalid list");
    } else {
      item.previous = this.tail;
      this.tail.next = item;
    }

    this.tail = item;
    this.state++;
  }

  private removeItem(item: LinkedMapItem<K, V>): void {
    if (item === this.head && item === this.tail) {
      this.head = undefined;
      this.tail = undefined;
    } else if (item === this.head) {
      if (!item.next) {
        throw new Error("Invalid list");
      }
      item.next.previous = undefined;
      this.head = item.next;
    } else if (item === this.tail) {
      if (!item.previous) {
        throw new Error("Invalid list");
      }
      item.previous.next = undefined;
      this.tail = item.previous;
    } else {
      const next = item.next;
      const previous = item.previous;
      if (!next || !previous) {
        throw new Error("Invalid list");
      }
      next.previous = previous;
      previous.next = next;
    }

    item.next = undefined;
    item.previous = undefined;
    this.state++;
  }

  private touch(item: LinkedMapItem<K, V>, touch: Touch): void {
    if (!this.head || !this.tail) {
      throw new Error("Invalid list");
    }
    if (touch !== Touch.AsOld && touch !== Touch.AsNew) {
      return;
    }

    if (touch === Touch.AsOld) {
      if (item === this.head) {
        return;
      }

      const next = item.next;
      const previous = item.previous;
      if (item === this.tail) {
        previous!.next = undefined;
        this.tail = previous;
      } else {
        next!.previous = previous;
        previous!.next = next;
      }

      item.previous = undefined;
      item.next = this.head;
      this.head.previous = item;
      this.head = item;
      this.state++;
    } else {
      if (item === this.tail) {
        return;
      }

      const next = item.next;
      const previous = item.previous;
      if (item === this.head) {
        next!.previous = undefined;
        this.head = next;
      } else {
        next!.previous = previous;
        previous!.next = next;
      }

      item.next = undefined;
      item.previous = this.tail;
      this.tail.next = item;
      this.tail = item;
      this.state++;
    }
  }
}

abstract class MapCache<K, V> extends LinkedMap<K, V> {
  protected cacheLimit: number;
  protected cacheRatio: number;

  public constructor(limit: number, ratio = 1) {
    super();
    this.cacheLimit = limit;
    this.cacheRatio = Math.min(Math.max(0, ratio), 1);
  }

  public get limit(): number {
    return this.cacheLimit;
  }

  public set limit(limit: number) {
    this.cacheLimit = limit;
    this.checkTrim();
  }

  public get ratio(): number {
    return this.cacheRatio;
  }

  public set ratio(ratio: number) {
    this.cacheRatio = Math.min(Math.max(0, ratio), 1);
    this.checkTrim();
  }

  public override get(key: K, touch: Touch = Touch.AsNew): V | undefined {
    return super.get(key, touch);
  }

  public peek(key: K): V | undefined {
    return super.get(key, Touch.None);
  }

  public override set(key: K, value: V): this {
    super.set(key, value, Touch.AsNew);
    return this;
  }

  protected checkTrim(): void {
    if (this.size > this.cacheLimit) {
      this.trim(Math.round(this.cacheLimit * this.cacheRatio));
    }
  }

  protected abstract trim(newSize: number): void;
}

export class LRUCache<K, V> extends MapCache<K, V> {
  protected trim(newSize: number): void {
    this.trimOld(newSize);
  }

  public override set(key: K, value: V): this {
    super.set(key, value);
    this.checkTrim();
    return this;
  }
}

export class MRUCache<K, V> extends MapCache<K, V> {
  protected trim(newSize: number): void {
    this.trimNew(newSize);
  }

  public override set(key: K, value: V): this {
    if (this.cacheLimit <= this.size && !this.has(key)) {
      this.trim(Math.round(this.cacheLimit * this.cacheRatio) - 1);
    }

    super.set(key, value);
    return this;
  }
}
