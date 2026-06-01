import { lxClose, lxCsvGreen } from "@chogng/lxicon";
import ContentView from "src/cs/base/browser/ui/contentView/contentView";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import {
  ObjectTree,
  type IObjectTreeOptions,
  type ITreeElementRenderDetails,
  type ITreeNode,
} from "src/cs/base/browser/ui/tree/objectTree";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { DATA_IMPORT_ACCEPT } from "src/cs/workbench/contrib/import/common/constants";
import type { ImporterFileEntry } from "src/cs/workbench/contrib/import/common/types";
import { toDomIdToken } from "src/cs/workbench/contrib/import/common/utils";
import {
  createImportSourceFile,
  type ImportSourceFile,
} from "src/cs/workbench/contrib/import/browser/importSourceFile";
import { createImportEmptyView } from "src/cs/workbench/contrib/import/browser/views/emptyView";
import {
  buildImportTree,
  collectImportTreeFolderKeys,
  getImportTreeFileName,
  type ImportTreeNode,
} from "src/cs/workbench/contrib/import/browser/views/importTreeModel";

export type ImportViewerProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly error?: string | null;
  readonly files: ImporterFileEntry[];
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onDropFiles: (dataTransfer: DataTransfer | null) => void | Promise<void>;
  readonly onListScroll: (event: Event) => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly onSelectFiles: (files: ImportSourceFile[]) => void;
  readonly t: TranslateFn;
};

const getImportViewerFileName = getImportTreeFileName;
const IMPORT_VIEWER_ROW_HEIGHT = 26;

type FileItemMeta = {
  readonly isWarning: boolean;
  readonly summary: string;
};

const getFileItemMeta = (fileEntry: ImporterFileEntry): FileItemMeta | null => {
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

const renderImportViewerFileItem = (
  fileEntry: ImporterFileEntry,
  isSelected: boolean,
  onRemove: (fileId: string | null) => void,
  container: HTMLElement,
) => {
  const fileName = getImportViewerFileName(fileEntry);
  const meta = getFileItemMeta(fileEntry);

  container.replaceChildren();
  container.className = "import-viewer-file-item";
  container.setAttribute("aria-label", "csv-file-item");
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
    container.id = `csv-file-item-${toDomIdToken(fileEntry.itemKey)}`;
    container.dataset.itemKey = fileEntry.itemKey;
  } else {
    container.removeAttribute("id");
    delete container.dataset.itemKey;
  }

  const content = document.createElement("div");
  content.className = "import-viewer-file-content";

  const icon = document.createElement("div");
  icon.className = "import-viewer-file-icon";
  appendIcon(icon, lxCsvGreen);

  const text = document.createElement("div");
  text.className = "import-viewer-file-text";

  const name = document.createElement("span");
  name.className = "import-viewer-file-name";
  name.textContent = fileName;
  text.appendChild(name);

  content.append(icon, text);

  const actions = document.createElement("div");
  actions.className = "import-viewer-file-actions";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "import-viewer-file-remove";
  removeButton.setAttribute("aria-label", "Remove CSV file");

  if (fileEntry?.itemKey) {
    removeButton.id = `csv-file-remove-${toDomIdToken(fileEntry.itemKey)}`;
    removeButton.dataset.itemKey = fileEntry.itemKey;
  }

  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    onRemove(fileEntry.fileId ?? null);
  });
  appendIcon(removeButton, lxClose);

  actions.appendChild(removeButton);
  container.append(content, actions);
};

const renderImportViewerFolderItem = (
  node: ImportTreeNode,
  isExpanded: boolean,
  container: HTMLElement,
) => {
  container.replaceChildren();
  container.className = "import-viewer-folder-item";
  container.title = node.name;

  const name = document.createElement("span");
  name.className = "import-viewer-folder-name";
  name.textContent = node.name;

  const count = document.createElement("span");
  count.className = "import-viewer-folder-count";
  count.textContent = String(node.children?.length ?? 0);

  container.dataset.expanded = isExpanded ? "true" : "false";
  container.append(name, count);
};

export class ImportViewerView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private readonly viewport: HTMLDivElement;
  private readonly filledRoot: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly treeView: ObjectTree<ImportTreeNode>;
  private readonly toast: Toast;
  private hoverView: ContentView | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private readonly listeners: Array<() => void> = [];
  private expandedKeys: string[] = [];
  private knownFolderKeys = new Set<string>();
  private props: ImportViewerProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImportViewerProps) {
    this.host = host;
    this.props = props;

    this.root = document.createElement("div");
    this.root.id = "analysis-csv-dropzone";
    this.root.className = "import-viewer-file-browser idle";

    this.fileInput = document.createElement("input");
    this.fileInput.id = "analysis-csv-file-input";
    this.fileInput.type = "file";
    this.fileInput.multiple = true;
    this.fileInput.accept = DATA_IMPORT_ACCEPT;
    this.fileInput.className = "import-viewer-file-input";
    this.fileInput.setAttribute("webkitdirectory", "");
    this.fileInput.setAttribute("directory", "");

    this.viewport = document.createElement("div");
    this.viewport.className = "import-viewer-file-browser-viewport";

    this.filledRoot = document.createElement("div");
    this.filledRoot.id = "analysis-import-scroll";
    this.filledRoot.className = "import-viewer-tree-root";

    this.listHost = document.createElement("div");
    this.listHost.className = "import-viewer-list-host";
    this.filledRoot.appendChild(this.listHost);

    this.treeView = new ObjectTree<ImportTreeNode>(
      this.listHost,
      this.createTreeOptions(),
    );
    this.toast = new Toast();

    this.viewport.append(this.filledRoot);
    this.root.append(this.fileInput, this.viewport);
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

  setProps(nextProps: ImportViewerProps): void {
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

  private createTreeOptions(): IObjectTreeOptions<ImportTreeNode> {
    const items = buildImportTree(this.props.files);
    const folderKeys = collectImportTreeFolderKeys(items);
    const expandedKeys = new Set(this.expandedKeys);
    for (const key of folderKeys) {
      if (!this.knownFolderKeys.has(key)) {
        expandedKeys.add(key);
      }
    }
    this.knownFolderKeys = new Set(folderKeys);
    this.expandedKeys = [...expandedKeys];

    return {
      className: "import-viewer-file-tree",
      getChildren: (node: ImportTreeNode) => node.children,
      getKey: (node: ImportTreeNode) => node.key,
      gap: 0,
      collapsedKeys: folderKeys.filter((key) => !expandedKeys.has(key)),
      empty: (container) => {
        container.replaceChildren(
          createImportEmptyView({
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
        getHeight: () => IMPORT_VIEWER_ROW_HEIGHT,
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
          node: ITreeNode<ImportTreeNode>,
          _index: number,
          container: HTMLElement,
          details: ITreeElementRenderDetails,
        ) => {
          const element = node.element;
          if (element.kind === "folder") {
            renderImportViewerFolderItem(element, !details.collapsed, container);
            return;
          }

          if (element.entry) {
            renderImportViewerFileItem(
              element.entry,
              this.props.effectiveSelectedFileId === element.entry.fileId,
              this.props.onRemoveFile,
              container,
            );
          }
        },
        disposeElement: (_node, _index, container) => {
          container.replaceChildren();
        },
      },
      selectedKey: this.props.effectiveSelectedFileId ?? null,
      viewportClassName: "import-viewer-file-tree-viewport",
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

  private readonly handleFileInputChange = (): void => {
    const files = Array.from(this.fileInput.files ?? []).map(createImportSourceFile);
    this.props.onSelectFiles(files);
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
    void this.props.onDropFiles(event.dataTransfer);
  };

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

    const item = target.closest(".import-viewer-file-item");
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
      className: "import-viewer-file-hover",
      host: this.root,
      render: (container) => {
        const summaryElement = document.createElement("div");
        summaryElement.className = "import-viewer-file-hover-summary";
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
