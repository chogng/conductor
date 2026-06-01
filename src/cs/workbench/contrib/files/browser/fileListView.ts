import { lxClose, lxCsvGreen } from "@chogng/lxicon";
import ContentView from "src/cs/base/browser/ui/contentView/contentView";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import Toast from "src/cs/base/browser/ui/toast/toast";
import {
  ObjectTree,
  type IObjectTreeOptions,
  type ITreeElementRenderDetails,
  type ITreeNode,
} from "src/cs/base/browser/ui/tree/objectTree";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  DATA_FILE_ACCEPT,
  type FileEntry,
} from "src/cs/workbench/contrib/files/common/files";
import {
  createFileSource,
  type FileSource,
} from "src/cs/workbench/contrib/files/browser/sourceFile";
import { collectDroppedFiles } from "src/cs/workbench/contrib/files/browser/fileDrop";
import { createEmptyFileListView } from "src/cs/workbench/contrib/files/browser/emptyView";
import {
  buildFileTree,
  collectFileTreeFolderKeys,
  getTreeFileName,
  type FileTreeNode,
} from "src/cs/workbench/contrib/files/browser/fileTreeModel";

import "src/cs/workbench/contrib/files/browser/media/fileList.css";

export type FileListViewProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly error?: string | null;
  readonly files: FileEntry[];
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onListScroll: (event: Event) => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly onSelectFiles: (files: FileSource[]) => void;
  readonly t: TranslateFn;
};

const getFileName = getTreeFileName;
const FILE_ROW_HEIGHT = 28;

type FileItemMeta = {
  readonly isWarning: boolean;
  readonly summary: string;
};

const getFileItemMeta = (fileEntry: FileEntry): FileItemMeta | null => {
  if (!fileEntry?.curveType) {
    return null;
  }

  const summary = `Auto: ${String(fileEntry.curveType).trim()}${
    fileEntry?.curveTypeConfidence
      ? ` (${String(fileEntry.curveTypeConfidence).trim()})`
      : ""
  }`;

  return {
    isWarning:
      fileEntry?.curveTypeNeedsTemplate === true ||
      fileEntry?.curveTypeConfidence === "low",
    summary,
  };
};

const appendIcon = (
  container: HTMLElement,
  icon: () => string,
  size = 16,
) => {
  const iconSpan = document.createElement("span");
  iconSpan.className = "ui-lxicon";
  iconSpan.style.width = `${size}px`;
  iconSpan.style.height = `${size}px`;
  iconSpan.innerHTML = normalizeLxIconSvgMarkup(icon);
  container.appendChild(iconSpan);
};

export class FileListView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private readonly viewport: HTMLDivElement;
  private readonly filledRoot: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly treeView: ObjectTree<FileTreeNode>;
  private readonly toast: Toast;
  private hoverView: ContentView | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private readonly listeners: Array<() => void> = [];
  private expandedKeys: string[] = [];
  private knownFolderKeys = new Set<string>();
  private props: FileListViewProps;
  private disposed = false;

  constructor(host: HTMLElement, props: FileListViewProps) {
    this.host = host;
    this.props = props;
    const dom = this.createDom();
    this.root = dom.root;
    this.fileInput = dom.fileInput;
    this.viewport = dom.viewport;
    this.filledRoot = dom.filledRoot;
    this.listHost = dom.listHost;

    this.treeView = new ObjectTree<FileTreeNode>(
      this.listHost,
      this.createTreeOptions(),
    );
    this.toast = new Toast();

    this.host.appendChild(this.root);

    this.registerEvents();
    this.render();
  }

  getListHandle(): ListHandle {
    return this.treeView;
  }

  openFileDialog(): void {
    this.fileInput.click();
  }

  setProps(nextProps: FileListViewProps): void {
    this.props = nextProps;
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.hideFileItemHover();
    this.toast.dispose();
    this.treeView.dispose();
    for (const dispose of this.listeners) {
      dispose();
    }
    this.listeners.length = 0;
    this.root.remove();
  }

  private createTreeOptions(): IObjectTreeOptions<FileTreeNode> {
    const items = buildFileTree(this.props.files);
    const folderKeys = collectFileTreeFolderKeys(items);
    const expandedKeys = new Set(this.expandedKeys);
    for (const key of folderKeys) {
      if (!this.knownFolderKeys.has(key)) {
        expandedKeys.add(key);
      }
    }
    this.knownFolderKeys = new Set(folderKeys);
    this.expandedKeys = [...expandedKeys];

    return {
      className: "file-list-tree",
      getChildren: (node: FileTreeNode) => node.children,
      getKey: (node: FileTreeNode) => node.key,
      gap: 0,
      collapsedKeys: folderKeys.filter((key) => !expandedKeys.has(key)),
      empty: (container) => {
        container.replaceChildren(
          createEmptyFileListView({
            onImportFiles: () => this.openFileDialog(),
            t: this.props.t,
          }),
        );
      },
      disposeEmpty: (container) => {
        container.replaceChildren();
      },
      items,
      minVirtualCount: 200,
      delegate: {
        getHeight: () => FILE_ROW_HEIGHT,
      },
      onDidChangeCollapseState: (collapsedKeys) => {
        const collapsed = new Set(collapsedKeys);
        this.expandedKeys = folderKeys.filter((key) => !collapsed.has(key));
      },
      onScroll: (event) => this.props.onListScroll(event),
      onSelect: ({ element }) => {
        if (element.kind === "folder") {
          return;
        }
        this.props.onSelectFile(element.entry?.fileId ?? null);
      },
      renderer: {
        renderElement: (
          node: ITreeNode<FileTreeNode>,
          _index: number,
          container: HTMLElement,
          details: ITreeElementRenderDetails,
        ) => this.renderTreeElement(node, container, details),
        disposeElement: (_node, _index, container) => {
          container.replaceChildren();
        },
      },
      selectedKey: this.props.effectiveSelectedFileId ?? null,
      viewportClassName: "file-list-tree-viewport",
    };
  }

  private registerEvents(): void {
    this.fileInput.addEventListener("change", this.handleFileInputChange);
    this.root.addEventListener("click", this.handleRootClick);
    this.viewport.addEventListener("dragover", this.handleDragOver);
    this.viewport.addEventListener("dragleave", this.handleDragLeave);
    this.viewport.addEventListener("drop", this.handleDrop);
    this.listHost.addEventListener("mouseover", this.handleListMouseOver);
    this.listHost.addEventListener("mouseout", this.handleListMouseOut);
    this.listHost.addEventListener("focusin", this.handleListFocusIn);
    this.listHost.addEventListener("focusout", this.handleListFocusOut);

    this.listeners.push(() =>
      this.fileInput.removeEventListener("change", this.handleFileInputChange),
    );
    this.listeners.push(() =>
      this.root.removeEventListener("click", this.handleRootClick),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("dragover", this.handleDragOver),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("dragleave", this.handleDragLeave),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("drop", this.handleDrop),
    );
    this.listeners.push(() =>
      this.listHost.removeEventListener("mouseover", this.handleListMouseOver),
    );
    this.listeners.push(() =>
      this.listHost.removeEventListener("mouseout", this.handleListMouseOut),
    );
    this.listeners.push(() =>
      this.listHost.removeEventListener("focusin", this.handleListFocusIn),
    );
    this.listeners.push(() =>
      this.listHost.removeEventListener("focusout", this.handleListFocusOut),
    );
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
    fileInput.multiple = true;
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

  private renderTreeElement(
    node: ITreeNode<FileTreeNode>,
    container: HTMLElement,
    details: ITreeElementRenderDetails,
  ): void {
    const element = node.element;
    if (element.kind === "folder") {
      this.renderFolderItem(element, !details.collapsed, container);
      return;
    }

    if (element.entry) {
      this.renderFileItem(
        element.entry,
        this.props.effectiveSelectedFileId === element.entry.fileId,
        container,
      );
    }
  }

  private renderFileItem(
    fileEntry: FileEntry,
    isSelected: boolean,
    container: HTMLElement,
  ): void {
    const fileName = getFileName(fileEntry);
    const meta = getFileItemMeta(fileEntry);

    container.replaceChildren();
    container.className = "file-list-item";
    container.setAttribute(
      "aria-label",
      this.props.t("import.fileItemAriaLabel", { fileName }),
    );
    container.title = fileName;
    if (isSelected) {
      container.dataset.selected = "true";
    } else {
      delete container.dataset.selected;
    }
    if (meta) {
      container.dataset.autoSummary = meta.summary;
      container.dataset.autoWarning = meta.isWarning ? "true" : "false";
    } else {
      delete container.dataset.autoSummary;
      delete container.dataset.autoWarning;
    }

    if (fileEntry?.itemKey) {
      container.dataset.itemKey = fileEntry.itemKey;
    } else {
      delete container.dataset.itemKey;
    }

    const content = document.createElement("div");
    content.className = "file-list-item-content";

    const icon = document.createElement("div");
    icon.className = "file-list-item-icon";
    appendIcon(icon, lxCsvGreen);

    const text = document.createElement("div");
    text.className = "file-list-item-text";

    const name = document.createElement("span");
    name.className = "file-list-item-name";
    name.textContent = fileName;
    text.appendChild(name);

    content.append(icon, text);

    const actions = document.createElement("div");
    actions.className = "file-list-item-actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "file-list-item-remove";
    removeButton.setAttribute(
      "aria-label",
      this.props.t("import.removeFileButtonLabel", { fileName }),
    );

    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.props.onRemoveFile(fileEntry.fileId ?? null);
    });
    appendIcon(removeButton, lxClose);

    actions.appendChild(removeButton);
    container.append(content, actions);
  }

  private renderFolderItem(
    node: FileTreeNode,
    isExpanded: boolean,
    container: HTMLElement,
  ): void {
    container.replaceChildren();
    container.className = "file-list-folder-item";
    container.title = node.name;

    const name = document.createElement("span");
    name.className = "file-list-folder-name";
    name.textContent = node.name;

    const count = document.createElement("span");
    count.className = "file-list-folder-count";
    count.textContent = String(node.children?.length ?? 0);

    container.dataset.expanded = isExpanded ? "true" : "false";
    container.append(name, count);
  }

  private readonly handleFileInputChange = (): void => {
    const files = Array.from(this.fileInput.files ?? []).map(createFileSource);
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

  private readonly handleListMouseOver = (event: MouseEvent): void => {
    const item = this.getFileItemFromEvent(event);
    if (item) {
      this.showFileItemHover(item);
    }
  };

  private readonly handleListMouseOut = (event: MouseEvent): void => {
    const item = this.getFileItemFromEvent(event);
    const relatedTarget = event.relatedTarget;
    if (
      item &&
      !(relatedTarget instanceof Node && item.contains(relatedTarget))
    ) {
      this.hideFileItemHover(item);
    }
  };

  private readonly handleListFocusIn = (event: FocusEvent): void => {
    const item = this.getFileItemFromEvent(event);
    if (item) {
      this.showFileItemHover(item);
    }
  };

  private readonly handleListFocusOut = (event: FocusEvent): void => {
    const item = this.getFileItemFromEvent(event);
    const relatedTarget = event.relatedTarget;
    if (
      item &&
      !(relatedTarget instanceof Node && item.contains(relatedTarget))
    ) {
      this.hideFileItemHover(item);
    }
  };

  private getFileItemFromEvent(event: Event): HTMLElement | null {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const item = target.closest(".file-list-item");
    return item instanceof HTMLElement ? item : null;
  }

  private showFileItemHover(item: HTMLElement): void {
    const summary = item.dataset.autoSummary;
    if (!summary) {
      this.hideFileItemHover();
      return;
    }

    if (this.hoverAnchor === item && this.hoverView) {
      return;
    }

    this.hideFileItemHover();
    this.hoverAnchor = item;
    this.hoverView = new ContentView({
      align: "left",
      anchor: item,
      className: "file-list-hover",
      host: this.root,
      render: (container) => {
        const summaryElement = document.createElement("div");
        summaryElement.className = "file-list-hover-summary";
        summaryElement.dataset.warning =
          item.dataset.autoWarning === "true" ? "true" : "false";
        summaryElement.textContent = summary;
        container.appendChild(summaryElement);
      },
      role: "tooltip",
      side: "right",
      zIndex: 40,
    });
    this.hoverView.show();
  }

  private hideFileItemHover(item?: HTMLElement): void {
    if (item && this.hoverAnchor !== item) {
      return;
    }

    this.hoverAnchor = null;
    this.hoverView?.dispose();
    this.hoverView = null;
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    const { error, isDragging, t } = this.props;

    this.root.setAttribute("aria-label", t("da_import_section"));
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);
    this.fileInput.setAttribute("aria-label", t("da_import_csv"));

    this.treeView.update(this.createTreeOptions());
    if (
      this.hoverAnchor &&
      (!this.listHost.contains(this.hoverAnchor) || !this.hoverAnchor.dataset.autoSummary)
    ) {
      this.hideFileItemHover();
    }

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
