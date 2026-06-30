/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { AbstractTree } from "src/cs/base/browser/ui/tree/abstractTree";
import { ObjectTreeModel } from "src/cs/base/browser/ui/tree/objectTreeModel";
import type {
  IObjectTreeOptions,
  IObjectTreeOptionsUpdate,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderRangeEvent,
  ITreeRenderer,
  ITreeSelectionEvent,
} from "src/cs/base/browser/ui/tree/tree";

export class ObjectTree<T, TTemplateData = HTMLElement> extends AbstractTree<
  T,
  TTemplateData,
  IObjectTreeOptions<T, TTemplateData>,
  ObjectTreeModel<T>
> {
  constructor(host: HTMLElement, options: IObjectTreeOptions<T, TTemplateData>) {
    super(host, new ObjectTreeModel(options), options);
  }

  setChildren(items: T[]): void {
    this.options = { ...this.options, items };
    this.applyModelChange(this.model.update(this.options));
  }

  update(options: IObjectTreeOptions<T, TTemplateData>): void {
    this.options = options;
    this.applyModelChange(this.model.update(options));
    this.updateTreeOptions(options);
  }

  updateOptions(options: IObjectTreeOptionsUpdate<T, TTemplateData>): void {
    const shouldUpdateModel =
      "collapsedKeys" in options ||
      "getChildren" in options ||
      "getKey" in options;
    const nextOptions = { ...this.options, ...options };
    this.options = nextOptions;
    if (shouldUpdateModel) {
      this.applyModelChange(this.model.update(nextOptions));
    }
    this.updateTreeOptions(nextOptions);
  }
}

export type {
  IObjectTreeOptions,
  IObjectTreeOptionsUpdate,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderRangeEvent,
  ITreeRenderer,
  ITreeSelectionEvent,
};

export default ObjectTree;
