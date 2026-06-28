import { CancellationTokenSource, type CancellationToken } from "src/cs/base/common/cancellation";
import { range } from "src/cs/base/common/arrays";
import { CancellationError } from "src/cs/base/common/errors";
import { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";

export interface IPager<T> {
  readonly firstPage: readonly T[];
  readonly pageSize: number;
  readonly total: number;
  getPage(pageIndex: number, cancellationToken: CancellationToken): Promise<readonly T[]>;
}

export interface IPagedModel<T> {
  readonly length: number;
  readonly onDidIncrementLength: Event<number>;
  get(index: number): T;
  isResolved(index: number): boolean;
  resolve(index: number, cancellationToken: CancellationToken): Promise<T>;
}

interface IPage<T> {
  elements: readonly T[];
  isResolved: boolean;
  promise: Promise<void> | null;
  promiseIndexes: Set<number>;
  cts: CancellationTokenSource | null;
}

const createPage = <T>(elements?: readonly T[]): IPage<T> => ({
  cts: null,
  elements: elements ?? [],
  isResolved: !!elements,
  promise: null,
  promiseIndexes: new Set<number>(),
});

export const singlePagePager = <T>(elements: readonly T[]): IPager<T> => ({
  firstPage: elements,
  getPage: () => Promise.resolve(elements),
  pageSize: Math.max(1, elements.length),
  total: elements.length,
});

export class PagedModel<T> implements IPagedModel<T> {
  public readonly onDidIncrementLength: Event<number> = Event.None as Event<number>;
  private readonly pager: IPager<T>;
  private readonly pages: IPage<T>[];

  public constructor(arg: IPager<T> | readonly T[]) {
    this.pager = isPager(arg) ? arg : singlePagePager(arg);

    const pageSize = Math.max(1, this.pager.pageSize);
    const totalPages = Math.ceil(this.pager.total / pageSize);
    this.pages = [
      createPage(this.pager.firstPage.slice()),
      ...range(Math.max(0, totalPages - 1)).map(() => createPage<T>()),
    ];
  }

  public get length(): number {
    return this.pager.total;
  }

  public isResolved(index: number): boolean {
    return this.getPagePosition(index).page.isResolved;
  }

  public get(index: number): T {
    const { page, indexInPage } = this.getPagePosition(index);
    return page.elements[indexInPage];
  }

  public resolve(index: number, cancellationToken: CancellationToken): Promise<T> {
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(new CancellationError());
    }

    const { page, pageIndex, indexInPage } = this.getPagePosition(index);

    if (page.isResolved) {
      return Promise.resolve(page.elements[indexInPage]);
    }

    if (!page.promise) {
      page.cts = new CancellationTokenSource();
      page.promise = this.pager.getPage(pageIndex, page.cts.token)
        .then(elements => {
          page.elements = elements;
          page.isResolved = true;
          page.promise = null;
          page.cts = null;
        }, error => {
          page.isResolved = false;
          page.promise = null;
          page.cts = null;
          return Promise.reject(error);
        });
    }

    let listener: IDisposable | undefined;
    listener = cancellationToken.onCancellationRequested(() => {
      listener?.dispose();

      if (!page.cts) {
        return;
      }

      page.promiseIndexes.delete(index);

      if (page.promiseIndexes.size === 0) {
        page.cts.cancel();
      }
    });

    page.promiseIndexes.add(index);

    return page.promise
      .then(() => page.elements[indexInPage])
      .finally(() => {
        page.promiseIndexes.delete(index);
        listener?.dispose();
      });
  }

  private getPagePosition(index: number): {
    readonly indexInPage: number;
    readonly page: IPage<T>;
    readonly pageIndex: number;
  } {
    if (index < 0 || index >= this.length) {
      throw new RangeError(`PagedModel index out of range: ${index}`);
    }

    const pageSize = Math.max(1, this.pager.pageSize);
    const pageIndex = Math.floor(index / pageSize);
    const page = this.pages[pageIndex];

    if (!page) {
      throw new RangeError(`PagedModel page out of range: ${pageIndex}`);
    }

    return {
      indexInPage: index % pageSize,
      page,
      pageIndex,
    };
  }
}

const isPager = <T>(arg: IPager<T> | readonly T[]): arg is IPager<T> =>
  !Array.isArray(arg);
