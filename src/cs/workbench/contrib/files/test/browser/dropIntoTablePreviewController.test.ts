/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event as BaseEvent } from "src/cs/base/common/event";
import type { IView, IViewDescriptor, IViewPaneContainer, ViewContainer } from "src/cs/workbench/common/views";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import { DropIntoTablePreviewController } from "src/cs/workbench/contrib/files/browser/dropIntoTablePreviewController";
import { IFileConverterBackendService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { TableViewId } from "src/cs/workbench/services/table/common/table";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

suite("workbench/contrib/files/test/browser/dropIntoTablePreviewController", () => {
  test("accepts dragover on the table preview target", () => {
    const tableTarget = createTestElement();
    const viewsService = new TestViewsService([
      new TestDropTargetView(TableViewId, tableTarget),
    ]);
    const controller = createController(viewsService);

    try {
      assertDragOverAccepted(tableTarget);
    } finally {
      controller.dispose();
    }
  });

  test("attaches the table preview target added after construction", () => {
    const tableTarget = createTestElement();
    const viewsService = new TestViewsService([]);
    const controller = createController(viewsService);

    try {
      const beforeAttach = dispatchDragEvent(tableTarget, "dragover");
      assert.equal(beforeAttach.defaultPrevented, false);

      viewsService.addView(new TestDropTargetView(TableViewId, tableTarget));
      viewsService.fireVisibility(TableViewId, true);

      assertDragOverAccepted(tableTarget);
    } finally {
      controller.dispose();
    }
  });
});

class TestDropTargetView implements IView {
  public readonly element = createTestElement();
  private visible = true;

  public constructor(
    public readonly id: string,
    private readonly dropTarget: HTMLElement,
  ) {}

  public getDropTargetElement(): HTMLElement {
    return this.dropTarget;
  }

  public focus(): void {}

  public isVisible(): boolean {
    return this.visible;
  }

  public isBodyVisible(): boolean {
    return this.visible;
  }

  public setVisible(visible: boolean): boolean {
    if (this.visible === visible) {
      return false;
    }

    this.visible = visible;
    return true;
  }

  public getProgressIndicator(): undefined {
    return undefined;
  }

  public dispose(): void {}
}

class TestViewsService implements IViewsService {
  public declare readonly _serviceBrand: undefined;

  private readonly views = new Map<string, IView>();
  private readonly onDidChangeViewVisibilityEmitter = new Emitter<{
    readonly id: string;
    readonly visible: boolean;
  }>();

  public readonly onDidChangeViewContainerVisibility =
    BaseEvent.None as IViewsService["onDidChangeViewContainerVisibility"];
  public readonly onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
  public readonly onDidChangeFocusedView =
    BaseEvent.None as IViewsService["onDidChangeFocusedView"];

  public constructor(views: readonly IView[]) {
    for (const view of views) {
      this.addView(view);
    }
  }

  public addView(view: IView): void {
    this.views.set(view.id, view);
  }

  public fireVisibility(id: string, visible: boolean): void {
    this.onDidChangeViewVisibilityEmitter.fire({ id, visible });
  }

  public isViewContainerVisible(): boolean {
    return false;
  }

  public isViewContainerActive(): boolean {
    return false;
  }

  public async openViewContainer(): Promise<ViewContainer | null> {
    return null;
  }

  public closeViewContainer(): void {}

  public getVisibleViewContainer(): ViewContainer | null {
    return null;
  }

  public getViewContainerElement(): null {
    return null;
  }

  public getActiveViewPaneContainerWithId(): IViewPaneContainer | null {
    return null;
  }

  public getFocusedView(): IViewDescriptor | null {
    return null;
  }

  public getFocusedViewName(): string {
    return "";
  }

  public addViewToContainer(): IView | null {
    return null;
  }

  public setViewVisible(): boolean {
    return false;
  }

  public isViewVisible(): boolean {
    return false;
  }

  public async openView<T extends IView>(id: string): Promise<T | null> {
    return this.getViewWithId<T>(id);
  }

  public closeView(): void {}

  public getActiveViewWithId<T extends IView>(id: string): T | null {
    return this.getViewWithId<T>(id);
  }

  public getViewWithId<T extends IView>(id: string): T | null {
    return this.views.get(id) as T | undefined ?? null;
  }

  public getViewProgressIndicator(): undefined {
    return undefined;
  }
}

function createController(viewsService: IViewsService): DropIntoTablePreviewController {
  return new DropIntoTablePreviewController(
    viewsService,
    createSessionService(),
    createExplorerService(),
    createFileConverterBackendService(),
  );
}

function assertDragOverAccepted(target: HTMLElement): void {
  const dragEnter = dispatchDragEvent(target, "dragenter");
  assert.equal(dragEnter.defaultPrevented, true);
  assert.equal(dragEnter.dataTransfer?.dropEffect, "copy");

  const event = dispatchDragEvent(target, "dragover");
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.dataTransfer?.dropEffect, "copy");
  assert.equal(target.classList.contains("workbench_preview_area_part--dragging"), true);

  target.dispatchEvent(new globalThis.Event("dragleave"));
  assert.equal(target.classList.contains("workbench_preview_area_part--dragging"), false);
}

function dispatchDragEvent(target: HTMLElement, type: string): DragEvent {
  const event = new globalThis.Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: createDataTransfer(),
  });
  target.dispatchEvent(event);
  return event;
}

function createDataTransfer(): DataTransfer {
  return {
    dropEffect: "none",
  } as DataTransfer;
}

class TestElement extends EventTarget {
  public readonly classList = new TestClassList();
}

class TestClassList {
  private readonly tokens = new Set<string>();

  public contains(token: string): boolean {
    return this.tokens.has(token);
  }

  public toggle(token: string, force?: boolean): boolean {
    const shouldHaveToken = force ?? !this.tokens.has(token);
    if (shouldHaveToken) {
      this.tokens.add(token);
      return true;
    }

    this.tokens.delete(token);
    return false;
  }
}

function createTestElement(): HTMLElement {
  return new TestElement() as unknown as HTMLElement;
}

function createSessionService(): ISessionService {
  return {
    _serviceBrand: undefined,
    onDidChangeSession: BaseEvent.None as ISessionService["onDidChangeSession"],
    setMetricInput: () => undefined,
    clearMetricInput: () => undefined,
    clearSession: () => undefined,
    commitFileImport: () => undefined,
    commitRawTableAssessment: () => undefined,
    commitTemplateRun: () => undefined,
    commitCurves: () => undefined,
    commitMetrics: () => undefined,
    getSnapshot: () => ({
      fileOrder: [],
      filesById: {},
      schemaVersion: 1,
      sessionVersion: 0,
    }),
    removeFiles: () => undefined,
  };
}

function createExplorerService(): IExplorerService {
  return {
    _serviceBrand: undefined,
    selectedProcessedFileId: null,
    selectedRawFileId: null,
    expandedFolderKeys: [],
    viewLayout: "tree",
    onDidChangeSelection: BaseEvent.None as IExplorerService["onDidChangeSelection"],
    onDidChangeExpandedFolderKeys: BaseEvent.None as IExplorerService["onDidChangeExpandedFolderKeys"],
    onDidChangeViewLayout: BaseEvent.None as IExplorerService["onDidChangeViewLayout"],
    onDidChangePaneInput: BaseEvent.None as IExplorerService["onDidChangePaneInput"],
    onDidRequestFolderImport: BaseEvent.None as IExplorerService["onDidRequestFolderImport"],
    onDidRequestSelectedFolderRemoval: BaseEvent.None as IExplorerService["onDidRequestSelectedFolderRemoval"],
    onDidRequestFileRemoval: BaseEvent.None as IExplorerService["onDidRequestFileRemoval"],
    getContext: () => ({
      editable: null,
      expandedFolderKeys: [],
      selectedProcessedFileId: null,
      selectedRawFileId: null,
      toCopy: {
        isCut: false,
        resources: [],
      },
      viewLayout: "tree",
    }),
    registerView: () => ({
      dispose: () => undefined,
    }),
    select: () => null,
    setEditable: () => undefined,
    setToCopy: () => undefined,
    applyBulkEdit: async () => undefined,
    refresh: async () => undefined,
    setExpandedFolderKeys: () => undefined,
    reconcileExpandedFolderKeys: () => [],
    getCollapsedFolderKeys: () => [],
    requestFolderImport: () => undefined,
    requestSelectedFolderRemoval: () => undefined,
    requestFileRemoval: () => undefined,
    setViewLayout: () => undefined,
    toggleViewLayout: () => undefined,
    getPaneInput: () => null,
    updatePaneInput: () => undefined,
  };
}

function createFileConverterBackendService(): IFileConverterBackendService {
  return {
    _serviceBrand: undefined,
    canPrepareFile: () => false,
    prepareFile: async () => ({ ok: false }),
    canReadConvertedCsv: () => false,
    readConvertedCsv: async () => ({ ok: false }),
  };
}
