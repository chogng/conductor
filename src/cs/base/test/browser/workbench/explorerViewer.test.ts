/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
  IContextMenuService,
  IContextViewDelegate,
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";
import { ResourceLabels } from "src/cs/workbench/browser/labels";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";

suite("workbench/contrib/files/browser/explorerViewer", () => {
  test("opens file item hover in the global context view layer", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
    }, labels);

    try {
      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);

      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      assert.equal(contextViewService.container, undefined);
      assert.ok(contextViewService.delegate);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });
});

class TestContextViewService implements IContextViewService {
  public declare readonly _serviceBrand: undefined;
  public container: HTMLElement | undefined;
  public delegate: IContextViewDelegate | undefined;

  public showContextView(
    delegate: IContextViewDelegate,
    container?: HTMLElement,
  ): IOpenContextView {
    this.delegate = delegate;
    this.container = container;
    const contextView = document.createElement("div");
    const disposable = delegate.render(contextView);
    return {
      close: () => {
        disposable?.dispose();
        delegate.onHide?.();
      },
    };
  }

  public hideContextView(): void {
    this.delegate = undefined;
    this.container = undefined;
  }

  public getContextViewElement(): HTMLElement {
    return document.createElement("div");
  }

  public layout(): void {}
}

const createViewerProps = (): ExplorerViewerProps => ({
  commandService: {
    executeCommand: async () => undefined,
  },
  contextMenuService: {
    showContextMenu: () => undefined,
  } as unknown as IContextMenuService,
  contextViewService: new TestContextViewService(),
  files: [{
    curveType: "IV",
    curveTypeBadgeLabel: "iv",
    curveTypeConfidence: "high",
    curveTypeReasons: ["matched voltage/current columns"],
    fileId: "file-a",
    fileName: "A.csv",
    itemKey: "file-a",
  }],
  mode: "table",
  onListScroll: () => undefined,
  onOpenFileDialog: () => undefined,
  onRemoveFolder: () => undefined,
  onSelectFile: () => undefined,
  thumbnailService: {} as ExplorerViewerProps["thumbnailService"],
});
