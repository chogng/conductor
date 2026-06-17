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
import { SubmenuAction, type IAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event } from "src/cs/base/common/event";
import { ObjectTree } from "src/cs/base/browser/ui/tree/objectTree";
import { ResourceLabels } from "src/cs/workbench/browser/labels";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";
import {
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import { AUTO_TEMPLATE_ID } from "src/cs/workbench/services/template/common/autoTemplate";
import { DEFAULT_EXPLORER_APPEARANCE } from "src/cs/workbench/services/appearance/common/appearance";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/browser/explorerViewer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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
        badgeState: {
          kind: "unknown",
          source: "assessment",
        },
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

  test("disables template file actions when only the auto template is available", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      templateRecords: [{
        id: AUTO_TEMPLATE_ID,
        name: "Auto extraction",
      }],
    }, labels);

    try {
      const actions = getFileContextActions(viewer, "file-a");
      const setTemplate = actions.find(action => action.id === SET_FILE_TEMPLATE_COMMAND_ID);
      const sliceTemplate = actions.find(action => action.id === SLICE_FILE_WITH_TEMPLATE_COMMAND_ID);

      assert.ok(setTemplate);
      assert.ok(sliceTemplate);
      assert.equal(setTemplate.enabled, false);
      assert.equal(sliceTemplate.enabled, false);
      assert.equal(setTemplate instanceof SubmenuAction, false);
      assert.equal(sliceTemplate instanceof SubmenuAction, false);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("creates template submenus without loading placeholders when user templates are available", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      templateRecords: [{
        id: "template-a",
        name: "Template A",
      }],
    }, labels);

    try {
      const actions = getFileContextActions(viewer, "file-a");
      const setTemplate = actions.find(action => action.id === SET_FILE_TEMPLATE_COMMAND_ID);
      const sliceTemplate = actions.find(action => action.id === SLICE_FILE_WITH_TEMPLATE_COMMAND_ID);

      assert.ok(setTemplate instanceof SubmenuAction);
      assert.ok(sliceTemplate instanceof SubmenuAction);
      assert.equal(setTemplate.enabled, true);
      assert.equal(sliceTemplate.enabled, true);
      assert.deepEqual(
        setTemplate.actions.map(action => action.label),
        ["Auto extraction", "Template A"],
      );
      assert.equal(setTemplate.actions.some(action => action.id.endsWith(".loading")), false);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("updates badge presentation without rebuilding tree children", () => {
    const originalSetChildren = ObjectTree.prototype.setChildren;
    const originalRerenderByKeys = ObjectTree.prototype.rerenderByKeys;
    let setChildrenCount = 0;
    const rerenderedKeys: string[][] = [];

    ObjectTree.prototype.setChildren = function (
      this: ObjectTree<unknown, unknown>,
      items: unknown[],
    ): void {
      setChildrenCount += 1;
      originalSetChildren.call(this, items);
    } as typeof ObjectTree.prototype.setChildren;
    ObjectTree.prototype.rerenderByKeys = function (
      this: ObjectTree<unknown, unknown>,
      keys: readonly string[],
    ): void {
      rerenderedKeys.push([...keys]);
      originalRerenderByKeys.call(this, keys);
    } as typeof ObjectTree.prototype.rerenderByKeys;

    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const initialFile: ExplorerViewerProps["files"][number] = {
      badgeState: {
        kind: "pending",
      },
      fileId: "file-a",
      fileName: "A.csv",
      itemKey: "file-a",
    };
    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      files: [initialFile],
    };
    const viewer = new ExplorerViewer(host, hoverHost, props, labels);

    try {
      const badge = host.querySelector<HTMLElement>(".file-list-item-assessment");
      assert.ok(badge);
      assert.equal(badge.textContent, "...");

      viewer.setProps({
        ...props,
        files: [{
          ...initialFile,
          badgeState: {
            confidence: "tentative",
            kind: "ready",
            label: "cv",
            source: "fast",
          },
        }],
      });

      assert.equal(setChildrenCount, 0);
      assert.deepEqual(rerenderedKeys, [["file-a"]]);
      assert.equal(badge.textContent, "cv");
      assert.equal(badge.dataset.color, "purple");

      viewer.setProps({
        ...props,
        explorerAppearance: {
          ...DEFAULT_EXPLORER_APPEARANCE,
          badgeColors: {
            ...DEFAULT_EXPLORER_APPEARANCE.badgeColors,
            cv: "green",
          },
        },
        files: [{
          ...initialFile,
          badgeState: {
            confidence: "tentative",
            kind: "ready",
            label: "cv",
            source: "fast",
          },
        }],
      });

      assert.deepEqual(rerenderedKeys, [["file-a"], ["file-a"]]);
      assert.equal(badge.dataset.color, "green");
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
      ObjectTree.prototype.setChildren = originalSetChildren;
      ObjectTree.prototype.rerenderByKeys = originalRerenderByKeys;
    }
  });

  test("rerenders thumbnail grid when preview state changes", async () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const previewEmitter = new Emitter<{ readonly fileId: string }>();
    let modelReady = false;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      mode: "chart",
      thumbnailPreviewService: {
        get: () => ({ kind: "idle" }),
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: () => modelReady
          ? {
              kind: "ready",
              model: createThumbnailPlotModel("file-a"),
              signature: "plot:file-a",
            }
          : { kind: "loading" },
      },
      thumbnailService: {
        clear: () => undefined,
        drawPlotThumbnail: () => undefined,
      },
      viewLayout: "thumbnail",
    };
    const viewer = new ExplorerViewer(host, hoverHost, props, labels);

    try {
      viewer.setProps(props);
      assert.equal(host.querySelector(".thumbnail_view_chart_canvas"), null);
      assert.ok(host.querySelector(".thumbnail_view_chart_loading"));

      modelReady = true;
      previewEmitter.fire({ fileId: "file-a" });
      await animationFrames(1);

      assert.ok(host.querySelector(".thumbnail_view_chart_canvas"));
      assert.equal(host.querySelector(".thumbnail_view_chart_loading"), null);
    } finally {
      viewer.dispose();
      previewEmitter.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });
});

const getFileContextActions = (
  viewer: ExplorerViewer,
  fileId: string,
): IAction[] =>
  (viewer as unknown as {
    createFileContextActions(fileId: string): IAction[];
  }).createFileContextActions(fileId);

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
    badgeState: {
      confidence: "confirmed",
      kind: "ready",
      label: "mixed",
      source: "assessment",
    },
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
  thumbnailPreviewService: {
    onDidChangePreview: Event.None,
    get: () => ({ kind: "idle" }),
    invalidate: () => undefined,
    prefetch: () => undefined,
    request: () => ({ kind: "idle" }),
  },
  thumbnailService: {} as ExplorerViewerProps["thumbnailService"],
});

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

const createThumbnailPlotModel = (fileId: string) => ({
  seriesList: [],
  signature: `plot:${fileId}`,
  xDomain: [0, 1] as [number, number],
  xUnitLabel: "V",
  yDomain: [0, 1] as [number, number],
  yUnitLabel: "A",
});
