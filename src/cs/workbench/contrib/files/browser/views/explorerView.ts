import { addDisposableListener } from "src/cs/base/browser/dom";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import Toast from "src/cs/base/browser/ui/toast/toast";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { DATA_FILE_ACCEPT } from "src/cs/workbench/contrib/files/common/files";
import {
  type FileSource,
  collectDroppedFiles,
  collectInputFiles,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";

import "src/cs/workbench/contrib/files/browser/views/media/explorerView.css";

export type ExplorerViewProps = Omit<ExplorerViewerProps, "onOpenFileDialog"> & {
  readonly error?: string | null;
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onSelectFiles: (files: FileSource[]) => void;
};

export class ExplorerView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private readonly viewport: HTMLDivElement;
  private readonly toast: Toast;
  private readonly disposables = new DisposableStore();
  private readonly explorerViewer: ExplorerViewer;
  private props: ExplorerViewProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ExplorerViewProps) {
    this.host = host;
    this.props = props;
    const dom = this.createDom();
    this.root = dom.root;
    this.fileInput = dom.fileInput;
    this.viewport = dom.viewport;
    this.explorerViewer = this.disposables.add(
      new ExplorerViewer(dom.listHost, this.root, this.createViewerProps()),
    );
    this.toast = this.disposables.add(new Toast());

    this.host.appendChild(this.root);

    this.registerEvents();
    this.render();
  }

  getListHandle(): ListHandle {
    return this.explorerViewer.getListHandle();
  }

  openFileDialog(): void {
    this.fileInput.click();
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
    this.disposables.dispose();
    this.root.remove();
  }

  private registerEvents(): void {
    this.disposables.add(
      addDisposableListener(this.fileInput, "change", this.handleFileInputChange),
    );
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
      t: this.props.t,
    };
  }

  private createDom(): {
    readonly fileInput: HTMLInputElement;
    readonly filledRoot: HTMLDivElement;
    readonly listHost: HTMLDivElement;
    readonly root: HTMLDivElement;
    readonly viewport: HTMLDivElement;
  } {
    const root = document.createElement("div");
    root.className = "file-list idle";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = DATA_FILE_ACCEPT;
    fileInput.className = "file-list-input";
    fileInput.setAttribute("webkitdirectory", "");
    fileInput.setAttribute("directory", "");

    const viewport = document.createElement("div");
    viewport.className = "file-list-viewport";

    const filledRoot = document.createElement("div");
    filledRoot.className = "file-list-tree-root";

    const listHost = document.createElement("div");
    listHost.className = "file-list-host";
    filledRoot.appendChild(listHost);

    viewport.append(filledRoot);
    root.append(fileInput, viewport);

    return { fileInput, filledRoot, listHost, root, viewport };
  }

  private readonly handleFileInputChange = (): void => {
    const files = collectInputFiles(this.fileInput.files);
    if (files.length > 0) {
      this.props.onSelectFiles(files);
    }
    this.fileInput.value = "";
  };

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

    const { error, isDragging, t } = this.props;

    this.root.setAttribute("aria-label", t("da_import_section"));
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);
    this.fileInput.setAttribute(
      "aria-label",
      localize("files.importFolderAriaLabel", "导入文件夹"),
    );

    this.explorerViewer.setProps(this.createViewerProps());

    if (!error) {
      this.toast.hide();
      return;
    }

    this.toast.show({
      dataUi: "analysis-import-error-toast",
      message: error,
      onClose: this.props.onClearError,
      position: "fixed",
      type: "error",
    });
  }
}
