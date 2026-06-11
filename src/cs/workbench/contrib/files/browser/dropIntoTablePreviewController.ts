/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DragAndDropObserver } from "src/cs/base/browser/dom";
import { Disposable, DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { IView } from "src/cs/workbench/common/views";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
  prepareDroppedFilesForImport,
  type PreparedFileImport,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import { IFileConverterBackendService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import { createFileImportResultFromRecords } from "src/cs/workbench/services/files/common/files";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import { TableViewId } from "src/cs/workbench/services/table/common/table";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

type TablePreviewDropTargetView = IView & {
  readonly getDropTargetElement: () => HTMLElement;
};

type TablePreviewDropTargetRegistration = {
  readonly store: DisposableStore;
  readonly target: HTMLElement;
};

const TABLE_PREVIEW_DRAGGING_CLASS_NAME = "workbench_preview_area_part--dragging";

export class DropIntoTablePreviewController extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.files.dropIntoTablePreview";

  private dropTargetRegistration: TablePreviewDropTargetRegistration | null = null;

  public constructor(
    @IViewsService private readonly viewsService: IViewsService,
    @ISessionService private readonly sessionService: ISessionService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IFileConverterBackendService private readonly fileConverterBackendService: IFileConverterBackendService,
  ) {
    super();
    this._register(this.viewsService.onDidChangeViewVisibility(({ id }) => {
      if (id === TableViewId) {
        this.attachToTablePreviewDropTarget();
      }
    }));
    this._register(toDisposable(() => {
      this.disposeDropTarget();
    }));
    this.attachToTablePreviewDropTarget();
  }

  private attachToTablePreviewDropTarget(): void {
    const view = this.viewsService.getViewWithId(TableViewId);
    if (!isTablePreviewDropTargetView(view)) {
      this.disposeDropTarget();
      return;
    }

    const target = view.getDropTargetElement();
    if (this.dropTargetRegistration?.target === target) {
      return;
    }

    this.disposeDropTarget();
    const store = new DisposableStore();
    store.add(new DragAndDropObserver(target, {
      onDragEnter: event => this.onDragEnter(event, target),
      onDragLeave: () => this.setDragging(target, false),
      onDragOver: event => this.onDragOver(event, target),
      onDrop: event => void this.onDrop(event, target),
      onDragEnd: () => this.setDragging(target, false),
    }));
    this.dropTargetRegistration = {
      store,
      target,
    };
  }

  private disposeDropTarget(): void {
    const registration = this.dropTargetRegistration;
    if (!registration) {
      return;
    }

    this.setDragging(registration.target, false);
    registration.store.dispose();
    this.dropTargetRegistration = null;
  }

  private onDragEnter(event: DragEvent, target: HTMLElement): void {
    event.preventDefault();
    this.setDropEffect(event);
    this.setDragging(target, true);
  }

  private onDragOver(event: DragEvent, target: HTMLElement): void {
    event.preventDefault();
    this.setDropEffect(event);
    this.setDragging(target, true);
  }

  private async onDrop(event: DragEvent, target: HTMLElement): Promise<void> {
    event.preventDefault();
    this.setDragging(target, false);
    await this.importDroppedFiles(event.dataTransfer);
  }

  private setDropEffect(event: DragEvent): void {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  private setDragging(target: HTMLElement, isDragging: boolean): void {
    target.classList.toggle(TABLE_PREVIEW_DRAGGING_CLASS_NAME, isDragging);
  }

  private async importDroppedFiles(dataTransfer: DataTransfer | null): Promise<void> {
    const {
      errorMessage,
      preparedFiles,
    } = await prepareDroppedFilesForImport({
      dataTransfer,
      fileConverterBackend: this.fileConverterBackendService,
      selectedRelativePath: null,
    });

    if (!preparedFiles.length) {
      this.showImportError(errorMessage);
      return;
    }

    this.sessionService.commitFileImport(createFileImportResultFromRecords(
      preparedFiles.map(prepared => prepared.fileInfo.importRecord),
    ));

    this.selectImportedRawFile(preparedFiles);
    this.showImportError(errorMessage);
  }

  private selectImportedRawFile(preparedFiles: readonly PreparedFileImport[]): void {
    const readModel = createSessionReadModel(this.sessionService.getSnapshot());
    const rawFileIds = readModel.rawFiles
      .map(file => String(file.fileId ?? "").trim())
      .filter(fileId => fileId.length > 0);
    const selectedFileId = this.explorerService.selectedRawFileId ?? preparedFiles[0]?.fileInfo.fileId ?? null;
    if (!selectedFileId) {
      return;
    }

    this.explorerService.select({
      candidateFileIds: rawFileIds,
      fileId: selectedFileId,
      kind: "table",
    }, "force");
  }

  private showImportError(message: string | null): void {
    if (!message) {
      return;
    }

    notificationService.showToast({
      id: "dropIntoTablePreview.importError",
      message,
      type: "warning",
    });
  }
}

const isTablePreviewDropTargetView = (view: IView | null): view is TablePreviewDropTargetView =>
  Boolean(view && "getDropTargetElement" in view && typeof view.getDropTargetElement === "function");
