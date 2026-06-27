/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

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
