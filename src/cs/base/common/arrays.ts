/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from './cancellation.js';
import { CancellationError } from './errors.js';
import type { ISplice } from './sequence.js';

export function equals<T>(
  first: readonly T[] | undefined,
  second: readonly T[] | undefined,
  itemEquals: (first: T, second: T) => boolean = (left, right) => left === right,
): boolean {
  if (first === second) {
    return true;
  }

  if (!first || !second || first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (!itemEquals(first[index], second[index])) {
      return false;
    }
  }

  return true;
}

export function distinct<T>(
  values: readonly T[],
  keyFn: (value: T) => unknown = value => value,
): T[] {
  const seen = new Set<unknown>();
  const result: T[] = [];

  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

export function mapFilter<T, R>(
  values: readonly T[],
  mapFn: (value: T, index: number) => R | undefined,
): R[] {
  const result: R[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const mapped = mapFn(values[index], index);
    if (mapped !== undefined) {
      result.push(mapped);
    }
  }

  return result;
}

export function range(to: number): number[];
export function range(from: number, to: number): number[];
export function range(arg: number, to?: number): number[] {
  const from = typeof to === 'number' ? arg : 0;
  const end = typeof to === 'number' ? to : arg;
  const result: number[] = [];

  if (from <= end) {
    for (let index = from; index < end; index += 1) {
      result.push(index);
    }
  } else {
    for (let index = from; index > end; index -= 1) {
      result.push(index);
    }
  }

  return result;
}

interface IMutableSplice<T> extends ISplice<T> {
  deleteCount: number;
  readonly toInsert: T[];
}

export function sortedDiff<T>(
  before: readonly T[],
  after: readonly T[],
  compare: (first: T, second: T) => number,
): ISplice<T>[] {
  const result: IMutableSplice<T>[] = [];

  const pushSplice = (start: number, deleteCount: number, toInsert: T[]): void => {
    if (deleteCount === 0 && toInsert.length === 0) {
      return;
    }

    const latest = result[result.length - 1];
    if (latest && latest.start + latest.deleteCount === start) {
      latest.deleteCount += deleteCount;
      latest.toInsert.push(...toInsert);
      return;
    }

    result.push({ start, deleteCount, toInsert });
  };

  let beforeIndex = 0;
  let afterIndex = 0;

  while (true) {
    if (beforeIndex === before.length) {
      pushSplice(beforeIndex, 0, after.slice(afterIndex));
      break;
    }

    if (afterIndex === after.length) {
      pushSplice(beforeIndex, before.length - beforeIndex, []);
      break;
    }

    const order = compare(before[beforeIndex], after[afterIndex]);
    if (order === 0) {
      beforeIndex += 1;
      afterIndex += 1;
    } else if (order < 0) {
      pushSplice(beforeIndex, 1, []);
      beforeIndex += 1;
    } else {
      pushSplice(beforeIndex, 0, [after[afterIndex]]);
      afterIndex += 1;
    }
  }

  return result;
}

export function delta<T>(
  before: readonly T[],
  after: readonly T[],
  compare: (first: T, second: T) => number,
): { readonly removed: T[]; readonly added: T[] } {
  const splices = sortedDiff(before, after, compare);
  const removed: T[] = [];
  const added: T[] = [];

  for (const splice of splices) {
    removed.push(...before.slice(splice.start, splice.start + splice.deleteCount));
    added.push(...splice.toInsert);
  }

  return { removed, added };
}

export function top<T>(
  values: readonly T[],
  compare: (first: T, second: T) => number,
  count: number,
): T[] {
  if (count === 0) {
    return [];
  }

  const result = values.slice(0, count).sort(compare);
  topStep(values, compare, result, count, values.length);
  return result;
}

export function topAsync<T>(
  values: readonly T[],
  compare: (first: T, second: T) => number,
  count: number,
  batch: number,
  token?: CancellationToken,
): Promise<T[]> {
  if (count === 0) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    (async () => {
      const length = values.length;
      const result = values.slice(0, count).sort(compare);

      for (
        let index = count, max = Math.min(count + batch, length);
        index < length;
        index = max, max = Math.min(max + batch, length)
      ) {
        if (index > count) {
          await new Promise(resolve => setTimeout(resolve));
        }

        if (token?.isCancellationRequested) {
          throw new CancellationError();
        }

        topStep(values, compare, result, index, max);
      }

      return result;
    })().then(resolve, reject);
  });
}

function topStep<T>(
  values: readonly T[],
  compare: (first: T, second: T) => number,
  result: T[],
  index: number,
  max: number,
): void {
  const count = result.length;
  for (; index < max; index += 1) {
    const value = values[index];
    if (compare(value, result[count - 1]) < 0) {
      result.pop();
      const insertIndex = findFirstIndex(result, candidate => compare(value, candidate) < 0);
      result.splice(insertIndex, 0, value);
    }
  }
}

function findFirstIndex<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (predicate(values[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}
