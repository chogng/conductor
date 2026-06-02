import { lxClose, lxCsvGreen } from "@chogng/lxicon";
import { addDisposableListener } from "src/cs/base/browser/dom";
import ContentView from "src/cs/base/browser/ui/contentView/contentView";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import {
  ObjectTree,
  type IObjectTreeOptions,
  type ITreeElementRenderDetails,
  type ITreeNode,
} from "src/cs/base/browser/ui/tree/objectTree";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import type { ProcessedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  buildFileTree,
  collectFileTreeFolderKeys,
  getTreeFileName,
  type FileTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { createEmptyView } from "src/cs/workbench/contrib/files/browser/views/emptyView";
import { createThumbnailView } from "src/cs/workbench/contrib/thumbnail/browser/ThumbnailView";

export type ExplorerViewerProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly files: FileEntry[];
  readonly onListScroll: (event: Event) => void;
  readonly onOpenFileDialog: () => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly processedData?: ProcessedEntry[];
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

  const curveType = String(fileEntry.curveType).trim();
  const confidence = fileEntry?.curveTypeConfidence
    ? ` (${String(fileEntry.curveTypeConfidence).trim()})`
    : "";
  const summary = localize("files.autoSummary", "自动识别：{curveType}{confidence}", {
    curveType,
    confidence,
  });

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

export class ExplorerViewer implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly treeView: ObjectTree<FileTreeNode>;
  private hoverView: ContentView | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private expandedKeys: string[] = [];
  private knownFolderKeys = new Set<string>();
  private props: ExplorerViewerProps;

  constructor(
    host: HTMLElement,
    private readonly hoverHost: HTMLElement,
    props: ExplorerViewerProps,
  ) {
    this.props = props;
    this.treeView = this.disposables.add(
      new ObjectTree<FileTreeNode>(
        host,
        this.createTreeOptions(),
      ),
    );

    this.disposables.add(
      addDisposableListener(host, "mouseover", this.handleListMouseOver),
    );
    this.disposables.add(
      addDisposableListener(host, "mouseout", this.handleListMouseOut),
    );
    this.disposables.add(
      addDisposableListener(host, "focusin", this.handleListFocusIn),
    );
    this.disposables.add(
      addDisposableListener(host, "focusout", this.handleListFocusOut),
    );
  }

  getListHandle(): ListHandle {
    return this.treeView;
  }

  setProps(nextProps: ExplorerViewerProps): void {
    this.props = nextProps;
    this.treeView.update(this.createTreeOptions());
    if (
      this.hoverAnchor &&
      (!this.hoverHost.contains(this.hoverAnchor) || !this.hasFileItemHoverContent(this.hoverAnchor))
    ) {
      this.hideFileItemHover();
    }
  }

  dispose(): void {
    this.hideFileItemHover();
    this.disposables.dispose();
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
          createEmptyView({
            onImportFiles: this.props.onOpenFileDialog,
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
    if (fileEntry?.fileId) {
      container.dataset.fileId = fileEntry.fileId;
    } else {
      delete container.dataset.fileId;
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

  private getProcessedFile(fileId: string | null | undefined): ProcessedEntry | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    return (Array.isArray(this.props.processedData) ? this.props.processedData : [])
      .find((entry) => String(entry?.fileId ?? "").trim() === normalizedFileId) ?? null;
  }

  private hasFileItemHoverContent(item: HTMLElement): boolean {
    return Boolean(
      this.getProcessedFile(item.dataset.fileId) ||
      item.dataset.autoSummary,
    );
  }

  private showFileItemHover(item: HTMLElement): void {
    const summary = item.dataset.autoSummary;
    const processedFile = this.getProcessedFile(item.dataset.fileId);
    if (!processedFile && !summary) {
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
      className: processedFile
        ? "file-list-hover file-list-hover--thumbnail"
        : "file-list-hover",
      host: this.hoverHost,
      render: (container) => {
        if (processedFile) {
          container.appendChild(createThumbnailView({
            file: processedFile,
            isActive: item.dataset.selected === "true",
          }));
          return;
        }

        const summaryElement = document.createElement("div");
        summaryElement.className = "file-list-hover-summary";
        summaryElement.dataset.warning =
          item.dataset.autoWarning === "true" ? "true" : "false";
        summaryElement.textContent = summary ?? "";
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
}
