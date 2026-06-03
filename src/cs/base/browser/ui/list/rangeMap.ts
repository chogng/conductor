export type Range = {
  end: number;
  start: number;
};

export type RangeMapItem = {
  readonly size: number;
};

type RangedGroup = {
  range: Range;
  size: number;
};

const intersectRange = (first: Range, second: Range): Range => ({
  end: Math.min(first.end, second.end),
  start: Math.max(first.start, second.start),
});

const isEmptyRange = (range: Range): boolean => range.end <= range.start;

const shiftRange = (range: Range, offset: number): Range => ({
  end: range.end + offset,
  start: range.start + offset,
});

const groupIntersect = (
  range: Range,
  groups: RangedGroup[],
): RangedGroup[] => {
  const result: RangedGroup[] = [];

  for (const group of groups) {
    if (range.start >= group.range.end) {
      continue;
    }

    if (range.end < group.range.start) {
      break;
    }

    const intersection = intersectRange(range, group.range);
    if (!isEmptyRange(intersection)) {
      result.push({ range: intersection, size: group.size });
    }
  }

  return result;
};

const consolidateGroups = (groups: RangedGroup[]): RangedGroup[] => {
  const result: RangedGroup[] = [];
  let previous: RangedGroup | null = null;

  for (const group of groups) {
    if (previous && previous.size === group.size) {
      previous.range.end = group.range.end;
      continue;
    }

    previous = {
      range: { start: group.range.start, end: group.range.end },
      size: group.size,
    };
    result.push(previous);
  }

  return result;
};

export class RangeMap {
  private groups: RangedGroup[] = [];
  private totalSize = 0;

  get count(): number {
    const group = this.groups[this.groups.length - 1];
    return group?.range.end ?? 0;
  }

  get size(): number {
    return this.totalSize;
  }

  splice(index: number, deleteCount: number, items: RangeMapItem[] = []): void {
    const delta = items.length - deleteCount;
    const before = groupIntersect({ start: 0, end: index }, this.groups);
    const inserted = items.map<RangedGroup>((item, offset) => ({
      range: { start: index + offset, end: index + offset + 1 },
      size: item.size,
    }));
    const after = groupIntersect(
      { start: index + deleteCount, end: Number.POSITIVE_INFINITY },
      this.groups,
    ).map(group => ({
      range: shiftRange(group.range, delta),
      size: group.size,
    }));

    this.groups = consolidateGroups([...before, ...inserted, ...after]);
    this.totalSize = this.groups.reduce(
      (total, group) =>
        total + group.size * (group.range.end - group.range.start),
      0,
    );
  }

  indexAt(position: number): number {
    if (position < 0) {
      return -1;
    }

    let index = 0;
    let size = 0;

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

  indexAfter(position: number): number {
    return Math.min(this.indexAt(position) + 1, this.count);
  }

  positionAt(index: number): number {
    if (index < 0) {
      return -1;
    }

    let position = 0;
    let count = 0;

    for (const group of this.groups) {
      const groupCount = group.range.end - group.range.start;
      const nextCount = count + groupCount;
      if (index < nextCount) {
        return position + (index - count) * group.size;
      }

      position += groupCount * group.size;
      count = nextCount;
    }

    return -1;
  }
}
