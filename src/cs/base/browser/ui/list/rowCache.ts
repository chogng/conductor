import { type IDisposable } from "src/cs/base/common/lifecycle";
import type { IListRenderer } from "src/cs/base/browser/ui/list/list";

export interface IRow<TTemplateData = unknown> {
  domNode: HTMLDivElement;
  templateId: string;
  templateData: TTemplateData;
}

export class RowCache<T, TTemplateData = unknown> implements IDisposable {
  private readonly cache = new Map<string, IRow<TTemplateData>[]>();
  private readonly transactionNodesPendingRemoval = new Set<HTMLElement>();
  private inTransaction = false;

  constructor(private readonly renderers: Map<string, IListRenderer<T, TTemplateData>>) {}

  alloc(
    templateId: string,
  ): { row: IRow<TTemplateData>; isReusingConnectedDomNode: boolean } {
    const cache = this.getTemplateCache(templateId);
    let row = cache.pop();

    if (row) {
      const isReusingConnectedDomNode =
        this.transactionNodesPendingRemoval.delete(row.domNode);
      return {
        row,
        isReusingConnectedDomNode,
      };
    }

    const domNode = document.createElement("div");
    domNode.className = "ui-list__row";
    domNode.setAttribute("data-template-id", templateId);

    const renderer = this.getRenderer(templateId);
    const templateData = renderer.renderTemplate(domNode);
    row = { domNode, templateData, templateId };

    return {
      row,
      isReusingConnectedDomNode: false,
    };
  }

  release(row: IRow<TTemplateData>): void {
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
    for (const [templateId, rows] of this.cache) {
      const renderer = this.getRenderer(templateId);
      for (const row of rows) {
        renderer.disposeTemplate(row.templateData);
      }
    }

    this.cache.clear();
    this.transactionNodesPendingRemoval.clear();
  }

  private releaseRow(row: IRow<TTemplateData>): void {
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

  private getTemplateCache(templateId: string): IRow<TTemplateData>[] {
    let result = this.cache.get(templateId);
    if (!result) {
      result = [];
      this.cache.set(templateId, result);
    }

    return result;
  }

  private getRenderer(templateId: string): IListRenderer<T, TTemplateData> {
    const renderer = this.renderers.get(templateId);
    if (!renderer) {
      throw new Error(`No renderer found for ${templateId}`);
    }
    return renderer;
  }
}
