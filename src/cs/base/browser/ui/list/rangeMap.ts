import { type IRange, Range as BaseRange } from "src/cs/base/common/range";

export interface IItem {
  size: number;
}

export interface IRangedGroup {
  range: IRange;
  size: number;
}

/**
 * Returns the intersection between ranged groups and a range.
 */
export function groupIntersect(range: IRange, groups: IRangedGroup[]): IRangedGroup[] {
  const result: IRangedGroup[] = [];

  for (const group of groups) {
    if (range.start >= group.range.end) {
      continue;
    }

    if (range.end < group.range.start) {
      break;
    }

    const intersection = BaseRange.intersect(range, group.range);
    if (!BaseRange.isEmpty(intersection)) {
      result.push({ range: intersection, size: group.size });
    }
  }

  return result;
}

/**
 * Shifts a range by the given amount.
 */
export function shift({ start, end }: IRange, amount: number): IRange {
  return { start: start + amount, end: end + amount };
}

/**
 * Consolidates consecutive ranged groups that share the same item size.
 */
export function consolidate(groups: IRangedGroup[]): IRangedGroup[] {
  const result: IRangedGroup[] = [];
  let previousGroup: IRangedGroup | null = null;

  for (const group of groups) {
    const start = group.range.start;
    const end = group.range.end;
    const size = group.size;

    if (previousGroup && previousGroup.size === size) {
      previousGroup.range.end = end;
      continue;
    }

    previousGroup = { range: { start, end }, size };
    result.push(previousGroup);
  }

  return result;
}

function concat(...groups: IRangedGroup[][]): IRangedGroup[] {
  return consolidate(groups.reduce((result, group) => result.concat(group), []));
}

export interface IRangeMap {
  readonly count: number;
  readonly size: number;
  paddingTop: number;
  splice(index: number, deleteCount: number, items?: IItem[]): void;
  indexAt(position: number): number;
  indexAfter(position: number): number;
  positionAt(index: number): number;
}

export class RangeMap implements IRangeMap {
  private groups: IRangedGroup[] = [];
  private totalSize = 0;
  private topPadding = 0;

  public constructor(topPadding?: number) {
    this.topPadding = topPadding ?? 0;
    this.totalSize = this.topPadding;
  }

  public get paddingTop(): number {
    return this.topPadding;
  }

  public set paddingTop(paddingTop: number) {
    this.totalSize += paddingTop - this.topPadding;
    this.topPadding = paddingTop;
  }

  public get count(): number {
    const group = this.groups[this.groups.length - 1];
    return group?.range.end ?? 0;
  }

  public get size(): number {
    return this.totalSize;
  }

  public splice(index: number, deleteCount: number, items: IItem[] = []): void {
    const delta = items.length - deleteCount;
    const before = groupIntersect({ start: 0, end: index }, this.groups);
    const inserted = items.map<IRangedGroup>((item, offset) => ({
      range: { start: index + offset, end: index + offset + 1 },
      size: item.size,
    }));
    const after = groupIntersect(
      { start: index + deleteCount, end: Number.POSITIVE_INFINITY },
      this.groups,
    ).map<IRangedGroup>(group => ({
      range: shift(group.range, delta),
      size: group.size,
    }));

    this.groups = concat(before, inserted, after);
    this.totalSize = this.topPadding + this.groups.reduce(
      (total, group) =>
        total + group.size * (group.range.end - group.range.start),
      0,
    );
  }

  public indexAt(position: number): number {
    if (position < 0) {
      return -1;
    }

    if (position < this.topPadding) {
      return 0;
    }

    let index = 0;
    let size = this.topPadding;

    for (const group of this.groups) {
      const count = group.range.end - group.range.start;
      const nextSize = size + count * group.size;
      if (position < nextSize) {
        return index + Math.floor((position - size) / group.size);
      }

      index += count;
      size = nextSize;
    }

    return index;
  }

  public indexAfter(position: number): number {
    return Math.min(this.indexAt(position) + 1, this.count);
  }

  public positionAt(index: number): number {
    if (index < 0) {
      return -1;
    }

    let position = 0;
    let count = 0;

    for (const group of this.groups) {
      const groupCount = group.range.end - group.range.start;
      const nextCount = count + groupCount;
      if (index < nextCount) {
        return this.topPadding + position + (index - count) * group.size;
      }

      position += groupCount * group.size;
      count = nextCount;
    }

    return -1;
  }
}
