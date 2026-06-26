/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { DragAndDropObserver } from "src/cs/base/browser/dom";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ResourceLabels } from "src/cs/workbench/browser/labels";
import {
  ExplorerViewer,
  type ExplorerViewerProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerViewer";

import "src/cs/workbench/contrib/files/browser/views/media/explorerView.css";

export type ExplorerViewProps = Omit<ExplorerViewerProps, "onOpenFileDialog"> & {
  readonly isDragging: boolean;
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
      new ExplorerViewer(dom.filledRoot, this.root, this.createViewerProps(), labels),
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
      selectedFileId: this.props.selectedFileId,
      selectedItemKey: this.props.selectedItemKey,
      expandedFolderKeys: this.props.expandedFolderKeys,
      explorerAppearance: this.props.explorerAppearance,
      activePlotType: this.props.activePlotType,
      commandService: this.props.commandService,
      contextMenuService: this.props.contextMenuService,
      contextViewService: this.props.contextViewService,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      thumbnailPreviewService: this.props.thumbnailPreviewService,
      thumbnailService: this.props.thumbnailService,
      fileTemplateSelectionsByFileId: this.props.fileTemplateSelectionsByFileId,
      editable: this.props.editable,
      templateRecords: this.props.templateRecords,
      files: this.props.files,
      folderImportSupport: this.props.folderImportSupport,
      mode: this.props.mode,
      viewLayout: this.props.viewLayout,
      onListScroll: this.props.onListScroll,
      onVisibleFileIdsChange: this.props.onVisibleFileIdsChange,
      onFolderExpansionChange: this.props.onFolderExpansionChange,
      onFolderKeysChange: this.props.onFolderKeysChange,
      onOpenFileDialog: this.props.onOpenFolderDialog,
      onRemoveFolder: this.props.onRemoveFolder,
      onRequestTemplates: this.props.onRequestTemplates,
      onHoverFileChange: this.props.onHoverFileChange,
      onCancelRenameFile: this.props.onCancelRenameFile,
      onRenameFile: this.props.onRenameFile,
      onSelectFile: this.props.onSelectFile,
      thumbnailFiles: this.props.thumbnailFiles,
      thumbnailPlotModelsByFileId: this.props.thumbnailPlotModelsByFileId,
    };
  }

  private createDom(): {
    readonly filledRoot: HTMLDivElement;
    readonly root: HTMLDivElement;
    readonly viewport: HTMLDivElement;
  } {
    const root = document.createElement("div");
    root.className = "file-list idle";

    const viewport = document.createElement("div");
    viewport.className = "file-list-viewport";

    const filledRoot = document.createElement("div");
    filledRoot.className = "file-list-tree-root";

    viewport.append(filledRoot);
    root.append(viewport);

    return { filledRoot, root, viewport };
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

    const { isDragging } = this.props;

    this.root.setAttribute("aria-label", localize("files.explorerSection", "Explorer"));
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);

    this.explorerViewer.setProps(this.createViewerProps());
  }
}

export function createFileIconThemableTreeContainerScope(container: HTMLElement): IDisposable {
  container.classList.add("file-icon-themable-tree", "show-file-icons");
  return toDisposable(() => {
    container.classList.remove("file-icon-themable-tree", "show-file-icons");
  });
}
