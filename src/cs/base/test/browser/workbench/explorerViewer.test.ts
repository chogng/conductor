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
import { Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
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
} from "src/cs/workbench/contrib/files/common/fileCommands";
import type {
  IThumbnailService,
  ThumbnailPreviewChangeEvent,
  ThumbnailPreviewPlotModel,
  ThumbnailPreviewTarget,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type {
  IDecorationData,
  IDecorationsService,
  IResourceDecorationChangeEvent,
} from "src/cs/workbench/services/decorations/common/decorations";
import type { IReviewService } from "src/cs/workbench/services/review/common/review";
import type { ReviewSummary } from "src/cs/workbench/services/review/common/reviewModel";
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

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
    }, labels, contextViewService);

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

    const file = {
      fileId: "file-a",
      fileName: "Output_.csv",
      itemKey: "file-a",
      relativePath: "293K/output/Output_.csv",
      resource: URI.file("/workspace/Output_.csv"),
    };
    const reviewService = createReviewService(() => ({
      confidence: 0.92,
      findingCodes: ["review.ready.systemRecommended"],
      message: "Template is ready.",
      resource: URI.file("/workspace/Output_.csv"),
      reviewedSemanticLabel: "output",
      reviewedType: "output",
      reviewSignature: "review:1",
      state: "ready",
      templateFingerprint: "template:1",
    }));
    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      expandedFolderKeys: ["folder:293K", "folder:293K/output"],
      files: [file],
      mode: "table",
    };
    const viewer = createViewer(host, hoverHost, props, labels, contextViewService, { reviewService });

    try {
      const content = host.querySelector<HTMLElement>(".file-list-item-content");
      assert.ok(content);
      assert.equal(content.hasAttribute("title"), false);

      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);
      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      assert.ok(contextViewService.renderedElement?.classList.contains("file-list-hover--review-decoration"));
      const rows = [...(contextViewService.renderedElement?.querySelectorAll<HTMLElement>(".file-list-hover-review-decoration-row") ?? [])]
        .map(row => [
          row.querySelector(".file-list-hover-review-decoration-label")?.textContent ?? "",
          row.querySelector(".file-list-hover-review-decoration-value")?.textContent ?? "",
        ]);
      assert.deepEqual(rows, [
        ["File:", "Output_.csv"],
        ["Path:", "293K/output"],
        ["Review:", "Ready"],
        ["Type:", "output"],
        ["Confidence:", "92%"],
        ["Message:", "Template is ready."],
        ["Findings:", "review.ready.systemRecommended"],
      ]);

      viewer.setProps({
        ...props,
        mode: "chart",
      });

      assert.equal(content.hasAttribute("title"), false);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("shows ordinary file hover when no review result is cached", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const contextViewService = new TestContextViewService();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const file = {
      fileId: "file-a",
      fileName: "Output_.csv",
      itemKey: "file-a",
      relativePath: "293K/output/Output_.csv",
      resource: URI.file("/workspace/Output_.csv"),
    };
    const reviewService = createReviewService(() => ({
      findingCodes: [],
      resource: URI.file("/workspace/Output_.csv"),
      state: "missing",
    }));
    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      expandedFolderKeys: ["folder:293K", "folder:293K/output"],
      files: [file],
      mode: "table",
    };
    const viewer = createViewer(host, hoverHost, props, labels, contextViewService, { reviewService });

    try {
      const item = host.querySelector<HTMLElement>(".file-list-item");
      assert.ok(item);
      item.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: null,
      }));

      assert.equal(contextViewService.renderedElement?.dataset.hoverKind, "file");
      const rows = [...(contextViewService.renderedElement?.querySelectorAll<HTMLElement>(".file-list-hover-review-decoration-row") ?? [])]
        .map(row => [
          row.querySelector(".file-list-hover-review-decoration-label")?.textContent ?? "",
          row.querySelector(".file-list-hover-review-decoration-value")?.textContent ?? "",
        ]);
      assert.deepEqual(rows, [
        ["File:", "Output_.csv"],
        ["Path:", "293K/output"],
      ]);
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

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
    }, labels, contextViewService);

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

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      expandedFolderKeys: ["folder:Folder"],
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        relativePath: "Folder/A.csv",
        resource: URI.file("/data/Folder/A.csv"),
      }],
    }, labels, contextViewService);

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

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        resource: URI.file("/workspace/A.csv"),
      }],
      templateRecords: [{
        id: autoTemplateSelectionId,
        name: "Recommended template",
      }],
    }, labels);

    try {
      const actions = getFileContextActions(viewer, "file-a");
      const setTemplate = actions.find(action => action.id === SET_FILE_TEMPLATE_COMMAND_ID);

      assert.ok(setTemplate);
      assert.equal(setTemplate.enabled, false);
      assert.equal(setTemplate instanceof SubmenuAction, false);
    } finally {
      viewer.dispose();
      labels.dispose();
      hoverHost.remove();
    }
  });

  test("creates template submenu when user templates are available", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        resource: URI.file("/workspace/A.csv"),
      }],
      templateRecords: [{
        id: "template-a",
        name: "Template A",
      }],
    }, labels);

    try {
      const actions = getFileContextActions(viewer, "file-a");
      const setTemplate = actions.find(action => action.id === SET_FILE_TEMPLATE_COMMAND_ID);

      assert.ok(setTemplate instanceof SubmenuAction);
      assert.equal(setTemplate.enabled, true);
      assert.deepEqual(
        setTemplate.actions.map(action => action.label),
        ["Recommended template", "Template A"],
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

    const viewer = createViewer(host, hoverHost, {
      ...baseProps,
      files: [{
        ...baseProps.files[0],
        normalizedCsvPath: "/tmp/A.csv",
        resource: URI.file("/tmp/A.csv"),
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
    const resource = URI.file("/workspace/A.csv");
    const commands: Array<{ readonly args: readonly unknown[]; readonly id: string }> = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      commandService: {
        executeCommand: async (id: string, ...args: unknown[]) => {
          commands.push({ args, id });
          return undefined;
        },
      },
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        resource,
      }],
    }, labels);

    try {
      const closeButton = host.querySelector<HTMLButtonElement>(".file-list-item-remove");
      assert.ok(closeButton);

      closeButton.click();

      assert.deepEqual(commands.map(command => ({
        id: command.id,
        resource: (command.args[0] as { readonly resource?: URI } | undefined)?.resource?.toString(),
      })), [{
        id: CLOSE_FILE_ITEM_COMMAND_ID,
        resource: resource.toString(),
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
    document.body.append(hoverHost);
    hoverHost.append(host);

    const resource = URI.file("/workspace/A.csv");
    const decorationChanged = new Emitter<IResourceDecorationChangeEvent>();
    let decoration: IDecorationData = {
      letter: "...",
      color: "purple",
      tooltip: "Review pending",
    };
    const decorationsService = {
      getDecoration: () => undefined,
      getDecorationData: () => [decoration],
      onDidChangeDecorations: decorationChanged.event,
    } as unknown as IDecorationsService;
    const labels = new ResourceLabels(decorationsService);
    const initialFile: ExplorerViewerProps["files"][number] = {
      fileId: "file-a",
      fileName: "A.csv",
      itemKey: "file-a",
      resource,
    };
    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      files: [initialFile],
    };
    const viewer = createViewer(host, hoverHost, props, labels, undefined, { decorationsService });

    try {
      const badge = host.querySelector<HTMLElement>(".file-list-item-review-decoration");
      assert.ok(badge);
      assert.equal(badge.textContent, "...");
      assert.equal(badge.hasAttribute("title"), false);
      assert.equal(host.querySelector<HTMLElement>(".file-list-item-label")?.hasAttribute("title"), false);

      decoration = {
        letter: "cv",
        color: "purple",
        tooltip: "Review ready",
      };
      decorationChanged.fire({
        affectsResource: () => true,
      });

      assert.equal(setChildrenCount, 0);
      assert.deepEqual(rerenderedKeys, []);
      assert.equal(badge.textContent, "cv");
      assert.equal(badge.dataset.color, "purple");
      assert.equal(badge.hasAttribute("title"), false);
      assert.equal(host.querySelector<HTMLElement>(".file-list-item-label")?.hasAttribute("title"), false);

      decoration = {
        letter: "cv",
        color: "green",
        tooltip: "Review ready",
      };
      decorationChanged.fire({
        affectsResource: () => true,
      });

      assert.deepEqual(rerenderedKeys, []);
      assert.equal(badge.dataset.color, "green");
    } finally {
      viewer.dispose();
      decorationChanged.dispose();
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
    const resource = URI.file("/data/A.csv");
    let modelReady = false;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        resource,
      }],
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
    const viewer = createViewer(host, hoverHost, props, labels);

    try {
      viewer.setProps(props);
      const loadingCanvas = host.querySelector(".thumbnail_view_chart_loading_canvas");
      assert.ok(loadingCanvas);
      assert.equal(host.querySelector(".thumbnail_view_chart_loading"), null);

      modelReady = true;
      previewEmitter.fire({ resource });
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

  test("requests URI resource row thumbnails", () => {
    const host = document.createElement("div");
    const hoverHost = document.createElement("div");
    const labels = new ResourceLabels();
    const requestedTargets: Array<{
      readonly fileId?: string;
      readonly resource?: string | null;
      readonly sheetId?: string | null;
    }> = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const props: ExplorerViewerProps = {
      ...createViewerProps(),
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        resource: URI.file("/data/A.csv"),
      }, {
        fileId: "uri-a",
        fileName: "Uri A.csv",
        resource: URI.file("/data/UriA.csv"),
      }],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => ({ kind: "idle" }),
        invalidate: () => undefined,
        onDidChangePreview: NoThumbnailPreviewEvent,
        prefetch: () => undefined,
        request: target => {
          if (typeof target === "string") {
            requestedTargets.push({ fileId: target });
          } else {
            requestedTargets.push({
              resource: target.resource.toString(),
              sheetId: target.sheetId ?? null,
            });
          }
          return { kind: "loading" };
        },
      },
      viewLayout: "thumbnail",
    };
    const viewer = createViewer(host, hoverHost, props, labels);

    try {
      viewer.setProps(props);

      assert.deepEqual(requestedTargets, [
        {
          resource: "file:///data/A.csv",
          sheetId: null,
        },
        {
          resource: "file:///data/UriA.csv",
          sheetId: null,
        },
      ]);
    } finally {
      viewer.dispose();
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
    const resource = URI.file("/data/A.csv");
    let modelReady = false;
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [{
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "file-a",
        resource,
      }],
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
    }, labels, contextViewService);

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
      previewEmitter.fire({ resource });

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

      previewEmitter.fire({ resource });

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

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [{
        chartState: "ready",
        fileId: "file-a",
        fileName: "A.csv",
        hasChartData: false,
        itemKey: "file-a",
        resource: URI.file("/data/A.csv"),
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
    }, labels, contextViewService);

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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const readyFiles = new Set<string>();
    const warmedSignatures: string[] = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [
        {
          chartState: "processing",
          fileId: "file-a",
          fileName: "A.csv",
          itemKey: "file-a",
          resource: resourceA,
        },
        {
          chartState: "processing",
          fileId: "file-b",
          fileName: "B.csv",
          itemKey: "file-b",
          resource: resourceB,
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return readyFiles.has(fileId)
            ? {
                kind: "ready",
                model: createThumbnailPlotModel(fileId),
                signature: `plot:${fileId}`,
              }
            : { kind: "loading" };
        },
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return readyFiles.has(fileId)
            ? {
                kind: "ready",
                model: createThumbnailPlotModel(fileId),
                signature: `plot:${fileId}`,
              }
            : { kind: "loading" };
        },
      },
      thumbnailService: createThumbnailService({
        warmPlotThumbnail: (options) => {
          warmedSignatures.push(options.model.signature);
        },
      }),
      viewLayout: "tree",
    }, labels, contextViewService);

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
      previewEmitter.fire({ resource: resourceA });

      assert.deepEqual(warmedSignatures, ["plot:file-a"]);
      readyFiles.add("file-b");
      previewEmitter.fire({ resource: resourceB });

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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [
        {
          chartState: "ready",
          fileId: "file-a",
          fileName: "A.csv",
          hasChartData: true,
          itemKey: "file-a",
          resource: resourceA,
        },
        {
          chartState: "ready",
          fileId: "file-b",
          fileName: "B.csv",
          hasChartData: true,
          itemKey: "file-b",
          resource: resourceB,
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return {
            kind: "ready",
            model: createThumbnailPlotModel(fileId),
            signature: `plot:${fileId}`,
          };
        },
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return {
            kind: "ready",
            model: createThumbnailPlotModel(fileId),
            signature: `plot:${fileId}`,
          };
        },
      },
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
    }, labels, contextViewService);

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

      previewEmitter.fire({ resource: resourceA });

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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    const warmedSignatures: string[] = [];
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [
        {
          chartState: "ready",
          fileId: "file-a",
          fileName: "A.csv",
          hasChartData: true,
          itemKey: "file-a",
          resource: resourceA,
        },
        {
          chartState: "ready",
          fileId: "file-b",
          fileName: "B.csv",
          hasChartData: true,
          itemKey: "file-b",
          resource: resourceB,
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return {
            kind: "ready",
            model: createThumbnailPlotModel(fileId),
            signature: `plot:${fileId}`,
          };
        },
        invalidate: () => undefined,
        onDidChangePreview: NoThumbnailPreviewEvent,
        prefetch: () => undefined,
        request: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return {
            kind: "ready",
            model: createThumbnailPlotModel(fileId),
            signature: `plot:${fileId}`,
          };
        },
      },
      thumbnailService: createThumbnailService({
        warmPlotThumbnail: (options) => {
          warmedSignatures.push(options.model.signature);
        },
      }),
      viewLayout: "tree",
    }, labels, contextViewService);

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
    const resourceA = URI.file("/data/A.csv");
    const resourceB = URI.file("/data/B.csv");
    document.body.append(hoverHost);
    hoverHost.append(host);

    const viewer = createViewer(host, hoverHost, {
      ...createViewerProps(),
      files: [
        {
          fileId: "file-a",
          fileName: "A.csv",
          itemKey: "file-a",
          resource: resourceA,
        },
        {
          fileId: "file-b",
          fileName: "B.csv",
          itemKey: "file-b",
          resource: resourceB,
        },
      ],
      mode: "chart",
      thumbnailPreviewService: {
        _serviceBrand: undefined,
        get: () => ({ kind: "idle" }),
        invalidate: () => undefined,
        onDidChangePreview: previewEmitter.event,
        prefetch: () => undefined,
        request: (target) => {
          const fileId = getThumbnailPreviewResourceFileId(target);
          return {
            kind: "ready",
            model: createThumbnailPlotModel(fileId),
            signature: `plot:${fileId}`,
          };
        },
      },
      thumbnailService: createThumbnailService(),
      viewLayout: "tree",
    }, labels, contextViewService);

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
      previewEmitter.fire({ resource: resourceA });

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
): IAction[] => {
  const harness = viewer as unknown as {
    readonly props: ExplorerViewerProps;
    createFileContextActions(file: ExplorerViewerProps["files"][number]): IAction[];
  };
  const file = harness.props.files.find(candidate => candidate.fileId === fileId);
  assert.ok(file);
  return harness.createFileContextActions(file);
};

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

const createViewer = (
  host: HTMLElement,
  hoverHost: HTMLElement,
  props: ExplorerViewerProps,
  labels: ResourceLabels,
  contextViewService = new TestContextViewService(),
  services: {
    readonly decorationsService?: IDecorationsService;
    readonly reviewService?: IReviewService;
  } = {},
  contextMenuService: IContextMenuService = {
    showContextMenu: () => undefined,
  } as unknown as IContextMenuService,
): ExplorerViewer =>
  new ExplorerViewer(
    host,
    hoverHost,
    props,
    labels,
    contextMenuService,
    contextViewService,
    services.decorationsService ?? createDecorationsService(),
    services.reviewService ?? createReviewService(),
  );

const createViewerProps = (): ExplorerViewerProps => ({
  commandService: {
    executeCommand: async () => undefined,
  },
  files: [{
    fileId: "file-a",
    fileName: "A.csv",
    itemKey: "file-a",
    resource: URI.file("/data/A.csv"),
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

const createDecorationsService = (): IDecorationsService => ({
  getDecoration: () => undefined,
  getDecorationData: () => [],
  onDidChangeDecorations: Event.None as Event<IResourceDecorationChangeEvent>,
} as unknown as IDecorationsService);

const createReviewService = (
  getLatestReviewSummary: IReviewService["getLatestReviewSummary"] = target => ({
    resource: target.resource,
    ...(target.sheetId ? { sheetId: target.sheetId } : {}),
    state: "missing",
    findingCodes: [],
  } satisfies ReviewSummary),
): IReviewService => ({
  getLatestReviewSummary,
  onDidChangeReview: Event.None,
} as unknown as IReviewService);

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

const getThumbnailPreviewResourceFileId = (target: ThumbnailPreviewTarget): string => {
  if (typeof target === "string") {
    throw new Error("Expected a URI thumbnail preview target.");
  }

  const match = /\/([^/]+)\.csv$/i.exec(target.resource.path);
  return match ? `file-${match[1].toLowerCase()}` : "";
};

const createThumbnailPlotModel = (fileId: string): ThumbnailPreviewPlotModel => ({
  pointsCount: 0,
  seriesList: [],
  signature: `plot:${fileId}`,
  xDomain: [0, 1] as [number, number],
  xUnitLabel: "V",
  yDomain: [0, 1] as [number, number],
  yUnitLabel: "A",
});
