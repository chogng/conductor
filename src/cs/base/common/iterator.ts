function isIterable<T = unknown>(value: unknown): value is Iterable<T> {
  return typeof value === "object"
    && value !== null
    && typeof (value as Iterable<T>)[Symbol.iterator] === "function";
}

export namespace Iterable {
  const emptyIterable: Iterable<never> = Object.freeze([]);

  export function is<T = unknown>(value: unknown): value is Iterable<T> {
    return isIterable(value);
  }

  export function empty<T = never>(): readonly never[] {
    return emptyIterable as readonly never[];
  }

  export function* single<T>(element: T): Iterable<T> {
    yield element;
  }

  export function wrap<T>(iterableOrElement: Iterable<T> | T): Iterable<T> {
    if (is(iterableOrElement)) {
      return iterableOrElement;
    }

    return single(iterableOrElement);
  }

  export function from<T>(iterable: Iterable<T> | undefined | null): Iterable<T> {
    return iterable ?? (emptyIterable as Iterable<T>);
  }

  export function* reverse<T>(array: ReadonlyArray<T>): Iterable<T> {
    for (let index = array.length - 1; index >= 0; index--) {
      yield array[index];
    }
  }

  export function isEmpty<T>(iterable: Iterable<T> | undefined | null): boolean {
    return !iterable || iterable[Symbol.iterator]().next().done === true;
  }

  export function first<T>(iterable: Iterable<T>): T | undefined {
    return iterable[Symbol.iterator]().next().value;
  }

  export function some<T>(iterable: Iterable<T>, predicate: (item: T, index: number) => unknown): boolean {
    let index = 0;
    for (const item of iterable) {
      if (predicate(item, index++)) {
        return true;
      }
    }

    return false;
  }

  export function every<T>(iterable: Iterable<T>, predicate: (item: T, index: number) => unknown): boolean {
    let index = 0;
    for (const item of iterable) {
      if (!predicate(item, index++)) {
        return false;
      }
    }

    return true;
  }

  export function find<T, R extends T>(iterable: Iterable<T>, predicate: (item: T) => item is R): R | undefined;
  export function find<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T | undefined;
  export function find<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T | undefined {
    for (const item of iterable) {
      if (predicate(item)) {
        return item;
      }
    }

    return undefined;
  }

  export function filter<T, R extends T>(iterable: Iterable<T>, predicate: (item: T) => item is R): Iterable<R>;
  export function filter<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): Iterable<T>;
  export function* filter<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): Iterable<T> {
    for (const item of iterable) {
      if (predicate(item)) {
        yield item;
      }
    }
  }

  export function* map<T, R>(iterable: Iterable<T>, fn: (item: T, index: number) => R): Iterable<R> {
    let index = 0;
    for (const item of iterable) {
      yield fn(item, index++);
    }
  }

  export function* flatMap<T, R>(iterable: Iterable<T>, fn: (item: T, index: number) => Iterable<R>): Iterable<R> {
    let index = 0;
    for (const item of iterable) {
      yield* fn(item, index++);
    }
  }

  export function* concat<T>(...iterables: (Iterable<T> | T)[]): Iterable<T> {
    for (const item of iterables) {
      if (isIterable(item)) {
        yield* item;
      } else {
        yield item;
      }
    }
  }

  export function reduce<T, R>(
    iterable: Iterable<T>,
    reducer: (previousValue: R, currentValue: T) => R,
    initialValue: R,
  ): R {
    let value = initialValue;
    for (const item of iterable) {
      value = reducer(value, item);
    }

    return value;
  }

  export function length<T>(iterable: Iterable<T>): number {
    let count = 0;
    for (const _ of iterable) {
      count++;
    }

    return count;
  }

  export function* slice<T>(array: ReadonlyArray<T>, from: number, to = array.length): Iterable<T> {
    let start = from;
    let end = to;

    if (start < -array.length) {
      start = 0;
    }
    if (start < 0) {
      start += array.length;
    }

    if (end < 0) {
      end += array.length;
    } else if (end > array.length) {
      end = array.length;
    }

    for (; start < end; start++) {
      yield array[start];
    }
  }

  export function consume<T>(iterable: Iterable<T>, atMost = Number.POSITIVE_INFINITY): [T[], Iterable<T>] {
    const consumed: T[] = [];

    if (atMost === 0) {
      return [consumed, iterable];
    }

    const iterator = iterable[Symbol.iterator]();
    for (let index = 0; index < atMost; index++) {
      const next = iterator.next();
      if (next.done) {
        return [consumed, empty()];
      }

      consumed.push(next.value);
    }

    return [consumed, { [Symbol.iterator]: () => iterator }];
  }

  export async function asyncToArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = [];
    for await (const item of iterable) {
      result.push(item);
    }

    return result;
  }

  export async function asyncToArrayFlat<T>(iterable: AsyncIterable<T[]>): Promise<T[]> {
    let result: T[] = [];
    for await (const item of iterable) {
      result = result.concat(item);
    }

    return result;
  }
}
