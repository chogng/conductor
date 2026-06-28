import type { ISpliceable } from "../../../common/sequence.js";

export interface ISpreadSpliceable<T> {
  splice(start: number, deleteCount: number, ...elements: T[]): void;
}

export class CombinedSpliceable<T> implements ISpliceable<T> {
  public constructor(private readonly spliceables: ISpliceable<T>[]) {}

  public splice(start: number, deleteCount: number, elements: readonly T[]): void {
    for (const spliceable of this.spliceables) {
      spliceable.splice(start, deleteCount, elements);
    }
  }
}
