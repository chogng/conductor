import { addDisposableListener } from "src/cs/base/browser/dom";
import { CountBadge } from "src/cs/base/browser/ui/countbadge/countBadge";
import { createDropdownButton } from "src/cs/base/browser/ui/dropdown/dropdown";
import {
  createMenuAction,
  createMenuItemLabel,
  renderMenuItems,
} from "src/cs/base/browser/ui/menu/menu";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import {
  ObjectTree,
  type IObjectTreeOptions,
  type ITreeElementRenderDetails,
  type ITreeNode,
  type ITreeRenderer,
  type ITreeSelectionEvent,
} from "src/cs/base/browser/ui/tree/objectTree";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { AnchorAxisAlignment, AnchorPosition } from "src/cs/base/common/layout";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import type { IAction } from "src/cs/base/common/actions";
import type {
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";
import { localize } from "src/cs/nls";
import type {
  FileEntry,
  FilesViewMode,
} from "src/cs/workbench/contrib/files/common/files";
import { ResourceLabels, type IResourceLabel } from "src/cs/workbench/browser/labels";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  getCalculatedData,
  type CalculatedData,
  type CalculatedDataByKey,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { FolderImportSupport } from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  buildFileTree,
  collectFileTreeFolderKeys,
  getTreeFileName,
  type FileTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { FileKind } from "src/cs/workbench/contrib/files/common/getIconClasses";
import { createEmptyView } from "src/cs/workbench/contrib/files/browser/views/emptyView";
import {
  createThumbnailView,
  type CleanedFileLike,
} from "src/cs/workbench/contrib/thumbnail/browser/ThumbnailView";
import type { IThumbnailService } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailService";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";

export type ExplorerViewerProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly activePlotType?: PlotType;
  readonly calculatedDataByKey?: CalculatedDataByKey;
  readonly contextViewService: IContextViewService;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly thumbnailService: IThumbnailService;
  readonly files: FileEntry[];
  readonly viewMode?: FilesViewMode;
  readonly folderImportSupport?: FolderImportSupport;
  readonly onListScroll: (event: Event) => void;
  readonly onCreateFolder: (folderKey: string) => void;
  readonly onOpenFileDialog: () => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onRemoveFolder: (folderKey: string) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly cleanedData?: CleanedEntry[];
};

const getFileName = getTreeFileName;
const FILE_ROW_HEIGHT = 28;
const FILE_HOVER_HIDE_DELAY_MS = 120;
const HOVER_THUMBNAIL_CACHE_LIMIT = 12;

type FileItemMeta = {
  readonly isWarning: boolean;
  readonly summary: string;
};

type FileItemTemplate = {
  readonly actions: HTMLDivElement;
  readonly content: HTMLDivElement;
  fileId: string | null;
  readonly host: HTMLElement;
  readonly label: IResourceLabel;
  readonly removeButton: HTMLButtonElement;
};

type FolderItemTemplate = {
  actionButton: IDisposable;
  readonly content: HTMLDivElement;
  currentNode: FileTreeNode | null;
  readonly controls: HTMLDivElement;
  readonly countBadge: CountBadge;
  readonly host: HTMLElement;
  readonly name: HTMLSpanElement;
};

type TreeItemTemplate = {
  readonly file: FileItemTemplate;
  readonly folder: FolderItemTemplate;
};

type TreeModelCache = {
  readonly folderKeys: string[];
  readonly items: FileTreeNode[];
  readonly signature: string;
};

type HoverContent = {
  readonly isSelected: boolean;
  readonly isWarning: boolean;
  readonly processedFile: CleanedEntry | null;
  readonly summary: string;
};

type HoverThumbnailCacheEntry = {
  readonly file: CleanedEntry;
  readonly isActive: boolean;
  readonly node: HTMLElement;
  readonly plotModel: CalculatedData | null;
  lastUsed: number;
};

const getFileItemMeta = (fileEntry: FileEntry): FileItemMeta | null => {
  if (!fileEntry?.curveType) {
    return null;
  }

  const curveType = String(fileEntry.curveType).trim();
  const confidence = fileEntry?.curveTypeConfidence
    ? ` (${String(fileEntry.curveTypeConfidence).trim()})`
    : "";
  const summary = localize("files.autoSummary", "Auto detected: {curveType}{confidence}", {
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
  icon: LxIconDefinition,
  size = 16,
  className?: string,
) => {
  const iconSpan = document.createElement("span");
  iconSpan.className = className ? `ui-lxicon ${className}` : "ui-lxicon";
  iconSpan.style.width = `${size}px`;
  iconSpan.style.height = `${size}px`;
  iconSpan.innerHTML = normalizeLxIconSvgMarkup(icon);
  container.appendChild(iconSpan);
};

export class ExplorerViewer implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly treeView: ObjectTree<FileTreeNode, TreeItemTemplate>;
  private readonly thumbnailHost: HTMLDivElement;
  private readonly hoverThumbnailCache = new Map<string, HoverThumbnailCacheEntry>();
  private hoverView: IOpenContextView | null = null;
  private hoverContextViewElement: HTMLElement | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private hoverContent: HoverContent | null = null;
  private hoverHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private hoverLayoutFrame: number | null = null;
  private hoverViewToken = 0;
  private hoverCacheUse = 0;
  private expandedKeys: string[] = [];
  private knownFolderKeys = new Set<string>();
  private treeModel: TreeModelCache = {
    folderKeys: [],
    items: [],
    signature: "",
  };
  private props: ExplorerViewerProps;
  private readonly treeDelegate = {
    getHeight: () => FILE_ROW_HEIGHT,
  };
  private readonly getTreeNodeChildren = (node: FileTreeNode) => node.children;
  private readonly getTreeNodeKey = (node: FileTreeNode) => node.key;
  private readonly treeRenderer: ITreeRenderer<FileTreeNode, TreeItemTemplate>;

  constructor(
    host: HTMLElement,
    private readonly hoverHost: HTMLElement,
    props: ExplorerViewerProps,
    private readonly labels: ResourceLabels,
  ) {
    this.props = props;
    this.treeRenderer = {
      renderTemplate: (container) => this.createTreeItemTemplate(container),
      renderElement: this.renderTreeElement,
      disposeElement: this.disposeTreeElement,
      disposeTemplate: this.disposeTreeItemTemplate,
    };
    this.treeView = this.disposables.add(
      new ObjectTree<FileTreeNode, TreeItemTemplate>(
        host,
        this.createTreeOptions(),
      ),
    );
    this.thumbnailHost = document.createElement("div");
    this.thumbnailHost.className = "file-list-thumbnail-grid";
    host.append(this.thumbnailHost);

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
    const previousSelectedFileId = this.props.effectiveSelectedFileId ?? null;
    const nextSelectedFileId = nextProps.effectiveSelectedFileId ?? null;
    const nextTreeSignature = this.createTreeSignature(nextProps.files);
    const shouldUpdateTree = nextTreeSignature !== this.treeModel.signature;
    const shouldUpdateOptions = previousSelectedFileId !== nextSelectedFileId;
    const nextViewMode = nextProps.viewMode ?? "tree";
    const shouldClearPlotCache = this.shouldClearThumbnailPlotCache(this.props, nextProps);

    this.props = nextProps;
    if (shouldClearPlotCache) {
      this.clearThumbnailCaches();
    }
    const host = this.thumbnailHost.parentElement;
    if (host) {
      host.dataset.viewMode = nextViewMode;
    }

    if (shouldUpdateTree) {
      this.updateTreeModel(nextTreeSignature);
      this.updateExpandedFolders(this.treeModel.folderKeys);
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(),
        selectedKey: nextSelectedFileId,
      });
      this.treeView.setChildren(this.treeModel.items);
    } else if (shouldUpdateOptions) {
      this.treeView.updateOptions({
        selectedKey: nextSelectedFileId,
      });
    }

    this.refreshVisibleHover();
    this.renderThumbnailGrid();
  }

  dispose(): void {
    this.cancelFileItemHoverHide();
    this.cancelFileItemHoverLayout();
    this.closeFileItemHoverView();
    this.clearThumbnailCaches();
    this.disposables.dispose();
  }

  private createTreeOptions(
    signature = this.createTreeSignature(this.props.files),
  ): IObjectTreeOptions<FileTreeNode, TreeItemTemplate> {
    this.updateTreeModel(signature);
    const { folderKeys, items } = this.treeModel;
    this.updateExpandedFolders(folderKeys);

    return {
      className: "file-list-tree",
      expandOnlyOnTwistieClick: false,
      getChildren: this.getTreeNodeChildren,
      getKey: this.getTreeNodeKey,
      gap: 0,
      collapsedKeys: this.getCollapsedFolderKeys(),
      empty: this.renderEmpty,
      disposeEmpty: this.disposeEmpty,
      items,
      delegate: this.treeDelegate,
      onDidChangeCollapseState: this.handleTreeCollapseState,
      onScroll: this.handleTreeScroll,
      onSelect: this.handleTreeSelect,
      renderer: this.treeRenderer,
      selectedKey: this.props.effectiveSelectedFileId ?? null,
      viewportClassName: "file-list-tree-viewport",
    };
  }

  private updateExpandedFolders(folderKeys: readonly string[]): void {
    const expandedKeys = new Set(this.expandedKeys);
    for (const key of folderKeys) {
      if (!this.knownFolderKeys.has(key)) {
        expandedKeys.add(key);
      }
    }

    this.knownFolderKeys = new Set(folderKeys);
    this.expandedKeys = [...expandedKeys];
  }

  private getCollapsedFolderKeys(): string[] {
    const expanded = new Set(this.expandedKeys);
    return this.treeModel.folderKeys.filter((key) => !expanded.has(key));
  }

  private createTreeSignature(files: readonly FileEntry[]): string {
    return files.map((entry) => [
      entry.fileId ?? "",
      entry.itemKey ?? "",
      entry.relativePath ?? "",
      getFileName(entry),
      entry.curveType ?? "",
      entry.curveTypeConfidence ?? "",
      entry.curveTypeNeedsTemplate === true ? "1" : "0",
    ].join("\u001f")).join("\u001e");
  }

  private updateTreeModel(signature: string): void {
    if (signature === this.treeModel.signature) {
      return;
    }

    const items = buildFileTree(this.props.files);
    this.treeModel = {
      folderKeys: collectFileTreeFolderKeys(items),
      items,
      signature,
    };
  }

  private readonly handleTreeCollapseState = (collapsedKeys: string[]): void => {
    const collapsed = new Set(collapsedKeys);
    this.expandedKeys = this.treeModel.folderKeys.filter((key) => !collapsed.has(key));
  };

  private readonly handleTreeScroll = (event: Event): void => {
    this.props.onListScroll(event);
    this.scheduleFileItemHoverLayout();
  };

  private readonly handleTreeSelect = ({ element }: ITreeSelectionEvent<FileTreeNode>): void => {
    if (element.kind === "folder") {
      return;
    }

    this.props.onSelectFile(element.entry?.fileId ?? null);
  };

  private readonly renderEmpty = (container: HTMLElement): void => {
    container.replaceChildren(
      createEmptyView({
        folderImportSupport: this.props.folderImportSupport,
        onImportFiles: this.props.onOpenFileDialog,
      }),
    );
  };

  private readonly disposeEmpty = (container: HTMLElement): void => {
    container.replaceChildren();
  };

  private readonly renderTreeElement = (
    node: ITreeNode<FileTreeNode>,
    _index: number,
    template: TreeItemTemplate,
    details: ITreeElementRenderDetails,
  ): void => {
    const element = node.element;
    if (element.kind === "folder") {
      this.renderFolderItem(element, !details.collapsed, template.folder);
      return;
    }

    if (element.entry) {
      this.renderFileItem(
        element.entry,
        this.props.effectiveSelectedFileId === element.entry.fileId,
        template.file,
      );
    }
  };

  private readonly disposeTreeElement = (
    _node: ITreeNode<FileTreeNode>,
    _index: number,
    template: TreeItemTemplate,
  ): void => {
    template.file.fileId = null;
    template.folder.currentNode = null;
  };

  private createTreeItemTemplate(host: HTMLElement): TreeItemTemplate {
    return {
      file: this.createFileItemTemplate(host),
      folder: this.createFolderItemTemplate(host),
    };
  }

  private readonly disposeTreeItemTemplate = (template: TreeItemTemplate): void => {
    template.file.label.dispose();
    template.folder.actionButton.dispose();
  };

  private renderFileItem(
    fileEntry: FileEntry,
    isSelected: boolean,
    template: FileItemTemplate,
  ): void {
    const fileName = getFileName(fileEntry);
    const meta = getFileItemMeta(fileEntry);
    const { host } = template;

    host.className = "file-list-item";
    delete host.dataset.expanded;
    host.setAttribute(
      "aria-label",
      localize("import.fileItemAriaLabel", "File {fileName}", { fileName }),
    );
    host.title = fileName;
    if (isSelected) {
      host.dataset.selected = "true";
    } else {
      delete host.dataset.selected;
    }
    if (fileEntry?.fileId) {
      host.dataset.fileId = fileEntry.fileId;
    } else {
      delete host.dataset.fileId;
    }
    if (meta) {
      host.dataset.autoSummary = meta.summary;
      host.dataset.autoWarning = meta.isWarning ? "true" : "false";
    } else {
      delete host.dataset.autoSummary;
      delete host.dataset.autoWarning;
    }

    if (fileEntry?.itemKey) {
      host.dataset.itemKey = fileEntry.itemKey;
    } else {
      delete host.dataset.itemKey;
    }

    template.fileId = fileEntry.fileId ?? null;
    template.label.setResource(
      {
        name: fileName,
        resource: fileEntry.relativePath ?? fileName,
      },
      {
        extraClasses: ["explorer-item"],
        fileKind: FileKind.FILE,
        title: fileName,
      },
    );
    template.removeButton.setAttribute(
      "aria-label",
      localize("import.removeFileButtonLabel", "Remove {fileName}", { fileName }),
    );
    if (
      template.content.parentElement !== host ||
      template.actions.parentElement !== host
    ) {
      host.replaceChildren(template.content, template.actions);
    }
  }

  private renderThumbnailGrid(): void {
    if ((this.props.viewMode ?? "tree") !== "thumbnail") {
      this.thumbnailHost.replaceChildren();
      return;
    }

    const files = this.getThumbnailFiles();
    this.thumbnailHost.replaceChildren(
      ...files.map(file => this.createThumbnailItem(file)),
    );
  }

  private getThumbnailFiles(): CleanedFileLike[] {
    const cleanedData = Array.isArray(this.props.cleanedData) ? this.props.cleanedData : [];
    if (!cleanedData.length) {
      return this.props.files.map(file => ({
        curveFilterField: null,
        curveFilterKey: null,
        curveType: file.curveType ?? undefined,
        curveTypeConfidence: file.curveTypeConfidence,
        fileId: file.fileId,
        fileName: file.fileName,
      }));
    }

    const fileIds = new Set(
      this.props.files
        .map(file => String(file.fileId ?? "").trim())
        .filter(Boolean),
    );
    if (!fileIds.size) {
      return cleanedData;
    }

    return cleanedData.filter(file => fileIds.has(String(file.fileId ?? "").trim()));
  }

  private createThumbnailItem(file: CleanedFileLike): HTMLButtonElement {
    const fileName = String(file.fileName ?? file.fileId ?? "");
    const fileId = String(file.fileId ?? "").trim();
    const item = document.createElement("button");
    item.type = "button";
    item.className = "file-list-thumbnail-item";
    item.setAttribute(
      "aria-label",
      localize("import.fileItemAriaLabel", "File {fileName}", { fileName }),
    );
    item.append(createThumbnailView({
      file,
      isActive: fileId === (this.props.effectiveSelectedFileId ?? null),
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel: this.getThumbnailPlotModel(fileId),
      plotType: this.props.activePlotType ?? "iv",
      thumbnailService: this.props.thumbnailService,
    }));
    item.addEventListener("click", () => this.props.onSelectFile(fileId || null));
    return item;
  }

  private createFileItemTemplate(host: HTMLElement): FileItemTemplate {
    const content = document.createElement("div");
    content.className = "file-list-item-content";
    const label = this.labels.create(content, {
      className: "file-list-item-label",
    });

    const actions = document.createElement("div");
    actions.className = "file-list-item-actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "file-list-item-remove";
    const template: FileItemTemplate = {
      actions,
      content,
      fileId: null,
      host,
      label,
      removeButton,
    };
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.props.onRemoveFile(template.fileId);
    });
    appendIcon(removeButton, LxIcon.close);

    actions.appendChild(removeButton);
    return template;
  }

  private createFolderItemTemplate(host: HTMLElement): FolderItemTemplate {
    const content = document.createElement("div");
    content.className = "file-list-folder-content";

    const name = document.createElement("span");
    name.className = "file-list-folder-name";
    content.appendChild(name);

    const controls = document.createElement("div");
    controls.className = "file-list-folder-controls";

    const countBadge = new CountBadge(controls, {
      count: 0,
      titleFormat: localize("files.folderCount", "{count} files"),
    });

    const actionsHost = document.createElement("div");
    actionsHost.className = "file-list-folder-actionbar";
    const template: FolderItemTemplate = {
      actionButton: { dispose: () => undefined },
      content,
      controls,
      countBadge,
      currentNode: null,
      host,
      name,
    };

    const actionButton = createDropdownButton({
      ariaLabel: localize("files.folderMoreActions", "More Actions"),
      className: "file-list-folder-more",
      closeOnContentEvent: "menuitemactionrun",
      label: "",
      matchAnchorWidth: false,
      render: (menuHost) => renderMenuItems(menuHost, {
        className: "file-list-folder-menu",
        items: () => this.createFolderActions(template.currentNode),
      }),
      surfaceClassName: "file-list-folder-menu-surface",
      triggerIcon: LxIcon.moreHorizontal,
    });
    actionsHost.appendChild(actionButton.domNode);
    controls.appendChild(actionsHost);
    template.actionButton = {
      dispose: () => {
        actionButton.dispose();
        countBadge.dispose();
      },
    };
    return template;
  }

  private renderFolderItem(
    node: FileTreeNode,
    isExpanded: boolean,
    template: FolderItemTemplate,
  ): void {
    const { host } = template;
    template.currentNode = node;
    host.className = "file-list-folder-item";
    host.title = node.name;
    host.removeAttribute("aria-label");
    delete host.dataset.autoSummary;
    delete host.dataset.autoWarning;
    delete host.dataset.fileId;
    delete host.dataset.itemKey;
    delete host.dataset.selected;
    host.dataset.expanded = isExpanded ? "true" : "false";
    template.name.textContent = node.name;
    template.countBadge.setCount(node.children?.length ?? 0);
    if (
      template.content.parentElement !== host ||
      template.controls.parentElement !== host
    ) {
      host.replaceChildren(template.content, template.controls);
    }
  }

  private createFolderActions(node: FileTreeNode | null): IAction[] {
    if (!node) {
      return [];
    }

    return [
      createMenuAction({
        id: "files.folder.remove",
        label: localize("files.removeFolder", "Remove Folder"),
        left: createMenuItemLabel(localize("files.removeFolder", "Remove Folder"), LxIcon.remove),
        run: () => this.props.onRemoveFolder(node.key),
        tabIndex: 0,
      }),
      createMenuAction({
        id: "files.folder.create",
        label: localize("files.createFolder", "New Folder"),
        left: createMenuItemLabel(localize("files.createFolder", "New Folder"), LxIcon.add),
        run: () => this.props.onCreateFolder(node.key),
        tabIndex: 0,
      }),
    ];
  }

  private readonly handleListMouseOver = (event: MouseEvent): void => {
    const item = this.getFileItemFromEvent(event);
    if (item) {
      this.cancelFileItemHoverHide();
      this.showFileItemHover(item);
    }
  };

  private readonly handleListMouseOut = (event: MouseEvent): void => {
    const item = this.getFileItemFromEvent(event);
    const relatedTarget = event.relatedTarget;
    if (
      item &&
      !this.isInsideFileHover(relatedTarget, item)
    ) {
      this.scheduleFileItemHoverHide(item);
    }
  };

  private readonly handleListFocusIn = (event: FocusEvent): void => {
    const item = this.getFileItemFromEvent(event);
    if (item) {
      this.cancelFileItemHoverHide();
      this.showFileItemHover(item);
    }
  };

  private readonly handleListFocusOut = (event: FocusEvent): void => {
    const item = this.getFileItemFromEvent(event);
    const relatedTarget = event.relatedTarget;
    if (
      item &&
      !this.isInsideFileHover(relatedTarget, item)
    ) {
      this.hideFileItemHover(item);
    }
  };

  private readonly handleHoverMouseOver = (): void => {
    this.cancelFileItemHoverHide();
  };

  private readonly handleHoverMouseOut = (event: MouseEvent): void => {
    if (!this.isInsideFileHover(event.relatedTarget, this.hoverAnchor)) {
      this.scheduleFileItemHoverHide(this.hoverAnchor);
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

  private getProcessedFile(fileId: string | null | undefined): CleanedEntry | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    return (Array.isArray(this.props.cleanedData) ? this.props.cleanedData : [])
      .find((entry) => String(entry?.fileId ?? "").trim() === normalizedFileId) ?? null;
  }

  private hasFileItemHoverContent(item: HTMLElement): boolean {
    return Boolean(
      this.getProcessedFile(item.dataset.fileId) ||
      item.dataset.autoSummary,
    );
  }

  private isInsideFileHover(
    target: EventTarget | null,
    item: HTMLElement | null | undefined,
  ): boolean {
    if (!(target instanceof Node)) {
      return false;
    }

    return Boolean(
      item?.contains(target) ||
      this.hoverContextViewElement?.contains(target),
    );
  }

  private scheduleFileItemHoverHide(item: HTMLElement | null | undefined): void {
    this.cancelFileItemHoverHide();
    this.hoverHideTimeout = setTimeout(() => {
      this.hoverHideTimeout = null;
      this.hideFileItemHover(item ?? undefined);
    }, FILE_HOVER_HIDE_DELAY_MS);
  }

  private cancelFileItemHoverHide(): void {
    if (this.hoverHideTimeout === null) {
      return;
    }

    clearTimeout(this.hoverHideTimeout);
    this.hoverHideTimeout = null;
  }

  private scheduleFileItemHoverLayout(): void {
    if (!this.hoverAnchor || !this.hoverView || this.hoverLayoutFrame !== null) {
      return;
    }

    this.hoverLayoutFrame = requestAnimationFrame(() => {
      this.hoverLayoutFrame = null;
      this.layoutVisibleHover();
    });
  }

  private cancelFileItemHoverLayout(): void {
    if (this.hoverLayoutFrame === null) {
      return;
    }

    cancelAnimationFrame(this.hoverLayoutFrame);
    this.hoverLayoutFrame = null;
  }

  private showFileItemHover(item: HTMLElement): void {
    const content = this.resolveHoverContent(item);
    if (!content) {
      this.hideFileItemHover();
      return;
    }

    this.cancelFileItemHoverHide();
    this.hoverAnchor = item;
    this.hoverContent = content;
    this.openFileItemHoverView(item, content);
  }

  private openFileItemHoverView(item: HTMLElement, content: HoverContent): void {
    const token = this.hoverViewToken + 1;
    this.hoverViewToken = token;
    const classNames = content.processedFile
      ? ["file-list-hover", "file-list-hover--thumbnail"]
      : ["file-list-hover"];

    this.hoverView = this.props.contextViewService.showContextView({
      anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
      anchorPosition: AnchorPosition.RIGHT,
      canRelayout: true,
      getAnchor: () => item,
      layer: 40,
      render: (container) => this.renderFileItemHoverView(container, classNames),
      onHide: () => {
        if (this.hoverViewToken === token) {
          this.hoverView = null;
          this.hoverContextViewElement = null;
        }
      },
    }, this.hoverHost);
  }

  private renderFileItemHoverView(
    container: HTMLElement,
    classNames: readonly string[],
  ): IDisposable {
    const disposables = new DisposableStore();
    this.hoverContextViewElement = container;
    container.classList.add(...classNames);
    container.setAttribute("role", "tooltip");
    disposables.add(
      addDisposableListener(container, "mouseover", this.handleHoverMouseOver),
    );
    disposables.add(
      addDisposableListener(container, "mouseout", this.handleHoverMouseOut),
    );
    disposables.add({
      dispose: () => {
        container.classList.remove("file-list-hover", "file-list-hover--thumbnail");
        container.removeAttribute("role");
        if (this.hoverContextViewElement === container) {
          this.hoverContextViewElement = null;
        }
      },
    });
    this.renderHoverContent(container);
    return disposables;
  }

  private resolveHoverContent(item: HTMLElement): HoverContent | null {
    const summary = item.dataset.autoSummary ?? "";
    const processedFile = this.getProcessedFile(item.dataset.fileId);
    if (!processedFile && !summary) {
      return null;
    }

    return {
      isSelected: item.dataset.selected === "true",
      isWarning: item.dataset.autoWarning === "true",
      processedFile,
      summary,
    };
  }

  private renderHoverContent(container: HTMLElement): void {
    const content = this.hoverContent;
    if (!content) {
      return;
    }

    if (content.processedFile) {
      container.appendChild(this.getHoverThumbnail(
        content.processedFile,
        content.isSelected,
      ));
      return;
    }

    const summaryElement = document.createElement("div");
    summaryElement.className = "file-list-hover-summary";
    summaryElement.dataset.warning = content.isWarning ? "true" : "false";
    summaryElement.textContent = content.summary;
    container.appendChild(summaryElement);
  }

  private getHoverThumbnail(file: CleanedEntry, isActive: boolean): HTMLElement {
    const fileId = String(file.fileId ?? file.fileName ?? "").trim();
    const cacheKey = fileId || "__unknown__";
    const plotModel = this.getThumbnailPlotModel(fileId);
    const cached = this.hoverThumbnailCache.get(cacheKey);
    this.hoverCacheUse += 1;
    if (
      cached?.file === file &&
      cached.isActive === isActive &&
      cached.plotModel === plotModel
    ) {
      cached.lastUsed = this.hoverCacheUse;
      return cached.node;
    }

    const node = createThumbnailView({
      file,
      isActive,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel,
      plotType: this.props.activePlotType ?? "iv",
      thumbnailService: this.props.thumbnailService,
    });
    cached?.node.remove();
    this.hoverThumbnailCache.set(cacheKey, {
      file,
      isActive,
      lastUsed: this.hoverCacheUse,
      node,
      plotModel,
    });
    this.trimHoverThumbnailCache();
    return node;
  }

  private getThumbnailPlotModel(fileId: string): CalculatedData | null {
    return getCalculatedData(
      this.props.calculatedDataByKey,
      this.props.activePlotType ?? "iv",
      fileId,
    );
  }

  private clearThumbnailCaches(): void {
    for (const entry of this.hoverThumbnailCache.values()) {
      entry.node.remove();
    }
    this.hoverThumbnailCache.clear();
    this.props.thumbnailService.clear();
  }

  private shouldClearThumbnailPlotCache(
    previous: ExplorerViewerProps,
    next: ExplorerViewerProps,
  ): boolean {
    return (
      previous.activePlotType !== next.activePlotType ||
      previous.calculatedDataByKey !== next.calculatedDataByKey ||
      previous.originOpenPlotOptions !== next.originOpenPlotOptions ||
      previous.plotAxisSettings !== next.plotAxisSettings
    );
  }

  private trimHoverThumbnailCache(): void {
    if (this.hoverThumbnailCache.size <= HOVER_THUMBNAIL_CACHE_LIMIT) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestUse = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.hoverThumbnailCache) {
      if (entry.lastUsed < oldestUse) {
        oldestKey = key;
        oldestUse = entry.lastUsed;
      }
    }

    if (oldestKey) {
      this.hoverThumbnailCache.get(oldestKey)?.node.remove();
      this.hoverThumbnailCache.delete(oldestKey);
    }
  }

  private refreshVisibleHover(): void {
    const anchor = this.hoverAnchor;
    if (!anchor) {
      return;
    }

    if (!this.hoverHost.contains(anchor) || !this.hasFileItemHoverContent(anchor)) {
      this.hideFileItemHover();
      return;
    }

    this.showFileItemHover(anchor);
  }

  private layoutVisibleHover(): void {
    const anchor = this.hoverAnchor;
    if (!anchor || !this.hoverView) {
      return;
    }

    if (!this.hoverHost.contains(anchor) || !this.hasFileItemHoverContent(anchor)) {
      this.hideFileItemHover();
      return;
    }

    this.props.contextViewService.layout();
  }

  private hideFileItemHover(item?: HTMLElement): void {
    if (item && this.hoverAnchor !== item) {
      return;
    }

    this.cancelFileItemHoverHide();
    this.cancelFileItemHoverLayout();
    this.hoverAnchor = null;
    this.hoverContent = null;
    this.closeFileItemHoverView();
  }

  private closeFileItemHoverView(): void {
    if (!this.hoverView) {
      this.hoverContextViewElement = null;
      return;
    }

    this.hoverViewToken += 1;
    const view = this.hoverView;
    this.hoverView = null;
    this.hoverContextViewElement = null;
    view.close();
  }
}
