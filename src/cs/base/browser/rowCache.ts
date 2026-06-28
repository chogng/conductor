import { type IDisposable } from "src/cs/base/common/lifecycle";

export interface IRow<TTemplateData = unknown, TDomNode extends HTMLElement = HTMLElement> {
  domNode: TDomNode;
  templateId: string;
  templateData: TTemplateData;
}

export interface IRowCacheRenderer<TTemplateData = unknown, TDomNode extends HTMLElement = HTMLElement> {
  renderTemplate(container: TDomNode): TTemplateData;
  disposeTemplate(templateData: TTemplateData): void;
}

export interface IRowCacheOptions<TDomNode extends HTMLElement = HTMLElement> {
  createDomNode(templateId: string): TDomNode;
  removeDomNode(domNode: TDomNode): void;
}

// Browser-level DOM row pool shared by widgets that own different row shells
// (for example list div rows and virtual table tr rows). Callers own row
// structure, rendering, and semantics; this cache only allocates, releases, and
// disposes pooled DOM/template pairs.
export class RowCache<TTemplateData = unknown, TDomNode extends HTMLElement = HTMLElement> implements IDisposable {
  private readonly cache = new Map<string, IRow<TTemplateData, TDomNode>[]>();
  private readonly transactionNodesPendingRemoval = new Set<TDomNode>();
  private inTransaction = false;

  constructor(
    private readonly renderers: ReadonlyMap<string, IRowCacheRenderer<TTemplateData, TDomNode>>,
    private readonly options: IRowCacheOptions<TDomNode>,
  ) {}

  alloc(
    templateId: string,
  ): { row: IRow<TTemplateData, TDomNode>; isReusingConnectedDomNode: boolean } {
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

    const domNode = this.options.createDomNode(templateId);
    const renderer = this.getRenderer(templateId);
    const templateData = renderer.renderTemplate(domNode);
    row = { domNode, templateData, templateId };

    return {
      row,
      isReusingConnectedDomNode: false,
    };
  }

  release(row: IRow<TTemplateData, TDomNode>): void {
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

  private releaseRow(row: IRow<TTemplateData, TDomNode>): void {
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

  private doRemoveNode(domNode: TDomNode): void {
    this.options.removeDomNode(domNode);
  }

  private getTemplateCache(templateId: string): IRow<TTemplateData, TDomNode>[] {
    let result = this.cache.get(templateId);
    if (!result) {
      result = [];
      this.cache.set(templateId, result);
    }

    return result;
  }

  private getRenderer(templateId: string): IRowCacheRenderer<TTemplateData, TDomNode> {
    const renderer = this.renderers.get(templateId);
    if (!renderer) {
      throw new Error(`No renderer found for ${templateId}`);
    }
    return renderer;
  }
}
