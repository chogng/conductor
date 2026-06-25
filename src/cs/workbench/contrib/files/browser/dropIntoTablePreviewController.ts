/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DragAndDropObserver } from "src/cs/base/browser/dom";
import { Disposable, DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
  commitExplorerTableFileImport,
} from "src/cs/workbench/contrib/files/browser/explorerTableFileImport";
import {
  prepareDroppedFilesForImport,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import { IFileConverterBackendService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { ITableDropTargetService } from "src/cs/workbench/services/table/browser/tableDropTargetService";

type TablePreviewDropTargetRegistration = {
  readonly store: DisposableStore;
  readonly target: HTMLElement;
};

type DropImportServices = {
  readonly explorerService: IExplorerService;
  readonly fileConverterBackendService: IFileConverterBackendService;
  readonly notificationService: INotificationService;
  readonly sessionService: ISessionService;
};

const TABLE_PREVIEW_DRAGGING_CLASS_NAME = "workbench_preview_area_part--dragging";

export class DropIntoTablePreviewController extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.files.dropIntoTablePreview";

  private dropTargetRegistration: TablePreviewDropTargetRegistration | null = null;

  public constructor(
    @ITableDropTargetService private readonly tableDropTargetService: ITableDropTargetService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super();
    this._register(this.tableDropTargetService.onDidChangeDropTarget(target => {
      this.attachToTablePreviewDropTarget(target);
    }));
    this._register(toDisposable(() => {
      this.disposeDropTarget();
    }));
    this.attachToTablePreviewDropTarget(this.tableDropTargetService.getDropTargetElement());
  }

  private attachToTablePreviewDropTarget(target: HTMLElement | null): void {
    if (!target) {
      this.disposeDropTarget();
      return;
    }

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
    return this.instantiationService.invokeFunction(accessor => this.importDroppedFilesWithServices(
      dataTransfer,
      {
        explorerService: accessor.get(IExplorerService),
        fileConverterBackendService: accessor.get(IFileConverterBackendService),
        notificationService: accessor.get(INotificationService),
        sessionService: accessor.get(ISessionService),
      },
    ));
  }

  private async importDroppedFilesWithServices(
    dataTransfer: DataTransfer | null,
    services: DropImportServices,
  ): Promise<void> {
    const {
      errorMessage,
      preparedFiles,
    } = await prepareDroppedFilesForImport({
      dataTransfer,
      fileConverterBackend: services.fileConverterBackendService,
      selectedRelativePath: null,
    });

    if (!preparedFiles.length) {
      this.showImportError(errorMessage, services.notificationService);
      return;
    }

    commitExplorerTableFileImport({
      explorerService: services.explorerService,
      importedFiles: preparedFiles.map(prepared => prepared.fileInfo),
      mode: "append",
      sessionService: services.sessionService,
    });
    this.showImportError(errorMessage, services.notificationService);
  }

  private showImportError(
    message: string | null,
    notificationService: INotificationService,
  ): void {
    if (!message) {
      return;
    }

    notificationService.notify({
      id: "dropIntoTablePreview.importError",
      message,
      severity: Severity.Warning,
    });
  }
}
