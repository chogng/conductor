import { localize } from "src/cs/nls";
import { addDisposableListener } from "src/cs/base/browser/dom";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  type FileSource,
  collectDroppedFiles,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";

import "src/cs/workbench/contrib/files/browser/views/media/explorerView.css";

const IMPORT_ERROR_TOAST_ID = "files.importError";

export type ExplorerViewProps = Omit<ExplorerViewerProps, "onOpenFileDialog"> & {
  readonly error?: string | null;
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onOpenFolderDialog: () => void;
  readonly onSelectFiles: (files: FileSource[]) => void;
};

export class ExplorerView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly disposables = new DisposableStore();
  private readonly explorerViewer: ExplorerViewer;
  private props: ExplorerViewProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ExplorerViewProps) {
    this.host = host;
    this.props = props;
    const dom = this.createDom();
    this.root = dom.root;
    this.viewport = dom.viewport;
    this.explorerViewer = this.disposables.add(
      new ExplorerViewer(dom.listHost, this.root, this.createViewerProps()),
    );

    this.host.appendChild(this.root);

    this.registerEvents();
    this.render();
  }

  getListHandle(): ListHandle {
    return this.explorerViewer.getListHandle();
  }

  openFileDialog(): void {
    this.props.onOpenFolderDialog();
  }

  setProps(nextProps: ExplorerViewProps): void {
    this.props = nextProps;
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    notificationService.disposeToast(IMPORT_ERROR_TOAST_ID);
    this.disposables.dispose();
    this.root.remove();
  }

  private registerEvents(): void {
    this.disposables.add(
      addDisposableListener(this.root, "click", this.handleRootClick),
    );
    this.disposables.add(
      addDisposableListener(this.viewport, "dragover", this.handleDragOver),
    );
    this.disposables.add(
      addDisposableListener(this.viewport, "dragleave", this.handleDragLeave),
    );
    this.disposables.add(
      addDisposableListener(this.viewport, "drop", this.handleDrop),
    );
  }

  private createViewerProps(): ExplorerViewerProps {
    return {
      effectiveSelectedFileId: this.props.effectiveSelectedFileId,
      files: this.props.files,
      onListScroll: this.props.onListScroll,
      onOpenFileDialog: () => this.openFileDialog(),
      onRemoveFile: this.props.onRemoveFile,
      onSelectFile: this.props.onSelectFile,
      cleanedData: this.props.cleanedData,
    };
  }

  private createDom(): {
    readonly filledRoot: HTMLDivElement;
    readonly listHost: HTMLDivElement;
    readonly root: HTMLDivElement;
    readonly viewport: HTMLDivElement;
  } {
    const root = document.createElement("div");
    root.className = "file-list idle";

    const viewport = document.createElement("div");
    viewport.className = "file-list-viewport";

    const filledRoot = document.createElement("div");
    filledRoot.className = "file-list-tree-root";

    const listHost = document.createElement("div");
    listHost.className = "file-list-host";
    filledRoot.appendChild(listHost);

    viewport.append(filledRoot);
    root.append(viewport);

    return { filledRoot, listHost, root, viewport };
  }

  private readonly handleRootClick = (event: MouseEvent): void => {
    if (this.props.files.length > 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("button, input, a, [role='button']")
    ) {
      return;
    }

    this.openFileDialog();
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
    this.props.onDraggingChange(true);
  };

  private readonly handleDragLeave = (event: DragEvent): void => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && this.viewport.contains(relatedTarget)) {
      return;
    }

    this.props.onDraggingChange(false);
  };

  private readonly handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.props.onDraggingChange(false);
    void this.selectDroppedFiles(event.dataTransfer);
  };

  private async selectDroppedFiles(dataTransfer: DataTransfer | null): Promise<void> {
    if (!dataTransfer) {
      this.props.onSelectFiles([]);
      return;
    }

    this.props.onSelectFiles(await collectDroppedFiles(dataTransfer));
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    const { error, isDragging } = this.props;

    this.root.setAttribute("aria-label", localize("files.importSection", "Import Files"));
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);

    this.explorerViewer.setProps(this.createViewerProps());

    if (!error) {
      notificationService.hideToast(IMPORT_ERROR_TOAST_ID);
      return;
    }

    notificationService.showToast({
      dataUi: "analysis-import-error-toast",
      id: IMPORT_ERROR_TOAST_ID,
      message: error,
      onClose: this.props.onClearError,
      position: "fixed",
      type: "error",
    });
  }
}
