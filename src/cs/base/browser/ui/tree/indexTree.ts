/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  AbstractTree,
  type IAbstractTreeOptions,
} from "src/cs/base/browser/ui/tree/abstractTree";
import {
  IndexTreeModel,
  type IndexTreeElement,
} from "src/cs/base/browser/ui/tree/indexTreeModel";

export type IIndexTreeOptions<T, TTemplateData = HTMLElement> =
  IAbstractTreeOptions<T, TTemplateData> & {
    readonly collapsedKeys?: readonly string[];
    readonly items?: readonly IndexTreeElement<T>[];
  };

export type IIndexTreeOptionsUpdate<T, TTemplateData = HTMLElement> =
  Partial<Omit<IIndexTreeOptions<T, TTemplateData>, "items">>;

export class IndexTree<T, TTemplateData = HTMLElement> extends AbstractTree<
  T,
  TTemplateData,
  IIndexTreeOptions<T, TTemplateData>,
  IndexTreeModel<T>
> {
  constructor(host: HTMLElement, options: IIndexTreeOptions<T, TTemplateData>) {
    super(
      host,
      new IndexTreeModel(options.items ?? [], options.collapsedKeys),
      options,
    );
  }

  splice(
    location: readonly number[],
    deleteCount: number,
    toInsert: readonly IndexTreeElement<T>[] = [],
  ): void {
    this.applyModelChange(this.model.splice(location, deleteCount, toInsert));
  }

  rerender(location?: readonly number[]): void {
    if (typeof location === "undefined") {
      this.rerenderByKeys(this.getFlattenedItems().map(entry => entry.key));
      return;
    }

    const key = this.model.getKey(location);
    if (key) {
      this.rerenderByKey(key);
    }
  }

  update(options: IIndexTreeOptions<T, TTemplateData>): void {
    this.options = options;
    this.applyModelChange(this.model.update(
      options.items ?? [],
      options.collapsedKeys,
    ));
    this.updateTreeOptions(options);
  }

  updateOptions(options: IIndexTreeOptionsUpdate<T, TTemplateData>): void {
    const nextOptions = { ...this.options, ...options };
    this.options = nextOptions;
    if ("collapsedKeys" in options) {
      this.applyModelChange(this.model.updateCollapsedKeys(
        nextOptions.collapsedKeys ?? [],
      ));
    }
    this.updateTreeOptions(nextOptions);
  }
}

export type { IndexTreeElement };

export default IndexTree;
