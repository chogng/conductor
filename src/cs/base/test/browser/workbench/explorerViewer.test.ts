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
import type { IDisposable } from "src/cs/base/common/lifecycle";
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

  test("hides file item hover after leaving the row for the hover layer", async () => {
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

      const hoverLayer = contextViewService.renderedElement;
      assert.ok(hoverLayer);
      assert.ok(contextViewService.delegate);

      item.dispatchEvent(new MouseEvent("mouseout", {
        bubbles: true,
        relatedTarget: hoverLayer,
      }));

      await timeout(150);

      assert.equal(contextViewService.delegate, undefined);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("suppresses file item hover while folder actions are open", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      expandedFolderKeys: ["folder:Folder"],
      files: [{
        curveType: "unknown",
        curveTypeBadgeLabel: "unknown",
        curveTypeConfidence: "low",
        curveTypeReasons: ["No reliable transfer/output metadata was found."],
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        relativePath: "Folder/A.csv",
      }],
    }, labels);

    try {
      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);
      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));
      assert.ok(contextViewService.delegate);

      const folderActions = host.querySelector<HTMLElement>(".file-list-folder-more");
      assert.ok(folderActions);
      folderActions.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
      }));

      assert.equal(contextViewService.delegate, undefined);

      folderActions.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
      }));
      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: folderActions,
      }));

      assert.equal(contextViewService.delegate, undefined);
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
  public renderedElement: HTMLElement | undefined;
  private activeDisposable: IDisposable | undefined;

  public showContextView(
    delegate: IContextViewDelegate,
    container?: HTMLElement,
  ): IOpenContextView {
    this.delegate = delegate;
    this.container = container;
    const contextView = document.createElement("div");
    this.renderedElement = contextView;
    const disposable = delegate.render(contextView);
    this.activeDisposable = disposable ?? undefined;
    return {
      close: () => {
        if (this.delegate !== delegate) {
          return;
        }
        this.hideContextView();
      },
    };
  }

  public hideContextView(): void {
    const delegate = this.delegate;
    this.activeDisposable?.dispose();
    this.activeDisposable = undefined;
    this.delegate = undefined;
    this.container = undefined;
    this.renderedElement = undefined;
    delegate?.onHide?.();
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

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
