/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createNLSConfiguration, setNLSConfiguration } from "src/cs/nls";
import type {
  IContextMenuService,
  IContextViewDelegate,
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";
import { Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event } from "src/cs/base/common/event";
import { ObjectTree } from "src/cs/base/browser/ui/tree/objectTree";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { ResourceLabels } from "src/cs/workbench/browser/labels";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";
import {
  CLOSE_FILE_ITEM_COMMAND_ID,
  DELETE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  REVEAL_IN_OS_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import type {
  IThumbnailService,
  ThumbnailPreviewChangeEvent,
  ThumbnailPreviewPlotModel,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import { DEFAULT_EXPLORER_APPEARANCE } from "src/cs/workbench/services/appearance/common/appearance";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/browser/explorerViewer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const autoTemplateSelectionId = "auto";

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

  test("shows table mode file context in the existing file item hover", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      contextViewService,
      expandedFolderKeys: ["folder:293K", "folder:293K/output"],
      files: [{
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "output",
          source: "assessment",
        },
        fileId: "file-a",
        fileName: "Output_.csv",
        itemKey: "file-a",
        relativePath: "293K/output/Output_.csv",
      }],
      mode: "table",
    };
    const viewer = new ExplorerViewer(host, hoverHost, props, labels);

    try {
      const content = host.querySelector<HTMLElement>(".file-list-item-content");
      assert.ok(content);
      assert.equal(content.hasAttribute("title"), false);

      setNLSConfiguration(createNLSConfiguration("zh"));

      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);
      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      const rows = [...(contextViewService.renderedElement?.querySelectorAll<HTMLElement>(".file-list-hover-assessment-row") ?? [])]
        .map(row => [
          row.querySelector(".file-list-hover-assessment-label")?.textContent ?? "",
          row.querySelector(".file-list-hover-assessment-value")?.textContent ?? "",
        ]);
      assert.deepEqual(rows, [
        ["文件：", "Output_.csv"],
        ["路径：", "293K/output"],
        ["类型：", "output"],
      ]);

      viewer.setProps({
        ...props,
        mode: "chart",
      });

      assert.equal(content.hasAttribute("title"), false);
    } finally {
      setNLSConfiguration(createNLSConfiguration("en"));
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
        id: autoTemplateSelectionId,
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

  test("creates template submenu and direct slice action when user templates are available", () => {
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
      assert.ok(sliceTemplate);
      assert.equal(sliceTemplate instanceof SubmenuAction, false);
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

  test("orders file context actions into reveal, template, and edit groups", () => {
    const revealRegistration = CommandsRegistry.registerCommand(REVEAL_IN_OS_COMMAND_ID, () => undefined);
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const baseProps = createViewerProps();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...baseProps,
      files: [{
        ...baseProps.files[0],
        normalizedCsvPath: "/tmp/A.csv",
      }],
      templateRecords: [{
        id: "template-a",
        name: "Template A",
      }],
    }, labels);

    try {
      const actions = getFileContextActions(viewer, "file-a");

      assert.deepEqual(
        actions.map(action => action.id),
        [
          REVEAL_IN_OS_COMMAND_ID,
          Separator.ID,
          SET_FILE_TEMPLATE_COMMAND_ID,
          SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
          Separator.ID,
          RENAME_FILE_ITEM_COMMAND_ID,
          DELETE_FILE_ITEM_COMMAND_ID,
        ],
      );
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
      revealRegistration.dispose();
    }
  });

  test("uses close command for the file item close button", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const commands: Array<{ readonly args: readonly unknown[]; readonly id: string }> = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      commandService: {
        executeCommand: async (id: string, ...args: unknown[]) => {
          commands.push({ args, id });
          return undefined;
        },
      },
    }, labels);

    try {
      const closeButton = host.querySelector<HTMLButtonElement>(".file-list-item-remove");
      assert.ok(closeButton);

      closeButton.click();

      assert.deepEqual(commands, [{
        args: ["file-a"],
        id: CLOSE_FILE_ITEM_COMMAND_ID,
      }]);
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
    const previewEmitter = new Emitter<ThumbnailPreviewChangeEvent>();
    let modelReady = false;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => modelReady
          ? {
              kind: "ready",
              model: createThumbnailPlotModel("file-a"),
              signature: "plot:file-a",
            }
          : { kind: "loading" },
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
      thumbnailService: createThumbnailService(),
      viewLayout: "thumbnail",
    };
    const viewer = new ExplorerViewer(host, hoverHost, props, labels);

    try {
      viewer.setProps(props);
      const loadingCanvas = host.querySelector(".thumbnail_view_chart_loading_canvas");
      assert.ok(loadingCanvas);
      assert.equal(host.querySelector(".thumbnail_view_chart_loading"), null);

      modelReady = true;
      previewEmitter.fire({ fileId: "file-a" });
      await animationFrames(1);

      const readyCanvas = host.querySelector(".thumbnail_view_chart_canvas");
      assert.ok(readyCanvas);
      assert.equal(readyCanvas.classList.contains("thumbnail_view_chart_loading_canvas"), false);
      assert.equal(host.querySelector(".thumbnail_view_chart_loading"), null);
    } finally {
      viewer.dispose();
      previewEmitter.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("updates file hover thumbnail without reopening the context view", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    const previewEmitter = new Emitter<ThumbnailPreviewChangeEvent>();
    let modelReady = false;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => modelReady
          ? {
              kind: "ready",
              model: createThumbnailPlotModel("file-a"),
              signature: "plot:file-a",
            }
          : { kind: "loading" },
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
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
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
      assert.equal(contextViewService.showCount, 1);
      const loadingCanvas = hoverLayer.querySelector(".thumbnail_view_chart_loading_canvas");
      assert.ok(loadingCanvas);
      assert.equal(hoverLayer.querySelector(".thumbnail_view_chart_loading"), null);

      modelReady = true;
      previewEmitter.fire({ fileId: "file-a" });

      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement, hoverLayer);
      const readyCanvas = hoverLayer.querySelector(".thumbnail_view_chart_canvas");
      assert.ok(readyCanvas);
      assert.equal(readyCanvas.classList.contains("thumbnail_view_chart_loading_canvas"), false);
      assert.equal(hoverLayer.querySelector(".thumbnail_view_chart_loading"), null);
      const readyThumbnail = hoverLayer.querySelector(".thumbnail_view");
      assert.ok(readyThumbnail);
      const replaceChildren = hoverLayer.replaceChildren.bind(hoverLayer);
      let replaceCount = 0;
      hoverLayer.replaceChildren = (...nodes: (Node | string)[]): void => {
        replaceCount += 1;
        replaceChildren(...nodes);
      };

      previewEmitter.fire({ fileId: "file-a" });

      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement, hoverLayer);
      assert.equal(replaceCount, 0);
      assert.equal(hoverLayer.querySelector(".thumbnail_view"), readyThumbnail);

      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: item,
      }));

      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement, hoverLayer);
    } finally {
      viewer.dispose();
      previewEmitter.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("does not request hover thumbnail for chart files without chart data", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    let requestCount = 0;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      files: [{
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "output",
          source: "assessment",
        },
        chartState: "ready",
        curveType: "IV",
        curveTypeBadgeLabel: "output",
        curveTypeConfidence: "high",
        curveTypeReasons: ["matched voltage/current columns"],
        fileId: "file-a",
        fileName: "A.csv",
        hasChartData: false,
        itemKey: "file-a",
      }],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => ({ kind: "idle" }),
        invalidate: () => undefined,
        onDidChangePreview: NoThumbnailPreviewEvent,
        prefetch: () => undefined,
        request: () => {
          requestCount += 1;
          return { kind: "loading" };
        },
      },
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
    }, labels);

    try {
      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);
      assert.equal(item.dataset.chartState, "ready");
      assert.equal(item.dataset.hasChartData, "false");

      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      assert.equal(requestCount, 0);
      assert.equal(contextViewService.delegate, undefined);
      assert.equal(contextViewService.renderedElement, undefined);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("warms detached hover thumbnail cache when preview becomes ready", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    const previewEmitter = new Emitter<ThumbnailPreviewChangeEvent>();
    const readyFiles = new Set<string>();
    const warmedSignatures: string[] = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      files: [
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "processing",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-a",
          fileName: "A.csv",
          itemKey: "file-a",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "processing",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-b",
          fileName: "B.csv",
          itemKey: "file-b",
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (fileId) => readyFiles.has(fileId)
          ? {
              kind: "ready",
              model: createThumbnailPlotModel(fileId),
              signature: `plot:${fileId}`,
            }
          : { kind: "loading" },
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (fileId) => readyFiles.has(fileId)
          ? {
              kind: "ready",
              model: createThumbnailPlotModel(fileId),
              signature: `plot:${fileId}`,
            }
          : { kind: "loading" },
      },
      thumbnailService: createThumbnailService({
        warmPlotThumbnail: (options) => {
          warmedSignatures.push(options.model.signature);
        },
      }),
      viewLayout: "tree",
    }, labels);

    try {
      const items = host.querySelectorAll<HTMLElement>(".file-list-item");
      assert.equal(items.length, 2);

      items[0].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));
      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement?.querySelector(".thumbnail_view")?.getAttribute("data-hover-file-id"), "file-a");

      items[1].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: items[0],
      }));
      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement?.querySelector(".thumbnail_view")?.getAttribute("data-hover-file-id"), "file-b");

      readyFiles.add("file-a");
      previewEmitter.fire({ fileId: "file-a" });

      assert.deepEqual(warmedSignatures, ["plot:file-a"]);
      readyFiles.add("file-b");
      previewEmitter.fire({ fileId: "file-b" });

      assert.deepEqual(warmedSignatures, ["plot:file-a"]);
    } finally {
      viewer.dispose();
      previewEmitter.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("reuses thumbnail hover shell across files without mixing thumbnail identity", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    const previewEmitter = new Emitter<ThumbnailPreviewChangeEvent>();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      files: [
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "ready",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-a",
          fileName: "A.csv",
          hasChartData: true,
          itemKey: "file-a",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "ready",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-b",
          fileName: "B.csv",
          hasChartData: true,
          itemKey: "file-b",
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (fileId) => ({
          kind: "ready",
          model: createThumbnailPlotModel(fileId),
          signature: `plot:${fileId}`,
        }),
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (fileId) => ({
          kind: "ready",
          model: createThumbnailPlotModel(fileId),
          signature: `plot:${fileId}`,
        }),
      },
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
    }, labels);

    try {
      const items = host.querySelectorAll<HTMLElement>(".file-list-item");
      assert.equal(items.length, 2);

      items[0].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      const hoverLayer = contextViewService.renderedElement;
      assert.ok(hoverLayer);
      const firstThumbnail = hoverLayer.querySelector<HTMLElement>(".thumbnail_view");
      assert.ok(firstThumbnail);
      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.delegate?.getAnchor(), items[0]);
      assert.equal(firstThumbnail.getAttribute("data-hover-file-id"), "file-a");
      assert.equal(firstThumbnail.getAttribute("data-hover-plot-signature"), "plot:file-a");

      items[1].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: items[0],
      }));

      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement, hoverLayer);
      assert.equal(contextViewService.delegate?.getAnchor(), items[1]);
      const secondThumbnail = hoverLayer.querySelector<HTMLElement>(".thumbnail_view");
      assert.ok(secondThumbnail);
      assert.equal(secondThumbnail === firstThumbnail, false);
      assert.equal(secondThumbnail.getAttribute("data-hover-file-id"), "file-b");
      assert.equal(secondThumbnail.getAttribute("data-hover-plot-signature"), "plot:file-b");

      previewEmitter.fire({ fileId: "file-a" });

      assert.equal(contextViewService.showCount, 1);
      assert.equal(contextViewService.renderedElement, hoverLayer);
      assert.equal(contextViewService.renderedElement?.querySelector(".thumbnail_view")?.getAttribute("data-hover-file-id"), "file-b");
      assert.equal(contextViewService.renderedElement?.querySelector(".thumbnail_view")?.getAttribute("data-hover-plot-signature"), "plot:file-b");
    } finally {
      viewer.dispose();
      previewEmitter.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("warms ready hover thumbnail cache when switching away", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    const warmedSignatures: string[] = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      files: [
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "ready",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-a",
          fileName: "A.csv",
          hasChartData: true,
          itemKey: "file-a",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          chartState: "ready",
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-b",
          fileName: "B.csv",
          hasChartData: true,
          itemKey: "file-b",
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (fileId) => ({
          kind: "ready",
          model: createThumbnailPlotModel(fileId),
          signature: `plot:${fileId}`,
        }),
        invalidate: () => undefined,
        onDidChangePreview: NoThumbnailPreviewEvent,
        prefetch: () => undefined,
        request: (fileId) => ({
          kind: "ready",
          model: createThumbnailPlotModel(fileId),
          signature: `plot:${fileId}`,
        }),
      },
      thumbnailService: createThumbnailService({
        warmPlotThumbnail: (options) => {
          warmedSignatures.push(options.model.signature);
        },
      }),
      viewLayout: "tree",
    }, labels);

    try {
      const items = host.querySelectorAll<HTMLElement>(".file-list-item");
      assert.equal(items.length, 2);

      items[0].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));
      assert.deepEqual(warmedSignatures, []);

      items[1].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: items[0],
      }));
      assert.deepEqual(warmedSignatures, ["plot:file-a"]);

      items[0].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: items[1],
      }));
      assert.deepEqual(warmedSignatures, ["plot:file-a", "plot:file-b"]);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("closes file hover when the active anchor resolves to another thumbnail file", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    const previewEmitter = new Emitter<ThumbnailPreviewChangeEvent>();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = new ExplorerViewer(host, hoverHost, {
      ...createViewerProps(),
      contextViewService,
      files: [
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-a",
          fileName: "A.csv",
          itemKey: "file-a",
        },
        {
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "transfer",
            source: "assessment",
          },
          curveType: "IV",
          curveTypeBadgeLabel: "transfer",
          curveTypeConfidence: "high",
          curveTypeReasons: ["matched voltage/current columns"],
          fileId: "file-b",
          fileName: "B.csv",
          itemKey: "file-b",
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => ({ kind: "idle" }),
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (fileId) => ({
          kind: "ready",
          model: createThumbnailPlotModel(fileId),
          signature: `plot:${fileId}`,
        }),
      },
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
    }, labels);

    try {
      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);

      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      assert.ok(contextViewService.delegate);
      assert.ok(contextViewService.renderedElement);

      item.dataset.fileId = "file-b";
      previewEmitter.fire({ fileId: "file-a" });

      assert.equal(contextViewService.delegate, undefined);
      assert.equal(contextViewService.renderedElement, undefined);
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
  public showCount = 0;
  private activeDisposable: IDisposable | undefined;

  public showContextView(
    delegate: IContextViewDelegate,
    container?: HTMLElement,
  ): IOpenContextView {
    this.showCount += 1;
    this.delegate = delegate;
    this.container = container;
    const contextView = document.createElement("div");
    this.renderedElement = contextView;
    (container ?? document.body).append(contextView);
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
    this.renderedElement?.remove();
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
    curveTypeBadgeLabel: "transfer",
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
    _serviceBrand: undefined,
    onDidChangePreview: NoThumbnailPreviewEvent,
    get: () => ({ kind: "idle" }),
    invalidate: () => undefined,
    prefetch: () => undefined,
    request: () => ({ kind: "idle" }),
  },
  thumbnailService: createThumbnailService(),
});

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

const NoThumbnailPreviewEvent = Event.None as Event<ThumbnailPreviewChangeEvent>;

const createThumbnailService = (
  overrides: Partial<Pick<IThumbnailService, "clear" | "drawPlotThumbnail" | "warmPlotThumbnail">> = {},
): IThumbnailService => ({
  _serviceBrand: undefined,
  clear: () => undefined,
  drawPlotThumbnail: () => undefined,
  warmPlotThumbnail: () => undefined,
  ...overrides,
});

const createThumbnailPlotModel = (fileId: string): ThumbnailPreviewPlotModel => ({
  pointsCount: 0,
  seriesList: [],
  signature: `plot:${fileId}`,
  xDomain: [0, 1] as [number, number],
  xUnitLabel: "V",
  yDomain: [0, 1] as [number, number],
  yUnitLabel: "A",
});
