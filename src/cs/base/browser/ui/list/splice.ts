export interface ISpliceable<T> {
  splice(start: number, deleteCount: number, elements: T[]): void;
}

export interface ISpreadSpliceable<T> {
  splice(start: number, deleteCount: number, ...elements: T[]): void;
}

export class CombinedSpliceable<T> implements ISpliceable<T> {
  constructor(private readonly spliceables: readonly ISpliceable<T>[]) {}

  splice(start: number, deleteCount: number, elements: T[]): void {
    for (const spliceable of this.spliceables) {
      spliceable.splice(start, deleteCount, elements);
    }
  }
}
