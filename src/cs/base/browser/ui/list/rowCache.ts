import { type IDisposable } from "src/cs/base/common/lifecycle";

export type RowCacheRow = {
  domNode: HTMLDivElement;
  mount: HTMLDivElement;
  templateId: string;
};

export class RowCache implements IDisposable {
  private readonly cache = new Map<string, RowCacheRow[]>();
  private readonly transactionNodesPendingRemoval = new Set<HTMLElement>();
  private inTransaction = false;

  constructor(private readonly createRow: (templateId: string) => RowCacheRow) {}

  alloc(
    templateId: string,
  ): { row: RowCacheRow; isReusingConnectedDomNode: boolean } {
    const cache = this.getTemplateCache(templateId);
    const row = cache.pop();

    if (row) {
      const isReusingConnectedDomNode =
        this.transactionNodesPendingRemoval.delete(row.domNode);
      return {
        row,
        isReusingConnectedDomNode,
      };
    }

    return {
      row: this.createRow(templateId),
      isReusingConnectedDomNode: false,
    };
  }

  release(row: RowCacheRow): void {
    if (!row) return;

    this.releaseRow(row);
  }

  transact(makeChanges: () => void): void {
    if (this.inTransaction) {
      throw new Error("Already in transaction");
    }

    this.inTransaction = true;

    try {
      makeChanges();
    } finally {
      for (const domNode of this.transactionNodesPendingRemoval) {
        this.doRemoveNode(domNode);
      }

      this.transactionNodesPendingRemoval.clear();
      this.inTransaction = false;
    }
  }

  dispose(): void {
    this.cache.clear();
    this.transactionNodesPendingRemoval.clear();
  }

  private releaseRow(row: RowCacheRow): void {
    const { domNode, templateId } = row;
    if (domNode) {
      if (this.inTransaction) {
        this.transactionNodesPendingRemoval.add(domNode);
      } else {
        this.doRemoveNode(domNode);
      }
    }

    this.getTemplateCache(templateId).push(row);
  }

  private doRemoveNode(domNode: HTMLElement): void {
    domNode.classList.remove("scrolling");
    domNode.remove();
  }

  private getTemplateCache(templateId: string): RowCacheRow[] {
    let result = this.cache.get(templateId);
    if (!result) {
      result = [];
      this.cache.set(templateId, result);
    }

    return result;
  }
}
