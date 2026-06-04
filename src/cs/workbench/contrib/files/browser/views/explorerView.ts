import { localize } from "src/cs/nls";
import { DragAndDropObserver } from "src/cs/base/browser/dom";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ResourceLabels } from "src/cs/workbench/browser/labels";
import { IMPORT_ERROR_TOAST_ID } from "src/cs/workbench/contrib/files/browser/fileConstants";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";

import "src/cs/workbench/contrib/files/browser/views/media/explorerView.css";

export type ExplorerViewProps = Omit<ExplorerViewerProps, "onOpenFileDialog"> & {
  readonly error?: string | null;
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onCreateFolder: (folderKey: string) => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onDropFiles: (dataTransfer: DataTransfer | null) => void;
  readonly onOpenFolderDialog: () => void;
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
    const labels = new ResourceLabels();
    this.explorerViewer = this.disposables.add(
      new ExplorerViewer(dom.listHost, this.root, this.createViewerProps(), labels),
    );
    this.disposables.add(labels);
    this.disposables.add(createFileIconThemableTreeContainerScope(this.root));

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
      new DragAndDropObserver(this.viewport, {
        onDragEnter: this.handleDragEnter,
        onDragLeave: this.handleDragLeave,
        onDragOver: this.handleDragOver,
        onDrop: this.handleDrop,
        onDragEnd: this.handleDragEnd,
      }),
    );
  }

  private createViewerProps(): ExplorerViewerProps {
    return {
      effectiveSelectedFileId: this.props.effectiveSelectedFileId,
      files: this.props.files,
      onListScroll: this.props.onListScroll,
      onCreateFolder: this.props.onCreateFolder,
      onOpenFileDialog: () => this.openFileDialog(),
      onRemoveFile: this.props.onRemoveFile,
      onRemoveFolder: this.props.onRemoveFolder,
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

  private readonly handleDragEnter = (event: DragEvent): void => {
    event.preventDefault();
    this.setDropEffect(event);
    this.props.onDraggingChange(true);
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
    this.setDropEffect(event);
    this.props.onDraggingChange(true);
  };

  private readonly handleDragLeave = (): void => {
    this.props.onDraggingChange(false);
  };

  private readonly handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.props.onDraggingChange(false);
    this.props.onDropFiles(event.dataTransfer);
  };

  private readonly handleDragEnd = (): void => {
    this.props.onDraggingChange(false);
  };

  private setDropEffect(event: DragEvent): void {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    const { error, isDragging } = this.props;

    this.root.setAttribute("aria-label", localize("files.explorerSection", "资源管理器"));
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);

    this.explorerViewer.setProps(this.createViewerProps());

    if (!error) {
      notificationService.hideToast(IMPORT_ERROR_TOAST_ID);
      return;
    }

    notificationService.showToast({
      className: "conductor-toast--import-error",
      dataUi: "analysis-import-error-toast",
      duration: Number.POSITIVE_INFINITY,
      id: IMPORT_ERROR_TOAST_ID,
      message: error,
      onClose: this.props.onClearError,
      position: "fixed",
      type: "error",
    });
  }
}

export function createFileIconThemableTreeContainerScope(container: HTMLElement): IDisposable {
  container.classList.add("file-icon-themable-tree", "show-file-icons");
  return toDisposable(() => {
    container.classList.remove("file-icon-themable-tree", "show-file-icons");
  });
}
