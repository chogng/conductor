/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event as BaseEvent } from "src/cs/base/common/event";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import { DropIntoTablePreviewController } from "src/cs/workbench/contrib/files/browser/dropIntoTablePreviewController";
import { IFileConverterBackendService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import type { ITableDropTargetService } from "src/cs/workbench/services/table/browser/tableDropTargetService";

suite("workbench/contrib/files/test/browser/dropIntoTablePreviewController", () => {
  test("accepts dragover on the table preview target", () => {
    const tableTarget = createTestElement();
    const dropTargetService = new TestTableDropTargetService(tableTarget);
    const controller = createController(dropTargetService);

    try {
      assertDragOverAccepted(tableTarget);
    } finally {
      controller.dispose();
    }
  });

  test("attaches the table preview target added after construction", () => {
    const tableTarget = createTestElement();
    const dropTargetService = new TestTableDropTargetService(null);
    const controller = createController(dropTargetService);

    try {
      const beforeAttach = dispatchDragEvent(tableTarget, "dragover");
      assert.equal(beforeAttach.defaultPrevented, false);

      dropTargetService.setDropTargetElement(tableTarget);

      assertDragOverAccepted(tableTarget);
    } finally {
      controller.dispose();
    }
  });
});

class TestTableDropTargetService implements ITableDropTargetService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeDropTargetEmitter = new Emitter<HTMLElement | null>();
  public readonly onDidChangeDropTarget = this.onDidChangeDropTargetEmitter.event;

  public constructor(private dropTargetElement: HTMLElement | null) {}

  public getDropTargetElement(): HTMLElement | null {
    return this.dropTargetElement;
  }

  public setDropTargetElement(element: HTMLElement | null): void {
    this.dropTargetElement = element;
    this.onDidChangeDropTargetEmitter.fire(element);
  }

  public registerDropTargetElement(element: HTMLElement) {
    this.setDropTargetElement(element);
    return {
      dispose: () => {
        if (this.dropTargetElement === element) {
          this.setDropTargetElement(null);
        }
      },
    };
  }
}

function createController(dropTargetService: ITableDropTargetService): DropIntoTablePreviewController {
  return new DropIntoTablePreviewController(
    dropTargetService,
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
