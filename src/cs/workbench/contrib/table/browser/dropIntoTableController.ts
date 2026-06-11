/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DragAndDropObserver } from "src/cs/base/browser/dom";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
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

type TableDropTargetView = IView & {
  readonly getDropTargetElement: () => HTMLElement;
};

export class DropIntoTableController extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.table.dropIntoTable";

  private readonly tableDropStore = this._register(new DisposableStore());
  private tableDropTarget: HTMLElement | null = null;

  public constructor(
    @IViewsService private readonly viewsService: IViewsService,
    @ISessionService private readonly sessionService: ISessionService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IFileConverterBackendService private readonly fileConverterBackendService: IFileConverterBackendService,
  ) {
    super();
    this._register(this.viewsService.onDidChangeViewVisibility(({ id }) => {
      if (id === TableViewId) {
        this.attachToTableDropTarget();
      }
    }));
    this.attachToTableDropTarget();
  }

  private attachToTableDropTarget(): void {
    const view = this.viewsService.getViewWithId(TableViewId);
    if (!isTableDropTargetView(view)) {
      return;
    }

    const target = view.getDropTargetElement();
    if (this.tableDropTarget === target) {
      return;
    }

    this.tableDropStore.clear();
    this.tableDropTarget = target;
    this.tableDropStore.add(new DragAndDropObserver(target, {
      onDragEnter: event => this.onDragEnter(event, target),
      onDragLeave: () => this.setDragging(target, false),
      onDragOver: event => this.onDragOver(event, target),
      onDrop: event => void this.onDrop(event, target),
      onDragEnd: () => this.setDragging(target, false),
    }));
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
    target.classList.toggle("dragging", isDragging);
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

    this.selectImportedTableFile(preparedFiles);
    this.showImportError(errorMessage);
  }

  private selectImportedTableFile(preparedFiles: readonly PreparedFileImport[]): void {
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
      id: "dropIntoTable.importError",
      message,
      type: "warning",
    });
  }
}

const isTableDropTargetView = (view: IView | null): view is TableDropTargetView =>
  Boolean(view && "getDropTargetElement" in view && typeof view.getDropTargetElement === "function");
