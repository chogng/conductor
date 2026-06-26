/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from "src/cs/base/browser/dom";
import { CountBadge } from "src/cs/base/browser/ui/countbadge/countBadge";
import { InlineEditableTextWidget } from "src/cs/base/browser/ui/InlineEditableText/inlineEditableTextWidget";
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
  type IObjectTreeOptionsUpdate,
  type ITreeRenderRangeEvent,
  type ITreeElementRenderDetails,
  type ITreeNode,
  type ITreeRenderer,
  type ITreeSelectionEvent,
} from "src/cs/base/browser/ui/tree/objectTree";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { AnchorAxisAlignment, AnchorPosition } from "src/cs/base/common/layout";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { isMacintosh, isWindows } from "src/cs/base/common/platform";
import { Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import { CommandsRegistry, type ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  IContextMenuService,
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";
import { localize } from "src/cs/nls";
import { logPerf } from "src/cs/workbench/common/perf";
import {
  type FilesViewLayout,
  CLOSE_FILE_ITEM_COMMAND_ID,
  DELETE_FILE_ITEM_COMMAND_ID,
  REVEAL_IN_OS_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  ExplorerEditableData,
  ExplorerThumbnailPlotModel,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  isTemplateApplyPerformanceTraceEnabled,
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";
import { FileKind, ResourceLabels, type IResourceLabel } from "src/cs/workbench/browser/labels";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { FolderImportSupport } from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  areExplorerAppearancesEqual,
  DEFAULT_EXPLORER_APPEARANCE,
  type ExplorerAppearance,
} from "src/cs/workbench/services/appearance/common/appearance";
import type { FilesExplorerBadgeColors } from "src/cs/workbench/services/settings/common/settings";
import {
  buildExplorerTree,
  collectExplorerFolderKeys,
  createExplorerFilePresentationSignature,
  createExplorerTreeStructureSignature,
  getExplorerTreeFileKey,
  getExplorerTreeFileName,
  type ExplorerFileEntry,
  type ExplorerSourceStatus,
  type ExplorerThumbnailFile,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { createEmptyView } from "src/cs/workbench/contrib/files/browser/views/emptyView";
import {
  createThumbnailView,
  updateThumbnailView,
  type ThumbnailFileLike,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailView";
import {
  ExplorerBadgeNode,
  type ExplorerBadgePresentation,
} from "src/cs/workbench/contrib/files/browser/views/explorerBadgeNode";
import type {
  IThumbnailPreviewService,
  IThumbnailService,
  ThumbnailPreviewState,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import {
  createTemplateSelection,
  getTemplateSelectionId,
  getTemplateSelectionTemplateId,
  resolveTemplateSelectionForFile,
  type TemplateSelection,
  type TemplateSelectionsByFileId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import type { TemplateEditorRecord } from "src/cs/workbench/services/template/common/template";
import { isAutoTemplateId } from "src/cs/workbench/services/slice/common/templateSelection";

export type ExplorerViewerProps = {
  readonly selectedFileId?: string | null;
  readonly selectedItemKey?: string | null;
  readonly expandedFolderKeys?: readonly string[];
  readonly explorerAppearance?: ExplorerAppearance;
  readonly activePlotType?: PlotType;
  readonly commandService: Pick<ICommandService, "executeCommand">;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly contextViewService: IContextViewService;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly thumbnailPreviewService: IThumbnailPreviewService;
  readonly thumbnailService: IThumbnailService;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly editable?: ExplorerEditableData | null;
  readonly templateRecords?: readonly TemplateEditorRecord[];
  readonly files: ExplorerFileEntry[];
  readonly mode?: WorkbenchMainPart;
  readonly viewLayout?: FilesViewLayout;
  readonly folderImportSupport?: FolderImportSupport;
  readonly onListScroll?: (event: Event) => void;
  readonly onVisibleFileIdsChange?: (
    visibleFileIds: readonly string[],
    nearbyFileIds: readonly string[],
  ) => void;
  readonly onFolderExpansionChange?: (expandedFolderKeys: readonly string[]) => void;
  readonly onFolderKeysChange?: (folderKeys: readonly string[]) => readonly string[] | void;
  readonly onOpenFileDialog: () => void;
  readonly onRemoveFolder: (folderKey: string) => void;
  readonly onRequestTemplates?: () => void;
  readonly onHoverFileChange?: (fileId: string | null) => void;
  readonly onCancelRenameFile?: () => void;
  readonly onRenameFile?: (fileId: string, nextName: string) => void;
  readonly onSelectFile: (fileId: string | null, itemKey?: string | null) => void;
  readonly thumbnailFiles?: ExplorerThumbnailFile[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

type FileTreeNode = ExplorerTreeNode<ExplorerFileEntry>;

const getFileName = getExplorerTreeFileName;
const FILE_HOVER_HIDE_DELAY_MS = 120;
const FILE_HOVER_THUMBNAIL_WIDTH = 360;
const FILE_HOVER_THUMBNAIL_VIEWPORT_RATIO = 0.44;
const HOVER_THUMBNAIL_CACHE_LIMIT = 32;
const FILE_TABLE_MODEL_REASON_SEPARATOR = "\u001d";

const getFileHoverThumbnailWidth = (): number =>
  Math.max(1, Math.min(
    FILE_HOVER_THUMBNAIL_WIDTH,
    Math.floor(window.innerWidth * FILE_HOVER_THUMBNAIL_VIEWPORT_RATIO),
  ));

type FileItemTableModel = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly source: "review";
  readonly state: "ready" | "unknown";
  readonly type: string;
  readonly confidence: string;
  readonly reasons: readonly string[];
  readonly template: string;
};

type FileSourceStatusBadge = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly state: "source";
  readonly status: ExplorerSourceStatus;
  readonly title: string | null;
};

type FilePendingTableModel = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly source?: "tableModel";
  readonly state: "pending";
  readonly title: string;
};

type FileHoverContext = {
  readonly fileName: string;
  readonly path: string;
  readonly typeLabel: string;
};

type FileItemTemplate = {
  readonly actions: HTMLDivElement;
  readonly badge: ExplorerBadgeNode;
  readonly content: HTMLDivElement;
  readonly editorStore: DisposableStore;
  fileId: string | null;
  filePresentationSignature: string;
  fileRenderKey: string | null;
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
  readonly structureSignature: string;
};

type HoverContent =
  | {
    readonly kind: "tableModel";
    readonly fileContext: FileHoverContext | null;
    readonly isWarning: boolean;
    readonly type: string;
    readonly confidence: string;
    readonly reasons: readonly string[];
    readonly template: string;
  }
  | {
    readonly kind: "file";
    readonly fileContext: FileHoverContext;
  }
  | {
    readonly kind: "thumbnail";
    readonly file: ThumbnailFileLike;
    readonly fileId: string;
    readonly isSelected: boolean;
  };

type HoverThumbnailCacheEntry = {
  fileId: string;
  fileSignature: string;
  isActive: boolean;
  isLoading: boolean;
  node: HTMLElement;
  plotModel: ExplorerThumbnailPlotModel | null;
  plotModelSignature: string;
  warmedPlotModelSignature: string;
  lastUsed: number;
};

type ThumbnailGridItemCacheEntry = {
  readonly node: HTMLButtonElement;
  thumbnail: HTMLElement;
};

const hasFileItemTableModel = (
  fileEntry: ExplorerFileEntry,
  reasons: readonly string[],
): boolean =>
  Boolean(
    String(fileEntry.curveType ?? "").trim() ||
      fileEntry.curveTypeConfidence ||
      fileEntry.curveTypeNeedsReview === true ||
      reasons.length,
  );

const createFileItemTableModel = (
  fileEntry: ExplorerFileEntry,
  templateLabel: string,
): FileItemTableModel | null => {
  const badgeState = fileEntry.badgeState;
	if (
		(badgeState?.kind !== "ready" && badgeState?.kind !== "unknown") ||
		badgeState?.source !== "review"
	) {
    return null;
  }

  const confidence = fileEntry?.curveTypeConfidence
    ? String(fileEntry.curveTypeConfidence).trim()
    : localize("files.autoUnknown", "Unknown");
  const reasons = (fileEntry.curveTypeReasons ?? [])
    .map(reason => String(reason).trim())
    .filter(Boolean);
  if (!hasFileItemTableModel(fileEntry, reasons)) {
    return null;
  }

  const curveType =
    String(fileEntry.curveType ?? "").trim() ||
    localize("files.autoUnknown", "Unknown");
  const label = badgeState.kind === "ready"
    ? badgeState.label
    : localize("files.autoUnknown", "Unknown");

  return {
    label,
    isWarning:
      badgeState.kind === "unknown" ||
      fileEntry?.curveTypeNeedsReview === true ||
      fileEntry?.curveTypeConfidence === "low",
    source: "review",
    state: badgeState.kind === "unknown" ? "unknown" : "ready",
    type: curveType,
    confidence,
    reasons: reasons.length ? reasons : [localize("files.autoNoReason", "Not available")],
    template: templateLabel,
  };
};

const createFileSourceStatusBadge = (
  fileEntry: ExplorerFileEntry,
): FileSourceStatusBadge | null => {
  switch (fileEntry.sourceStatus) {
    case "failed":
      return {
        label: localize("files.source.failed", "Failed"),
        isWarning: true,
        state: "source",
        status: "failed",
        title: String(fileEntry.sourceStatusMessage ?? "").trim() || null,
      };
    case "preparing":
      return {
        label: localize("files.source.loading", "Loading"),
        isWarning: false,
        state: "source",
        status: "preparing",
        title: null,
      };
    case "pending":
      return {
        label: localize("files.source.pending", "Pending"),
        isWarning: false,
        state: "source",
        status: "pending",
        title: null,
      };
    default:
      return null;
  }
};

const createFilePendingTableModel = (
  fileEntry: ExplorerFileEntry,
): FilePendingTableModel | null => {
  const badgeState = fileEntry.badgeState;
  if (badgeState?.kind !== "pending") {
    return null;
  }

  return {
    label: "...",
    isWarning: false,
    ...(badgeState.source ? { source: badgeState.source } : {}),
    state: "pending",
    title: badgeState.queueState === "queued"
      ? localize("files.autoQueued", "Waiting for table model")
      : localize("files.autoAnalyzing", "Analyzing"),
  };
};

const getLocalizedTableModelHealthMessage = (
  fileEntry: ExplorerFileEntry,
): string => {
  const message = String(fileEntry.rawTableHealthMessage ?? "").trim();
  const lowerMessage = message.toLowerCase();
  if (fileEntry.rawTableHealth === "decodeFailed") {
    if (lowerMessage.includes("converted csv")) {
      return localize(
        "files.autoContentConvertedCsvUnreadable",
        "Content could not be read from the converted CSV source.",
      );
    }
    if (lowerMessage.includes("binary") || lowerMessage.includes("encoding")) {
      return localize(
        "files.autoContentBinaryOrEncoding",
        "Content is unreadable: suspected binary file or encoding mismatch.",
      );
    }
    return localize(
      "files.autoContentDecodeFailed",
      "Content decoding failed.",
    );
  }
  if (fileEntry.rawTableHealth === "parseFailed") {
    return localize(
      "files.autoContentParseFailed",
      "Content parsing failed: text encoding is invalid or file content is unreadable.",
    );
  }
  if (fileEntry.rawTableHealth === "unsupported") {
    return localize(
      "files.autoContentUnsupported",
      "Content format is not supported.",
    );
  }

  return message;
};

const getFileRenderKey = (
  fileEntry: ExplorerFileEntry,
): string =>
  String(
    fileEntry.fileId ??
      fileEntry.itemKey ??
      fileEntry.fileName ??
      "",
  );

const normalizeFileItemKey = (itemKey: unknown): string | null => {
  const normalized = String(itemKey ?? "").trim();
  return normalized || null;
};

const isExplorerFileEntrySelected = (
  fileEntry: ExplorerFileEntry,
  props: Pick<ExplorerViewerProps, "selectedFileId" | "selectedItemKey">,
): boolean => {
  const selectedFileId = String(props.selectedFileId ?? "").trim();
  if (!selectedFileId || selectedFileId !== String(fileEntry.fileId ?? "").trim()) {
    return false;
  }

  const selectedItemKey = normalizeFileItemKey(props.selectedItemKey);
  return selectedItemKey
    ? selectedItemKey === normalizeFileItemKey(fileEntry.itemKey)
    : true;
};

const getSelectedTreeKey = (
  props: Pick<ExplorerViewerProps, "files" | "selectedFileId" | "selectedItemKey">,
): string | null => {
  const selectedFile = props.files.find(file => isExplorerFileEntrySelected(file, props));
  return selectedFile ? getExplorerTreeFileKey(selectedFile) : null;
};

const createFileHoverContext = (
  fileEntry: ExplorerFileEntry,
): FileHoverContext | null => {
  const fileName = normalizeFileHoverText(getFileName(fileEntry));
  const path = getFileHoverPath(fileEntry);
  const typeLabel = getFileHoverTypeLabel(fileEntry);
  if (!fileName && !path && !typeLabel) {
    return null;
  }

  return {
    fileName,
    path,
    typeLabel,
  };
};

const createFileHoverContextSignature = (
  fileEntry: ExplorerFileEntry,
): string => {
  const context = createFileHoverContext(fileEntry);
  if (!context) {
    return "";
  }

  return [
    context.fileName,
    context.path,
    context.typeLabel,
  ].join("\u001d");
};

const getFileHoverPath = (
  fileEntry: ExplorerFileEntry,
): string => {
  const path = getFirstFileHoverText(
    fileEntry.relativePath,
    fileEntry.sourcePath,
    fileEntry.normalizedCsvPath,
  );
  return getFileHoverDirectoryPath(path, getFileName(fileEntry));
};

const getFileHoverDirectoryPath = (
  path: string,
  fileName: string,
): string => {
  const normalizedPath = normalizeFileHoverText(path);
  if (!normalizedPath) {
    return "";
  }

  const normalizedFileName = normalizeFileHoverText(fileName);
  if (
    normalizedFileName &&
    normalizedPath.toLowerCase().endsWith(`/${normalizedFileName.toLowerCase()}`)
  ) {
    return normalizedPath.slice(0, -normalizedFileName.length - 1);
  }

  if (normalizedPath === normalizedFileName) {
    return "";
  }

  return normalizedPath;
};

const getFileHoverTypeLabel = (
  fileEntry: ExplorerFileEntry,
): string => {
  if (fileEntry.badgeState?.kind === "ready") {
    return normalizeFileHoverText(fileEntry.badgeState.label);
  }

  return getFirstFileHoverText(
    fileEntry.curveTypeBadgeLabel,
    fileEntry.curveType,
  );
};

const getFirstFileHoverText = (
  ...values: readonly unknown[]
): string => {
  for (const value of values) {
    const text = normalizeFileHoverText(value);
    if (text) {
      return text;
    }
  }

  return "";
};

const normalizeFileHoverText = (
  value: unknown,
): string =>
  String(value ?? "")
    .trim()
    .replace(/\\/g, "/");

const createBadgePresentation = (
  fileKey: string,
  badge: FileItemTableModel | FileSourceStatusBadge | FilePendingTableModel | null,
  badgeColors: FilesExplorerBadgeColors,
): ExplorerBadgePresentation => {
  if (!badge) {
    return null;
  }

  return {
    color: resolveBadgePresentationColor(badge, badgeColors),
    fileKey,
    isWarning: badge.isWarning,
    label: badge.label,
    source: "source" in badge ? badge.source : null,
    state: badge.state,
    title: "title" in badge ? badge.title : null,
  };
};

const resolveBadgePresentationColor = (
  badge: FileItemTableModel | FileSourceStatusBadge | FilePendingTableModel,
  badgeColors: FilesExplorerBadgeColors,
): string | null => {
  if (badge.state === "source" || badge.state === "pending") {
    return null;
  }

  if (badge.state === "unknown") {
    return badgeColors.unknown ?? "orange";
  }

  const label = badge.label.trim().toLowerCase();
  return badgeColors[label] ?? "neutral";
};

const getFileIdsFromTreeNodes = (
  nodes: readonly ITreeNode<FileTreeNode>[],
): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.element.kind !== "file") {
      continue;
    }

    const fileId = String(node.element.entry?.fileId ?? "").trim();
    if (!fileId || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    result.push(fileId);
  }

  return result;
};

const applyFileItemShellState = (
  host: HTMLElement,
  {
    fileEntry,
    fileId,
    fileName,
    isEditing,
    isSelected,
  }: {
    readonly fileEntry: ExplorerFileEntry;
    readonly fileId: string | null;
    readonly fileName: string;
    readonly isEditing: boolean;
    readonly isSelected: boolean;
  },
): void => {
  if (host.className !== "file-list-item") {
    host.className = "file-list-item";
  }
  delete host.dataset.expanded;
  host.removeAttribute("title");
  host.setAttribute(
    "aria-label",
    localize("files.import.fileItemAriaLabel", "File {fileName}", { fileName }),
  );
  if (isSelected) {
    host.dataset.selected = "true";
  } else {
    delete host.dataset.selected;
  }
  if (fileId) {
    host.dataset.fileId = fileId;
  } else {
    delete host.dataset.fileId;
  }
  const itemKey = normalizeFileItemKey(fileEntry.itemKey);
  if (itemKey) {
    host.dataset.itemKey = itemKey;
  } else {
    delete host.dataset.itemKey;
  }
  if (fileEntry.chartState) {
    host.dataset.chartState = fileEntry.chartState;
  } else {
    delete host.dataset.chartState;
  }
  if (fileEntry.rawTableStatus?.kind) {
    host.dataset.rawTableStatus = fileEntry.rawTableStatus.kind;
  } else {
    delete host.dataset.rawTableStatus;
  }
  if (typeof fileEntry.hasChartData === "boolean") {
    host.dataset.hasChartData = fileEntry.hasChartData ? "true" : "false";
  } else {
    delete host.dataset.hasChartData;
  }
  if (isEditing) {
    host.dataset.editing = "true";
  } else {
    delete host.dataset.editing;
  }
};

const createTableModelRow = (
  label: string,
  value: string | readonly string[],
): HTMLElement => {
  const row = document.createElement("div");
  row.className = "file-list-hover-table-facts-row";

  const term = document.createElement("dt");
  term.className = "file-list-hover-table-facts-label";
  term.textContent = label;

  const description = document.createElement("dd");
  description.className = "file-list-hover-table-facts-value";
  if (typeof value === "string") {
    description.textContent = value;
  } else {
    const list = document.createElement("div");
    list.className = "file-list-hover-table-facts-list";
    for (const item of value) {
      const entry = document.createElement("div");
      entry.className = "file-list-hover-table-facts-list-item";
      entry.textContent = item;
      list.appendChild(entry);
    }
    description.appendChild(list);
  }

  row.append(term, description);
  return row;
};

const appendFileHoverContextRows = (
  container: HTMLElement,
  context: FileHoverContext | null,
  options: {
    readonly includeType: boolean;
  } = { includeType: false },
): void => {
  if (!context) {
    return;
  }

  if (context.fileName) {
    container.appendChild(createTableModelRow(
      localize("files.hoverFileLabel", "File:"),
      context.fileName,
    ));
  }

  if (context.path && context.path !== context.fileName) {
    container.appendChild(createTableModelRow(
      localize("files.hoverPathLabel", "Path:"),
      context.path,
    ));
  }

  if (options.includeType && context.typeLabel) {
    container.appendChild(createTableModelRow(
      localize("files.hoverTypeLabel", "Type:"),
      context.typeLabel,
    ));
  }
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
  private readonly thumbnailGridItemCache = new Map<string, ThumbnailGridItemCacheEntry>();
  private hoverView: IOpenContextView | null = null;
  private hoverContainer: HTMLElement | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private hoverContent: HoverContent | null = null;
  private hoverHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private hoverLayoutFrame: number | null = null;
  private thumbnailVisibleFileIds: readonly string[] = [];
  private hoverViewToken = 0;
  private hoverCacheUse = 0;
  private explorerAppearance: ExplorerAppearance = DEFAULT_EXPLORER_APPEARANCE;
  private activeFolderActionMenus = 0;
  private treeModel: TreeModelCache = {
    folderKeys: [],
    items: [],
    structureSignature: "",
  };
  private fileEntriesByTreeKey = new Map<string, ExplorerFileEntry>();
  private filePresentationSignatures = new Map<string, string>();
  private props: ExplorerViewerProps;
  private readonly treeDelegate = {
    getHeight: () => this.explorerAppearance.rowHeight,
  };
  private readonly getTreeNodeChildren = (node: FileTreeNode) => node.children;
  private readonly getTreeNodeKey = (node: FileTreeNode) => node.key;
  private readonly treeRenderer: ITreeRenderer<FileTreeNode, TreeItemTemplate>;

  constructor(
    private readonly host: HTMLElement,
    private readonly hoverHost: HTMLElement,
    props: ExplorerViewerProps,
    private readonly labels: ResourceLabels,
  ) {
    this.props = props;
    this.explorerAppearance = props.explorerAppearance ?? DEFAULT_EXPLORER_APPEARANCE;
    this.applyExplorerAppearance();
    this.treeRenderer = {
      renderTemplate: (container) => this.createTreeItemTemplate(container),
      renderElement: this.renderTreeElement,
      disposeElement: this.disposeTreeElement,
      disposeTemplate: this.disposeTreeItemTemplate,
    };
    this.treeView = this.disposables.add(
      new ObjectTree<FileTreeNode, TreeItemTemplate>(
        this.host,
        this.createTreeOptions(),
      ),
    );
    this.thumbnailHost = document.createElement("div");
    this.thumbnailHost.className = "file-list-thumbnail-grid";
    this.host.append(this.thumbnailHost);

    this.disposables.add(
      addDisposableListener(this.host, "mouseover", this.handleListMouseOver),
    );
    this.disposables.add(
      addDisposableListener(this.host, "mouseout", this.handleListMouseOut),
    );
    this.disposables.add(
      addDisposableListener(this.host, "mouseleave", this.handleListMouseLeave),
    );
    this.disposables.add(
      addDisposableListener(this.host, "focusin", this.handleListFocusIn),
    );
    this.disposables.add(
      addDisposableListener(this.host, "focusout", this.handleListFocusOut),
    );
    this.disposables.add(
      addDisposableListener(this.host, "contextmenu", this.handleListContextMenu),
    );
    this.disposables.add(this.props.thumbnailPreviewService.onDidChangePreview(event => {
      if (
        this.hoverContent?.kind === "thumbnail" &&
        this.hoverContent.fileId === event.fileId
      ) {
        this.refreshVisibleHover();
      } else {
        this.refreshCachedHoverThumbnail(event.fileId);
      }
      if (getEffectiveViewLayout(this.props) === "thumbnail") {
        this.refreshThumbnailGridItem(event.fileId);
      }
    }));
  }

  getListHandle(): ListHandle {
    return this.treeView;
  }

  setProps(nextProps: ExplorerViewerProps): void {
    const previousSelectedFileId = this.props.selectedFileId ?? null;
    const previousSelectedItemKey = this.props.selectedItemKey ?? null;
    const nextSelectedFileId = nextProps.selectedFileId ?? null;
    const nextSelectedItemKey = nextProps.selectedItemKey ?? null;
    const previousExpandedFolderKeys = this.props.expandedFolderKeys ?? [];
    const nextExpandedFolderKeys = nextProps.expandedFolderKeys ?? [];
    const nextTreeStructureSignature = this.createTreeStructureSignature(nextProps.files);
    const shouldUpdateTree =
      nextTreeStructureSignature !== this.treeModel.structureSignature;
    const nextFilePresentationSignatures = this.createFilePresentationSignatures(
      nextProps.files,
      nextProps,
    );
    const nextFileEntriesByTreeKey = this.createFileEntriesByTreeKey(nextProps.files);
    const changedPresentationKeys = shouldUpdateTree
      ? []
      : this.getChangedPresentationKeys(nextFilePresentationSignatures);
    const shouldUpdateOptions =
      previousSelectedFileId !== nextSelectedFileId ||
      previousSelectedItemKey !== nextSelectedItemKey;
    const shouldUpdateFolderExpansion = !areStringArraysEqual(
      previousExpandedFolderKeys,
      nextExpandedFolderKeys,
    );
    const nextViewLayout = getEffectiveViewLayout(nextProps);
    const shouldClearPlotCache = this.shouldClearThumbnailPlotCache(this.props, nextProps);
    const shouldRefreshVisibleHover = this.shouldRefreshVisibleHoverForPropsChange({
      changedPresentationKeys,
      nextProps,
      nextSelectedFileId,
      previousProps: this.props,
      previousSelectedFileId,
      shouldClearPlotCache,
      shouldUpdateTree,
    });
    const nextExplorerAppearance =
      nextProps.explorerAppearance ?? DEFAULT_EXPLORER_APPEARANCE;
    const nextSelectedTreeKey = getSelectedTreeKey(nextProps);
    const shouldUpdateExplorerAppearance = !areExplorerAppearancesEqual(
      this.explorerAppearance,
      nextExplorerAppearance,
    );
    if (isTemplateApplyPerformanceTraceEnabled()) {
      markTemplateApplyPerformanceTrace("explorer.viewer.setProps", {
        changedPresentationKeyCount: changedPresentationKeys.length,
        fileCount: nextProps.files.length,
        nextMode: nextProps.mode,
        nextSelectedFileId,
        nextSelectedItemKey,
        nextViewLayout,
        previousMode: this.props.mode,
        previousSelectedFileId,
        previousSelectedItemKey,
        previousViewLayout: getEffectiveViewLayout(this.props),
        shouldClearPlotCache,
        shouldUpdateExplorerAppearance,
        shouldUpdateFolderExpansion,
        shouldUpdateOptions,
        shouldUpdateTree,
      });
    }

    this.props = nextProps;
    if (shouldUpdateExplorerAppearance) {
      this.explorerAppearance = nextExplorerAppearance;
      this.applyExplorerAppearance();
    }
    if (shouldClearPlotCache) {
      this.clearHoverThumbnailCache();
    }
    this.host.dataset.viewLayout = nextViewLayout;
    this.fileEntriesByTreeKey = nextFileEntriesByTreeKey;
    this.filePresentationSignatures = nextFilePresentationSignatures;

    if (shouldUpdateTree) {
      this.updateTreeModel(nextTreeStructureSignature);
      if (isTemplateApplyPerformanceTraceEnabled()) {
        markTemplateApplyPerformanceTrace("explorer.tree.setChildren", {
          fileCount: nextProps.files.length,
          folderCount: this.treeModel.folderKeys.length,
          mode: nextProps.mode,
          selectedFileId: nextSelectedFileId,
          selectedItemKey: nextSelectedItemKey,
          viewLayout: nextViewLayout,
        });
      }
      const reconciledExpandedFolderKeys =
        this.props.onFolderKeysChange?.(this.treeModel.folderKeys) ??
        nextExpandedFolderKeys;
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(
          this.treeModel.folderKeys,
          reconciledExpandedFolderKeys,
        ),
        delegate: this.treeDelegate,
        selectedKey: nextSelectedTreeKey,
      });
      this.treeView.setChildren(this.treeModel.items);
    } else {
      const treeOptionsUpdate: IObjectTreeOptionsUpdate<FileTreeNode, TreeItemTemplate> = {
        ...(shouldUpdateOptions ? { selectedKey: nextSelectedTreeKey } : {}),
        ...(shouldUpdateFolderExpansion
          ? {
              collapsedKeys: this.getCollapsedFolderKeys(
                this.treeModel.folderKeys,
                nextExpandedFolderKeys,
              ),
            }
          : {}),
        ...(shouldUpdateExplorerAppearance ? { delegate: this.treeDelegate } : {}),
      };
      if (Object.keys(treeOptionsUpdate).length) {
        if (isTemplateApplyPerformanceTraceEnabled()) {
          markTemplateApplyPerformanceTrace("explorer.tree.updateOptions", {
            collapsedKeys: Boolean(treeOptionsUpdate.collapsedKeys),
            delegate: Boolean(treeOptionsUpdate.delegate),
            mode: nextProps.mode,
            selectedKey: treeOptionsUpdate.selectedKey ?? null,
            viewLayout: nextViewLayout,
          });
        }
        this.treeView.updateOptions(treeOptionsUpdate);
      }

      if (changedPresentationKeys.length && isTemplateApplyPerformanceTraceEnabled()) {
        markTemplateApplyPerformanceTrace("explorer.tree.rerenderByKeys", {
          keyCount: changedPresentationKeys.length,
          mode: nextProps.mode,
          sampleKeys: changedPresentationKeys.slice(0, 8),
          viewLayout: nextViewLayout,
        });
      }
      this.treeView.rerenderByKeys(changedPresentationKeys);
    }

    if (shouldRefreshVisibleHover) {
      this.refreshVisibleHover();
    }
    this.renderThumbnailGrid();
  }

  private shouldRefreshVisibleHoverForPropsChange({
    changedPresentationKeys,
    nextProps,
    nextSelectedFileId,
    previousProps,
    previousSelectedFileId,
    shouldClearPlotCache,
    shouldUpdateTree,
  }: {
    readonly changedPresentationKeys: readonly string[];
    readonly nextProps: ExplorerViewerProps;
    readonly nextSelectedFileId: string | null;
    readonly previousProps: ExplorerViewerProps;
    readonly previousSelectedFileId: string | null;
    readonly shouldClearPlotCache: boolean;
    readonly shouldUpdateTree: boolean;
  }): boolean {
    const content = this.hoverContent;
    if (!content || !this.hoverView) {
      return false;
    }

    if (content.kind !== "thumbnail") {
      return shouldUpdateTree || changedPresentationKeys.length > 0;
    }

    const fileId = content.fileId;
    if (!fileId) {
      return shouldUpdateTree || shouldClearPlotCache;
    }

    if (shouldClearPlotCache) {
      return true;
    }

    if (
      previousSelectedFileId !== nextSelectedFileId &&
      (previousSelectedFileId === fileId || nextSelectedFileId === fileId)
    ) {
      return true;
    }

    const previousFile = previousProps.files.find(file =>
      String(file.fileId ?? "").trim() === fileId);
    const nextFile = nextProps.files.find(file =>
      String(file.fileId ?? "").trim() === fileId);
    if (!previousFile || !nextFile) {
      return true;
    }

    const previousPreviewState: FileItemChartPreviewState = {
      chartState: previousFile.chartState,
      hasChartData: previousFile.hasChartData,
    };
    const nextPreviewState: FileItemChartPreviewState = {
      chartState: nextFile.chartState,
      hasChartData: nextFile.hasChartData,
    };
    if (
      canRequestThumbnailPreviewForProps(previousPreviewState, previousProps) !==
        canRequestThumbnailPreviewForProps(nextPreviewState, nextProps)
    ) {
      return true;
    }

    const previousFileLike = getThumbnailFileLikeFromProps(fileId, previousProps);
    const nextFileLike = getThumbnailFileLikeFromProps(fileId, nextProps);
    if (
      (previousFileLike ? createHoverThumbnailFileSignature(previousFileLike) : "") !==
        (nextFileLike ? createHoverThumbnailFileSignature(nextFileLike) : "")
    ) {
      return true;
    }

    const previousPlotSignature =
      previousProps.thumbnailPlotModelsByFileId?.[fileId]?.signature ?? "";
    const nextPlotSignature =
      nextProps.thumbnailPlotModelsByFileId?.[fileId]?.signature ?? "";
    return previousPlotSignature !== nextPlotSignature;
  }

  dispose(): void {
    this.cancelFileItemHoverHide();
    this.cancelFileItemHoverLayout();
    this.closeFileItemHoverView();
    this.clearHoverThumbnailCache();
    this.clearThumbnailGridCache();
    this.disposables.dispose();
  }

  private applyExplorerAppearance(): void {
    const appearance = this.explorerAppearance;
    this.host.dataset.density = appearance.density;
    this.host.dataset.showBadges = appearance.showBadges ? "true" : "false";
    this.host.style.setProperty("--files-explorer-action-size", `${appearance.actionSize}px`);
    this.host.style.setProperty("--files-explorer-badge-font-size", `${appearance.badgeFontSize}px`);
    this.host.style.setProperty("--files-explorer-badge-line-height", `${appearance.badgeLineHeight}px`);
    this.host.style.setProperty("--files-explorer-font-size", `${appearance.fontSize}px`);
    this.host.style.setProperty("--files-explorer-row-height", `${appearance.rowHeight}px`);
  }

  private createTreeOptions(
    structureSignature = this.createTreeStructureSignature(this.props.files),
  ): IObjectTreeOptions<FileTreeNode, TreeItemTemplate> {
    this.updateTreeModel(structureSignature);
    this.filePresentationSignatures = this.createFilePresentationSignatures(
      this.props.files,
      this.props,
    );
    this.fileEntriesByTreeKey = this.createFileEntriesByTreeKey(this.props.files);
    const { folderKeys, items } = this.treeModel;

    return {
      className: "file-list-tree",
      expandOnlyOnTwistieClick: false,
      getChildren: this.getTreeNodeChildren,
      getKey: this.getTreeNodeKey,
      gap: 0,
      collapsedKeys: this.getCollapsedFolderKeys(
        folderKeys,
        this.props.expandedFolderKeys ?? [],
      ),
      empty: this.renderEmpty,
      disposeEmpty: this.disposeEmpty,
      items,
      delegate: this.treeDelegate,
      onDidChangeCollapseState: this.handleTreeCollapseState,
      onDidRenderRange: this.handleTreeRenderRange,
      onScroll: this.handleTreeScroll,
      onSelect: this.handleTreeSelect,
      renderer: this.treeRenderer,
      selectedKey: getSelectedTreeKey(this.props),
      viewportClassName: "file-list-tree-viewport",
    };
  }

  private getCollapsedFolderKeys(
    folderKeys: readonly string[],
    expandedFolderKeys: readonly string[],
  ): string[] {
    const expanded = new Set(expandedFolderKeys);
    return folderKeys.filter((key) => !expanded.has(key));
  }

  private createTreeStructureSignature(
    files: readonly ExplorerFileEntry[],
  ): string {
    return createExplorerTreeStructureSignature(files);
  }

  private createFilePresentationSignatures(
    files: readonly ExplorerFileEntry[],
    props: ExplorerViewerProps,
  ): Map<string, string> {
    const signatures = new Map<string, string>();
    for (const entry of files) {
      signatures.set(getExplorerTreeFileKey(entry), this.createFilePresentationSignature(entry, props));
    }

    return signatures;
  }

  private createFileEntriesByTreeKey(
    files: readonly ExplorerFileEntry[],
  ): Map<string, ExplorerFileEntry> {
    const entriesByTreeKey = new Map<string, ExplorerFileEntry>();
    for (const entry of files) {
      entriesByTreeKey.set(getExplorerTreeFileKey(entry), entry);
    }

    return entriesByTreeKey;
  }

  private createFilePresentationSignature(
    entry: ExplorerFileEntry,
    props: ExplorerViewerProps,
  ): string {
    return [
      createExplorerFilePresentationSignature(entry, {
        badgeColorSignature: this.getBadgeColorSignature(props.explorerAppearance?.badgeColors),
        isEditing: props.editable?.isEditing === true &&
          props.editable.resource.fileId === entry.fileId,
        templateLabel: this.resolveFileTemplateLabel(entry, props),
        templateSelectionId: getTemplateSelectionId(
          this.resolveFileTemplateSelection(entry.fileId, props),
        ),
      }),
      createFileHoverContextSignature(entry),
      props.mode ?? "",
    ].join("\u001f");
  }

  private getBadgeColorSignature(
    badgeColors: FilesExplorerBadgeColors | undefined,
  ): string {
    const colors = badgeColors ?? DEFAULT_EXPLORER_APPEARANCE.badgeColors;
    return [
      colors.cf ?? "",
      colors.cv ?? "",
      colors.mixed ?? "",
      colors.output ?? "",
      colors.pv ?? "",
      colors.transfer ?? "",
      colors.unknown ?? "",
    ].join("\u001d");
  }

  private getChangedPresentationKeys(
    nextFilePresentationSignatures: ReadonlyMap<string, string>,
  ): string[] {
    const changedKeys: string[] = [];
    for (const [key, nextSignature] of nextFilePresentationSignatures) {
      if (this.filePresentationSignatures.get(key) !== nextSignature) {
        changedKeys.push(key);
      }
    }

    return changedKeys;
  }

  private getCurrentFileEntry(node: FileTreeNode): ExplorerFileEntry | null {
    if (node.kind !== "file") {
      return null;
    }

    return this.fileEntriesByTreeKey.get(node.key) ??
      node.entry ??
      null;
  }

  private updateTreeModel(structureSignature: string): void {
    if (structureSignature === this.treeModel.structureSignature) {
      return;
    }

    const items = buildExplorerTree(this.props.files);
    this.treeModel = {
      folderKeys: collectExplorerFolderKeys(items),
      items,
      structureSignature,
    };
  }

  private readonly handleTreeCollapseState = (collapsedKeys: string[]): void => {
    const collapsed = new Set(collapsedKeys);
    const expandedFolderKeys = this.treeModel.folderKeys.filter((key) => !collapsed.has(key));
    this.props = {
      ...this.props,
      expandedFolderKeys,
    };
    this.props.onFolderExpansionChange?.(expandedFolderKeys);
  };

  private readonly handleTreeScroll = (event: Event): void => {
    this.props.onListScroll?.(event);
    this.scheduleFileItemHoverLayout();
  };

  private readonly handleTreeRenderRange = (
    event: ITreeRenderRangeEvent<FileTreeNode>,
  ): void => {
    if (!this.props.onVisibleFileIdsChange) {
      return;
    }

    const visibleFileIds = getFileIdsFromTreeNodes(event.visible);
    const visibleFileIdSet = new Set(visibleFileIds);
    const nearbyFileIds = getFileIdsFromTreeNodes(event.rendered)
      .filter(fileId => !visibleFileIdSet.has(fileId));
    this.props.onVisibleFileIdsChange(visibleFileIds, nearbyFileIds);
  };

  private readonly handleTreeSelect = ({ element }: ITreeSelectionEvent<FileTreeNode>): void => {
    if (element.kind === "folder") {
      return;
    }

    const fileEntry = this.getCurrentFileEntry(element);
    if (!fileEntry?.fileId) {
      return;
    }

    this.props.onSelectFile(fileEntry.fileId, fileEntry.itemKey ?? null);
  };

  private readonly handleListContextMenu = (event: MouseEvent): void => {
    const item = this.getFileItemFromEvent(event);
    if (!item) {
      return;
    }

    const fileId = item.dataset.fileId ?? "";
    if (!fileId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.hideFileItemHover();
    this.props.onRequestTemplates?.();

    this.props.contextMenuService.showContextMenu({
      getAnchor: () => ({
        x: event.clientX,
        y: event.clientY,
        width: 2,
        height: 2,
      }),
      getActions: () => this.createFileContextActions(fileId),
      getCheckedActionsRepresentation: () => "radio",
    });
  };

  private createFileContextActions(fileId: string): IAction[] {
    const revealActions: IAction[] = this.canRevealFileInOS(fileId)
      ? [
          createMenuAction({
            id: REVEAL_IN_OS_COMMAND_ID,
            label: getRevealInOSLabel(),
            run: () => {
              void this.props.commandService.executeCommand(
                REVEAL_IN_OS_COMMAND_ID,
                fileId,
              );
            },
          }),
        ]
      : [];
    const templateActions: IAction[] = [
      this.createTemplateMenuAction({
        actionPrefix: SET_FILE_TEMPLATE_COMMAND_ID,
        commandId: SET_FILE_TEMPLATE_COMMAND_ID,
        fileId,
        label: localize("files.item.setTemplate", "Set with Template"),
      }),
    ];
    const editActions: IAction[] = [
      createMenuAction({
        id: RENAME_FILE_ITEM_COMMAND_ID,
        label: localize("files.item.rename", "Rename"),
        run: () => {
          void this.props.commandService.executeCommand(
            RENAME_FILE_ITEM_COMMAND_ID,
            fileId,
          );
        },
      }),
      createMenuAction({
        id: DELETE_FILE_ITEM_COMMAND_ID,
        label: localize("files.item.delete", "Delete"),
        run: () => {
          void this.props.commandService.executeCommand(
            DELETE_FILE_ITEM_COMMAND_ID,
            fileId,
          );
        },
      }),
    ];

    return Separator.join(revealActions, templateActions, editActions);
  }

  private canRevealFileInOS(fileId: string): boolean {
    if (!CommandsRegistry.getCommand(REVEAL_IN_OS_COMMAND_ID)) {
      return false;
    }

    const file = this.props.files.find(candidate => candidate.fileId === fileId);
    return Boolean(
      String(file?.sourcePath ?? "").trim() ||
      String(file?.normalizedCsvPath ?? "").trim(),
    );
  }

  private createTemplateMenuAction({
    actionPrefix,
    commandId,
    fileId,
    label,
  }: {
    readonly actionPrefix: string;
    readonly commandId: string;
    readonly fileId: string;
    readonly label: string;
  }): IAction {
    if (!this.hasUserTemplates()) {
      return createMenuAction({
        enabled: false,
        id: commandId,
        label,
        run: () => {},
      });
    }

    return new SubmenuAction(
      commandId,
      label,
      this.createTemplateContextActions({
        actionPrefix,
        commandId,
        fileId,
      }),
    );
  }

  private hasUserTemplates(): boolean {
    return (this.props.templateRecords ?? []).some(template =>
      isUserTemplateId(template.id),
    );
  }

  private createTemplateContextActions({
    actionPrefix,
    commandId,
    fileId,
  }: {
    readonly actionPrefix: string;
    readonly commandId: string;
    readonly fileId: string;
  }): IAction[] {
    const currentSelection = this.resolveFileTemplateSelection(fileId);
    const currentSelectionId = getTemplateSelectionId(currentSelection);
    const actions: IAction[] = [
      createMenuAction({
        checked: currentSelection.kind === "auto",
        id: `${actionPrefix}.auto`,
        label: localize("template.recommendedTemplate", "Recommended template"),
        run: () => {
          void this.props.commandService.executeCommand(
            commandId,
            fileId,
            { kind: "auto" },
          );
        },
        selected: currentSelection.kind === "auto",
      }),
    ];

    const templates = this.props.templateRecords ?? [];
    for (const template of templates) {
      const templateId = String(template.id ?? "").trim();
      if (!isUserTemplateId(templateId)) {
        continue;
      }

      actions.push(createMenuAction({
        checked: currentSelectionId === templateId,
        id: `${actionPrefix}.${templateId}`,
        label: template.name || templateId,
        run: () => {
          void this.props.commandService.executeCommand(
            commandId,
            fileId,
            createTemplateSelection(templateId),
          );
        },
        selected: currentSelectionId === templateId,
      }));
    }

    return actions;
  }

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

    const fileEntry = this.getCurrentFileEntry(element);
    if (fileEntry) {
      this.renderFileItem(
        fileEntry,
        isExplorerFileEntrySelected(fileEntry, this.props),
        template.file,
      );
    }
  };

  private readonly disposeTreeElement = (
    node: ITreeNode<FileTreeNode>,
    _index: number,
    template: TreeItemTemplate,
  ): void => {
    if (isTemplateApplyPerformanceTraceEnabled()) {
      markTemplateApplyPerformanceTrace("explorer.tree.disposeElement", {
        fileId: node.element.kind === "file" ? node.element.entry?.fileId ?? null : null,
        kind: node.element.kind,
        key: node.element.key,
        templateFileId: template.file.fileId,
      });
    }
    if (this.hoverAnchor === template.file.host) {
      this.hideFileItemHover(template.file.host);
    }
    template.file.fileId = null;
    template.file.editorStore.clear();
    template.folder.currentNode = null;
  };

  private createTreeItemTemplate(host: HTMLElement): TreeItemTemplate {
    return {
      file: this.createFileItemTemplate(host),
      folder: this.createFolderItemTemplate(host),
    };
  }

  private readonly disposeTreeItemTemplate = (template: TreeItemTemplate): void => {
    template.file.editorStore.dispose();
    template.file.label.dispose();
    template.folder.actionButton.dispose();
  };

  private resolveFileTemplateLabel(
    fileEntry: ExplorerFileEntry,
    props: ExplorerViewerProps = this.props,
  ): string {
    const selection = this.resolveFileTemplateSelection(fileEntry.fileId, props);

    if (selection.kind === "auto") {
      return localize("template.recommendedTemplate", "Recommended template");
    }
    if (selection.kind === "inline") {
      return selection.template.name;
    }

    const selectionTemplateId = getTemplateSelectionTemplateId(selection);
    return props.templateRecords?.find(template => template.id === selectionTemplateId)?.name ||
      selectionTemplateId ||
      localize("template.unknownTemplate", "Unknown template");
  }

  private resolveFileTemplateSelection(
    fileId: string | null | undefined,
    props: ExplorerViewerProps = this.props,
  ): TemplateSelection {
    return resolveTemplateSelectionForFile(
      fileId,
      props.fileTemplateSelectionsByFileId ?? {},
      { kind: "auto" },
    );
  }

  private renderFileItem(
    fileEntry: ExplorerFileEntry,
    isSelected: boolean,
    template: FileItemTemplate,
  ): void {
    const fileName = getFileName(fileEntry);
    const fileId = fileEntry.fileId ?? null;
    const isEditing = Boolean(
      fileId &&
        this.props.editable?.isEditing === true &&
        this.props.editable.resource.fileId === fileId,
    );
    const sourceStatus = createFileSourceStatusBadge(fileEntry);
    const tableModelBadge = createFileItemTableModel(
      fileEntry,
      this.resolveFileTemplateLabel(fileEntry),
    );
    const pendingTableModel = createFilePendingTableModel(fileEntry);
    const { host } = template;
    const fileKey = getFileRenderKey(fileEntry);
    const presentationSignature = this.createFilePresentationSignature(fileEntry, this.props);
    if (this.hoverAnchor === host && template.fileId !== fileId) {
      this.hideFileItemHover(host);
    }

    applyFileItemShellState(host, {
      fileEntry,
      fileId,
      fileName,
      isEditing,
      isSelected,
    });
    const canReuseRenderedPresentation =
      !isEditing &&
      template.fileRenderKey === fileKey &&
      template.filePresentationSignature === presentationSignature &&
      template.content.parentElement === host &&
      template.actions.parentElement === host;
    template.fileId = fileId;
    if (canReuseRenderedPresentation) {
      if (isTemplateApplyPerformanceTraceEnabled()) {
        markTemplateApplyPerformanceTrace("explorer.fileItem.reuse", {
          chartState: fileEntry.chartState ?? null,
          fileId,
          fileKey,
          mode: this.props.mode,
          selected: isSelected,
          viewLayout: getEffectiveViewLayout(this.props),
        });
      }
      return;
    }

    if (isTemplateApplyPerformanceTraceEnabled()) {
      markTemplateApplyPerformanceTrace("explorer.fileItem.render", {
        actionsAttached: template.actions.parentElement === host,
        chartState: fileEntry.chartState ?? null,
        contentAttached: template.content.parentElement === host,
        fileId,
        fileKey,
        isEditing,
        mode: this.props.mode,
        samePresentationSignature: template.filePresentationSignature === presentationSignature,
        sameRenderKey: template.fileRenderKey === fileKey,
        selected: isSelected,
        viewLayout: getEffectiveViewLayout(this.props),
      });
    }
    template.fileRenderKey = fileKey;
    template.filePresentationSignature = presentationSignature;
    template.badge.bind(fileKey);
    const hoverTableModel = tableModelBadge;
    if (hoverTableModel) {
      host.dataset.autoType = hoverTableModel.type;
      host.dataset.autoConfidence = hoverTableModel.confidence;
      host.dataset.autoReasons = hoverTableModel.reasons.join(FILE_TABLE_MODEL_REASON_SEPARATOR);
      host.dataset.autoTemplate = hoverTableModel.template;
      host.dataset.autoWarning = hoverTableModel.isWarning ? "true" : "false";
    } else {
      delete host.dataset.autoType;
      delete host.dataset.autoConfidence;
      delete host.dataset.autoReasons;
      delete host.dataset.autoTemplate;
      delete host.dataset.autoWarning;
    }
    if (sourceStatus) {
      host.dataset.sourceStatus = sourceStatus.status;
    } else {
      delete host.dataset.sourceStatus;
    }
    if (fileEntry.badgeState?.kind) {
      host.dataset.badgeState = fileEntry.badgeState.kind;
    } else {
      delete host.dataset.badgeState;
    }
    if (fileEntry.badgeState?.kind === "ready") {
      host.dataset.badgeSource = fileEntry.badgeState.source;
    } else if (fileEntry.badgeState?.kind === "unknown") {
      host.dataset.badgeSource = fileEntry.badgeState.source;
    } else {
      delete host.dataset.badgeSource;
    }

    template.editorStore.clear();
    template.label.element.style.display = "";
    template.label.setResource(
      {
        name: fileName,
        resource: fileEntry.relativePath ?? fileName,
      },
      {
        extraClasses: ["explorer-item"],
        fileKind: FileKind.FILE,
      },
    );
    if (isEditing && fileId) {
      let draftName = fileName;
      const editLabel = localize("files.rename.ariaLabel", "Rename {fileName}", { fileName });
      const editor = new InlineEditableTextWidget({
        className: "file-list-item-inline-editor",
        draftValue: draftName,
        editing: true,
        inputClassName: "file-list-item-inline-input",
        onCancel: () => this.props.onCancelRenameFile?.(),
        onChange: (nextValue) => {
          draftName = nextValue;
        },
        onCommit: () => this.props.onRenameFile?.(fileId, draftName),
        onStartEdit: () => undefined,
        title: editLabel,
        value: fileName,
      });
      template.editorStore.add(editor);
      template.editorStore.add(addDisposableListener(editor.element, "mousedown", event => {
        event.stopPropagation();
      }));
      template.editorStore.add(addDisposableListener(editor.element, "click", event => {
        event.stopPropagation();
      }));
      editor.inputElement.setAttribute("aria-label", editLabel);
      template.label.element.style.display = "none";
      template.content.append(editor.element);
    }
    const badge = sourceStatus?.status === "failed"
      ? sourceStatus
      : tableModelBadge ?? sourceStatus ?? pendingTableModel;
    template.badge.setBadge(fileKey, createBadgePresentation(
      fileKey,
      badge,
      this.explorerAppearance.badgeColors,
    ));
    template.removeButton.setAttribute(
      "aria-label",
      localize("files.import.closeFileButtonLabel", "Close {fileName}", { fileName }),
    );
    template.removeButton.hidden = !fileEntry.fileId;
    template.actions.hidden = isEditing;
    if (
      template.content.parentElement !== host ||
      template.actions.parentElement !== host
    ) {
      host.replaceChildren(template.content, template.actions);
    }
  }

  private renderThumbnailGrid(): void {
    const files = this.getThumbnailFiles();
    if (getEffectiveViewLayout(this.props) !== "thumbnail") {
      this.thumbnailVisibleFileIds = [];
      this.pruneThumbnailGridCache(files);
      return;
    }

    this.publishThumbnailVisibleFileIds(files);

    const nextKeys = new Set<string>();
    const nodes: HTMLButtonElement[] = [];
    files.forEach((file, index) => {
      const key = createThumbnailGridItemKey(file, index);
      nextKeys.add(key);

      let entry = this.thumbnailGridItemCache.get(key);
      if (!entry) {
        entry = this.createThumbnailItem(key);
        this.thumbnailGridItemCache.set(key, entry);
      }

      this.updateThumbnailItem(entry, file, "request");
      nodes.push(entry.node);
    });

    for (const [key, entry] of this.thumbnailGridItemCache) {
      if (nextKeys.has(key)) {
        continue;
      }

      entry.node.remove();
      this.thumbnailGridItemCache.delete(key);
    }

    if (!areSameChildNodes(this.thumbnailHost, nodes)) {
      this.thumbnailHost.replaceChildren(...nodes);
    }
  }

  private getThumbnailFiles(): ThumbnailFileLike[] {
    const thumbnailFiles = Array.isArray(this.props.thumbnailFiles) ? this.props.thumbnailFiles : [];
    if (!thumbnailFiles.length) {
      return this.props.files.map(file => ({
        curveFilterField: null,
        curveFilterKey: null,
        curveType: file.curveType ?? undefined,
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
      return thumbnailFiles;
    }

    return thumbnailFiles.filter(file => fileIds.has(String(file.fileId ?? "").trim()));
  }

  private createThumbnailItem(key: string): ThumbnailGridItemCacheEntry {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "file-list-thumbnail-item";
    item.dataset.thumbnailKey = key;
    item.addEventListener("click", () => {
      this.props.onSelectFile(
        String(item.dataset.fileId ?? "").trim() || null,
        String(item.dataset.itemKey ?? "").trim() || null,
      );
    });
    return {
      node: item,
      thumbnail: document.createElement("div"),
    };
  }

  private updateThumbnailItem(
    entry: ThumbnailGridItemCacheEntry,
    file: ThumbnailFileLike,
    previewReadMode: "get" | "request",
  ): void {
    const fileName = String(file.fileName ?? file.fileId ?? "");
    const fileId = String(file.fileId ?? "").trim();
    const previewState = previewReadMode === "request"
      ? this.getThumbnailPreviewState(fileId, "visible")
      : this.props.thumbnailPreviewService.get(fileId);
    const previewPlotModel = getPreviewPlotModel(previewState);
    const plotModel = previewPlotModel ??
      this.getThumbnailPlotModel(fileId) ??
      this.getCachedHoverThumbnailPlotModel(fileId);
    const isLoading = previewState.kind === "loading" && !plotModel;
    entry.node.setAttribute(
      "aria-label",
      localize("files.import.fileItemAriaLabel", "File {fileName}", { fileName }),
    );
    if (fileId) {
      entry.node.dataset.fileId = fileId;
    } else {
      delete entry.node.dataset.fileId;
    }

    const thumbnailProps = {
      file,
      isLoading,
      isActive: fileId === (this.props.selectedFileId ?? null) &&
        !this.props.selectedItemKey,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel,
      plotType: this.props.activePlotType ?? "iv",
      thumbnailService: this.props.thumbnailService,
    };
    if (!entry.thumbnail.classList.contains("thumbnail_view")) {
      entry.thumbnail = createThumbnailView(thumbnailProps);
    } else if (!updateThumbnailView(entry.thumbnail, thumbnailProps)) {
      const nextThumbnail = createThumbnailView(thumbnailProps);
      entry.thumbnail.replaceWith(nextThumbnail);
      entry.thumbnail = nextThumbnail;
    }

    if (entry.thumbnail.parentElement !== entry.node) {
      entry.node.replaceChildren(entry.thumbnail);
    }
  }

  private refreshThumbnailGridItem(fileId: string): void {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const entry = this.thumbnailGridItemCache.get(normalizedFileId);
    const file = getThumbnailFileLikeFromProps(normalizedFileId, this.props);
    if (!entry || !file) {
      return;
    }

    this.updateThumbnailItem(entry, file, "get");
  }

  private publishThumbnailVisibleFileIds(files: readonly ThumbnailFileLike[]): void {
    if (!this.props.onVisibleFileIdsChange) {
      return;
    }

    const visibleFileIds = files
      .map(file => String(file.fileId ?? "").trim())
      .filter(fileId => fileId.length > 0);
    if (areStringArraysEqual(this.thumbnailVisibleFileIds, visibleFileIds)) {
      return;
    }

    this.thumbnailVisibleFileIds = visibleFileIds;
    this.props.onVisibleFileIdsChange(visibleFileIds, []);
  }

  private pruneThumbnailGridCache(files: readonly ThumbnailFileLike[]): void {
    const keys = new Set(files.map((file, index) => createThumbnailGridItemKey(file, index)));
    for (const [key, entry] of this.thumbnailGridItemCache) {
      if (keys.has(key)) {
        continue;
      }

      entry.node.remove();
      this.thumbnailGridItemCache.delete(key);
    }
  }

  private createFileItemTemplate(host: HTMLElement): FileItemTemplate {
    const content = document.createElement("div");
    content.className = "file-list-item-content";
    const label = this.labels.create(content, {
      className: "file-list-item-label",
    });

    const actions = document.createElement("div");
    actions.className = "file-list-item-actions";
    const tableModelHost = document.createElement("span");
    tableModelHost.className = "file-list-item-table-models";
    tableModelHost.hidden = true;
    const badge = new ExplorerBadgeNode(tableModelHost);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "file-list-item-remove";
    const template: FileItemTemplate = {
      actions,
      badge,
      content,
      editorStore: new DisposableStore(),
      fileId: null,
      filePresentationSignature: "",
      fileRenderKey: null,
      host,
      label,
      removeButton,
    };
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.props.commandService.executeCommand(
        CLOSE_FILE_ITEM_COMMAND_ID,
        template.fileId,
      );
    });
    appendIcon(removeButton, LxIcon.close);

    actions.append(tableModelHost, removeButton);
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
      onDidChangeVisibility: visible => {
        this.setFolderActionMenuActive(visible);
      },
      render: (menuHost) => renderMenuItems(menuHost, {
        className: "file-list-folder-menu",
        items: () => this.createFolderActions(template.currentNode),
      }),
      surfaceClassName: "file-list-folder-menu-surface",
      triggerIcon: LxIcon.moreHorizontal,
    });
    const actionButtonDisposables = new DisposableStore();
    actionButtonDisposables.add(actionButton);
    actionButtonDisposables.add(countBadge);
    actionButtonDisposables.add(
      addDisposableListener(actionButton.domNode, "mouseover", () => {
        this.hideFileItemHover();
      }),
    );
    actionButtonDisposables.add(
      addDisposableListener(actionButton.domNode, "focusin", () => {
        this.hideFileItemHover();
      }),
    );
    actionButtonDisposables.add(
      addDisposableListener(actionButton.domNode, "pointerdown", () => {
        this.hideFileItemHover();
      }),
    );
    actionButtonDisposables.add({
      dispose: () => {
        if (actionButton.domNode.getAttribute("aria-expanded") === "true") {
          this.setFolderActionMenuActive(false);
        }
      },
    });
    actionsHost.appendChild(actionButton.domNode);
    controls.appendChild(actionsHost);
    template.actionButton = actionButtonDisposables;
    return template;
  }

  private renderFolderItem(
    node: FileTreeNode,
    isExpanded: boolean,
    template: FolderItemTemplate,
  ): void {
    const { host } = template;
    if (this.hoverAnchor === host) {
      this.hideFileItemHover(host);
    }
    template.currentNode = node;
    host.className = "file-list-folder-item";
    host.title = node.name;
    host.removeAttribute("aria-label");
    delete host.dataset.autoType;
    delete host.dataset.autoConfidence;
    delete host.dataset.autoReasons;
    delete host.dataset.autoTemplate;
    delete host.dataset.autoWarning;
    delete host.dataset.chartState;
    delete host.dataset.hasChartData;
    delete host.dataset.rawTableStatus;
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

  private readonly handleListMouseLeave = (): void => {
    this.hideFileItemHover();
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

  private getFileItemFromEvent(event: Event): HTMLElement | null {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const item = target.closest(".file-list-item");
    return item instanceof HTMLElement ? item : null;
  }

  private getThumbnailFileLike(fileId: string | null | undefined): ThumbnailFileLike | null {
    return getThumbnailFileLikeFromProps(fileId, this.props);
  }

  private shouldDismissVisibleHoverForContent(content: HoverContent): boolean {
    return (
      this.hoverContent?.kind === "thumbnail" &&
      (content.kind !== "thumbnail" || this.hoverContent.fileId !== content.fileId)
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
      item?.contains(target),
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

  private showFileItemHover(item: HTMLElement, forceRender = false): void {
    if (this.isFolderActionMenuActive()) {
      this.hideFileItemHover();
      return;
    }

    const content = this.resolveHoverContent(item);
    if (!content) {
      this.hideFileItemHover();
      return;
    }

    this.props.onHoverFileChange?.(content.kind === "thumbnail" ? content.fileId : null);
    this.cancelFileItemHoverHide();
    if (
      this.hoverAnchor === item &&
      this.hoverView &&
      this.hoverContainer &&
      isSameHoverContent(this.hoverContent, content)
    ) {
      if (forceRender) {
        this.hoverContent = content;
        this.renderHoverContent(this.hoverContainer);
        this.scheduleFileItemHoverLayout();
      }
      return;
    }

    const previousContent = this.hoverContent;
    if (this.tryReuseFileItemHoverView(item, content, previousContent)) {
      return;
    }

    this.closeFileItemHoverView(previousContent);
    this.hoverAnchor = item;
    this.hoverContent = content;
    this.openFileItemHoverView(item, content);
  }

  private tryReuseFileItemHoverView(
    item: HTMLElement,
    content: HoverContent,
    previousContent: HoverContent | null,
  ): boolean {
    if (
      !this.hoverView ||
      !this.hoverContainer ||
      !previousContent ||
      previousContent.kind !== "thumbnail" ||
      content.kind !== "thumbnail"
    ) {
      return false;
    }

    const previousAnchor = this.hoverAnchor;
    this.hoverAnchor = item;
    this.hoverContent = content;
    this.renderHoverContent(this.hoverContainer);
    if (!this.isRenderedHoverContentCurrent(this.hoverContainer, content)) {
      this.hoverAnchor = previousAnchor;
      this.hoverContent = previousContent;
      this.closeFileItemHoverView(previousContent);
      return false;
    }

    if (previousContent.fileId !== content.fileId) {
      this.warmCachedDetachedHoverThumbnail(previousContent.fileId);
    }
    logPerf("thumbnailHover.reuseShell", {
      cacheSize: this.hoverThumbnailCache.size,
      fileId: content.fileId,
      previousFileId: previousContent.fileId,
    });
    this.scheduleFileItemHoverLayout();
    return true;
  }

  private setFolderActionMenuActive(active: boolean): void {
    this.activeFolderActionMenus = Math.max(
      0,
      this.activeFolderActionMenus + (active ? 1 : -1),
    );
    if (active) {
      this.hideFileItemHover();
    }
  }

  private isFolderActionMenuActive(): boolean {
    return this.activeFolderActionMenus > 0;
  }

  private openFileItemHoverView(item: HTMLElement, content: HoverContent): void {
    const token = this.hoverViewToken + 1;
    this.hoverViewToken = token;
    const isThumbnailHover = content.kind === "thumbnail";
    if (isThumbnailHover) {
      logPerf("thumbnailHover.open", {
        cacheSize: this.hoverThumbnailCache.size,
        fileId: content.fileId,
        isSelected: content.isSelected,
      });
    }
    const classNames = isThumbnailHover
      ? ["file-list-hover", "file-list-hover--thumbnail"]
      : ["file-list-hover", "file-list-hover--table-facts"];

    this.hoverView = this.props.contextViewService.showContextView({
      anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
      anchorPosition: AnchorPosition.RIGHT,
      canRelayout: true,
      getAnchor: () => this.hoverAnchor ?? item,
      getWidth: isThumbnailHover
        ? getFileHoverThumbnailWidth
        : undefined,
      layer: 40,
      render: (container) => this.renderFileItemHoverView(container, classNames),
      onHide: () => {
        if (this.hoverViewToken === token) {
          this.hoverView = null;
        }
      },
    });
  }

  private renderFileItemHoverView(
    container: HTMLElement,
    classNames: readonly string[],
  ): IDisposable {
    const disposables = new DisposableStore();
    container.classList.add(...classNames);
    container.setAttribute("role", "tooltip");
    this.hoverContainer = container;
    disposables.add({
      dispose: () => {
        if (this.hoverContainer === container) {
          this.hoverContainer = null;
        }
        container.classList.remove(
          "file-list-hover",
          "file-list-hover--table-facts",
          "file-list-hover--thumbnail",
        );
        container.removeAttribute("role");
      },
    });
    this.renderHoverContent(container);
    return disposables;
  }

  private resolveHoverContent(item: HTMLElement): HoverContent | null {
    if (this.props.mode === "chart") {
      return this.resolveThumbnailHoverContent(item);
    }

    return this.resolveTableModelHoverContent(item);
  }

  private resolveThumbnailHoverContent(item: HTMLElement): HoverContent | null {
    if (getEffectiveViewLayout(this.props) === "thumbnail") {
      return null;
    }

    const fileId = String(item.dataset.fileId ?? "").trim();
    if (!fileId) {
      return null;
    }

    const fileEntry = this.getExplorerFileEntryByFileId(fileId);
    if (!canRequestThumbnailPreviewForProps(
      getFileItemChartPreviewState(item, fileEntry),
      this.props,
    )) {
      return null;
    }

    const file = this.getThumbnailFileLike(fileId);
    if (!file) {
      return null;
    }

    return {
      kind: "thumbnail",
      file,
      fileId,
      isSelected: item.dataset.selected === "true",
    };
  }

  private getExplorerFileEntryByFileId(fileId: string): ExplorerFileEntry | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    return this.props.files.find(file =>
      String(file.fileId ?? "").trim() === normalizedFileId,
    ) ?? null;
  }

  private resolveTableModelHoverContent(item: HTMLElement): HoverContent | null {
    const fileContext = this.resolveFileHoverContext(item);
    const type = item.dataset.autoType ?? "";
    if (!type) {
      return fileContext
        ? {
            kind: "file",
            fileContext,
          }
        : null;
    }

    return {
      kind: "tableModel",
      fileContext,
      isWarning: item.dataset.autoWarning === "true",
      type,
      confidence: item.dataset.autoConfidence ?? "",
      reasons: (item.dataset.autoReasons ?? "")
        .split(FILE_TABLE_MODEL_REASON_SEPARATOR)
        .map(reason => reason.trim())
        .filter(Boolean),
      template: item.dataset.autoTemplate ?? "",
    };
  }

  private resolveFileHoverContext(item: HTMLElement): FileHoverContext | null {
    const fileId = String(item.dataset.fileId ?? "").trim();
    if (!fileId) {
      return null;
    }

    const fileEntry = this.getExplorerFileEntryByFileId(fileId);
    return fileEntry ? createFileHoverContext(fileEntry) : null;
  }

  private renderHoverContent(container: HTMLElement): void {
    const content = this.hoverContent;
    if (!content) {
      return;
    }

    if (content.kind === "thumbnail") {
      container.dataset.hoverKind = "thumbnail";
      container.dataset.hoverFileId = content.fileId;
      const thumbnail = this.getHoverThumbnail(
        content.fileId,
        content.file,
        content.isSelected,
      );
      if (
        container.childElementCount === 1 &&
        container.firstElementChild === thumbnail
      ) {
        if (!this.isRenderedHoverContentCurrent(container, content)) {
          container.replaceChildren();
          return;
        }
        this.refreshCachedHoverThumbnail(content.fileId);
        return;
      }

      container.replaceChildren(thumbnail);
      if (!this.isRenderedHoverContentCurrent(container, content)) {
        container.replaceChildren();
        return;
      }
      this.refreshCachedHoverThumbnail(content.fileId);
      return;
    }

    delete container.dataset.hoverFileId;
    container.dataset.hoverKind = content.kind;
    container.replaceChildren();
    const details = document.createElement("dl");
    details.className = "file-list-hover-table-facts";
    details.dataset.warning = content.kind === "tableModel" && content.isWarning ? "true" : "false";
    appendFileHoverContextRows(details, content.fileContext, {
      includeType: content.kind === "file",
    });
    if (content.kind === "file") {
      container.appendChild(details);
      return;
    }

    details.append(
      createTableModelRow(localize("files.autoTypeLabel", "Type:"), content.type),
      createTableModelRow(localize("files.autoConfidenceLabel", "Confidence:"), content.confidence),
      createTableModelRow(localize("files.autoReasonLabel", "Basis:"), content.reasons),
      createTableModelRow(localize("files.autoTemplateLabel", "Template:"), content.template),
    );
    container.appendChild(details);
  }

  private getHoverThumbnail(fileId: string, file: ThumbnailFileLike, isActive: boolean): HTMLElement {
    const normalizedFileId = String(fileId || file.fileId || file.fileName || "").trim();
    const cacheKey = normalizedFileId || "__unknown__";
    const previewState = normalizedFileId
      ? this.props.thumbnailPreviewService.request(normalizedFileId, "hover")
      : { kind: "idle" } satisfies ThumbnailPreviewState;
    const previewPlotModel = getPreviewPlotModel(previewState);
    const fallbackPlotModel = previewPlotModel ? null : this.getThumbnailPlotModel(fileId);
    const cached = this.hoverThumbnailCache.get(cacheKey);
    const plotModel = previewPlotModel ?? fallbackPlotModel ?? cached?.plotModel ?? null;
    const isLoading = previewState.kind === "loading" && !plotModel;
    const fileSignature = createHoverThumbnailFileSignature(file);
    const plotModelSignature = plotModel?.signature ?? "";
    this.hoverCacheUse += 1;
    const canReuseCachedNode =
      cached?.fileId === normalizedFileId &&
      cached.fileSignature === fileSignature &&
      cached.node.dataset.hoverFileId === normalizedFileId;
    if (
      canReuseCachedNode &&
      cached.isLoading === isLoading &&
      cached.plotModelSignature === plotModelSignature &&
      cached.node.dataset.hoverPlotSignature === plotModelSignature
    ) {
      this.warmDetachedHoverThumbnail(
        cached,
        plotModel,
        plotModelSignature,
        normalizedFileId,
      );
      if (cached.isActive !== isActive) {
        updateThumbnailView(cached.node, {
          drawStrategy: "eager",
          file,
          isActive,
          isLoading,
          originOpenPlotOptions: this.props.originOpenPlotOptions,
          plotAxisSettings: this.props.plotAxisSettings,
          plotModel,
          plotType: this.props.activePlotType ?? "iv",
          thumbnailService: this.props.thumbnailService,
        });
        cached.isActive = isActive;
      }
      cached.lastUsed = this.hoverCacheUse;
      cached.plotModel = plotModel ?? cached.plotModel;
      this.logThumbnailHoverRender({
        cacheHit: true,
        fileId: normalizedFileId,
        isLoading,
        plotModelSignature,
        plotModelSource: getThumbnailHoverPlotModelSource(previewPlotModel, fallbackPlotModel),
        previewState,
      });
      return cached.node;
    }
    if (canReuseCachedNode && cached.plotModelSignature && isLoading && !plotModelSignature) {
      if (cached.isActive !== isActive) {
        updateThumbnailView(cached.node, {
          drawStrategy: "eager",
          file,
          isActive,
          isLoading,
          originOpenPlotOptions: this.props.originOpenPlotOptions,
          plotAxisSettings: this.props.plotAxisSettings,
          plotModel: null,
          plotType: this.props.activePlotType ?? "iv",
          thumbnailService: this.props.thumbnailService,
        });
        cached.isActive = isActive;
      }
      cached.lastUsed = this.hoverCacheUse;
      cached.plotModel = cached.plotModel ?? plotModel;
      this.logThumbnailHoverRender({
        cacheHit: true,
        fileId: normalizedFileId,
        isLoading: false,
        plotModelSignature: cached.plotModelSignature,
        plotModelSource: "preview",
        previewState,
      });
      return cached.node;
    }
    if (
      canReuseCachedNode &&
      plotModel &&
      updateThumbnailView(cached.node, {
        drawStrategy: "eager",
        file,
        isActive,
        isLoading,
        originOpenPlotOptions: this.props.originOpenPlotOptions,
        plotAxisSettings: this.props.plotAxisSettings,
        plotModel,
        plotType: this.props.activePlotType ?? "iv",
        thumbnailService: this.props.thumbnailService,
      })
    ) {
      this.warmDetachedHoverThumbnail(
        cached,
        plotModel,
        plotModelSignature,
        normalizedFileId,
      );
      cached.isActive = isActive;
      cached.isLoading = isLoading;
      cached.lastUsed = this.hoverCacheUse;
      cached.plotModel = plotModel;
      cached.plotModelSignature = plotModelSignature;
      cached.node.dataset.hoverPlotSignature = plotModelSignature;
      this.logThumbnailHoverRender({
        cacheHit: true,
        fileId: normalizedFileId,
        isLoading,
        plotModelSignature,
        plotModelSource: getThumbnailHoverPlotModelSource(previewPlotModel, fallbackPlotModel),
        previewState,
      });
      return cached.node;
    }

    const node = createThumbnailView({
      drawStrategy: "eager",
      file,
      isActive,
      isLoading,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel,
      plotType: this.props.activePlotType ?? "iv",
      thumbnailService: this.props.thumbnailService,
    });
    node.dataset.hoverFileId = normalizedFileId;
    node.dataset.hoverPlotSignature = plotModelSignature;
    cached?.node.remove();
    this.hoverThumbnailCache.set(cacheKey, {
      fileId: normalizedFileId,
      fileSignature,
      isActive,
      isLoading,
      lastUsed: this.hoverCacheUse,
      node,
      plotModel,
      plotModelSignature,
      warmedPlotModelSignature: "",
    });
    this.trimHoverThumbnailCache();
    this.logThumbnailHoverRender({
      cacheHit: false,
      fileId: normalizedFileId,
      isLoading,
      plotModelSignature,
      plotModelSource: getThumbnailHoverPlotModelSource(previewPlotModel, fallbackPlotModel),
      previewState,
    });
    return node;
  }

  private logThumbnailHoverRender({
    cacheHit,
    fileId,
    isLoading,
    plotModelSignature,
    plotModelSource,
    previewState,
  }: {
    readonly cacheHit: boolean;
    readonly fileId: string;
    readonly isLoading: boolean;
    readonly plotModelSignature: string;
    readonly plotModelSource: "explorer" | "none" | "preview";
    readonly previewState: ThumbnailPreviewState;
  }): void {
    logPerf("thumbnailHover.render", {
      cacheHit,
      cacheSize: this.hoverThumbnailCache.size,
      fileId,
      isLoading,
      plotModelSignature,
      plotModelSource,
      previewState: previewState.kind,
    });
  }

  private getThumbnailPlotModel(fileId: string): ExplorerThumbnailPlotModel | null {
    const normalizedFileId = String(fileId ?? "").trim();
    return normalizedFileId
      ? this.props.thumbnailPlotModelsByFileId?.[normalizedFileId] ?? null
      : null;
  }

  private getCachedHoverThumbnailPlotModel(fileId: string): ExplorerThumbnailPlotModel | null {
    const normalizedFileId = String(fileId ?? "").trim();
    return normalizedFileId
      ? this.hoverThumbnailCache.get(normalizedFileId)?.plotModel ?? null
      : null;
  }

  private getThumbnailPreviewState(
    fileId: string,
    priority: "hover" | "visible",
  ): ThumbnailPreviewState {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return { kind: "idle" };
    }

    return this.props.thumbnailPreviewService.request(
      normalizedFileId,
      priority,
    );
  }

  private refreshCachedHoverThumbnail(fileId: string): void {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const cached = this.hoverThumbnailCache.get(normalizedFileId);
    if (!cached) {
      return;
    }

    const file = getThumbnailFileLikeFromProps(normalizedFileId, this.props);
    if (!file) {
      return;
    }

    const previewState = this.props.thumbnailPreviewService.get(normalizedFileId);
    const previewPlotModel = getPreviewPlotModel(previewState);
    const fallbackPlotModel = previewPlotModel ? null : this.getThumbnailPlotModel(normalizedFileId);
    const plotModel = previewPlotModel ?? fallbackPlotModel ?? cached.plotModel;
    const isLoading = previewState.kind === "loading" && !plotModel;
    const plotModelSignature = plotModel?.signature ?? "";
    const hasCachedPlotModel = Boolean(cached.plotModelSignature);
    if (!plotModel && !isLoading && !hasCachedPlotModel) {
      return;
    }

    const isActive = (this.props.selectedFileId ?? null) === normalizedFileId;
    this.warmDetachedHoverThumbnail(
      cached,
      plotModel,
      plotModelSignature,
      normalizedFileId,
    );
    if (!updateThumbnailView(cached.node, {
      drawStrategy: "eager",
      file,
      isActive,
      isLoading,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel,
      plotType: this.props.activePlotType ?? "iv",
      thumbnailService: this.props.thumbnailService,
    })) {
      return;
    }

    cached.fileSignature = createHoverThumbnailFileSignature(file);
    cached.isActive = isActive;
    cached.isLoading = isLoading;
    cached.plotModel = plotModel ?? cached.plotModel;
    cached.plotModelSignature = plotModelSignature || cached.plotModelSignature;
    cached.node.dataset.hoverFileId = normalizedFileId;
    cached.node.dataset.hoverPlotSignature = cached.plotModelSignature;
  }

  private isRenderedHoverContentCurrent(
    container: HTMLElement,
    content: HoverContent,
  ): boolean {
    if (content.kind !== "thumbnail") {
      return true;
    }

    const child = container.firstElementChild;
    const renderedFileId = child instanceof HTMLElement
      ? String(child.dataset.hoverFileId ?? "").trim()
      : "";
    if (container.childElementCount === 1 && renderedFileId === content.fileId) {
      return true;
    }

    logPerf("thumbnailHover.identityMismatch", {
      childCount: container.childElementCount,
      expectedFileId: content.fileId,
      renderedFileId,
    });
    return false;
  }

  private warmDetachedHoverThumbnail(
    cached: HoverThumbnailCacheEntry,
    plotModel: ExplorerThumbnailPlotModel | null,
    plotModelSignature: string,
    fileId: string,
  ): void {
    if (
      !plotModel ||
      !plotModelSignature ||
      cached.node.isConnected ||
      cached.warmedPlotModelSignature === plotModelSignature
    ) {
      return;
    }

    this.props.thumbnailService.warmPlotThumbnail({
      model: plotModel,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotType: this.props.activePlotType ?? "iv",
    });
    cached.warmedPlotModelSignature = plotModelSignature;
    logPerf("thumbnailHover.warm", {
      fileId,
      plotModelSignature,
    });
  }

  private clearHoverThumbnailCache(): void {
    for (const entry of this.hoverThumbnailCache.values()) {
      entry.node.remove();
    }
    this.hoverThumbnailCache.clear();
  }

  private clearThumbnailGridCache(): void {
    for (const entry of this.thumbnailGridItemCache.values()) {
      entry.node.remove();
    }
    this.thumbnailGridItemCache.clear();
  }

  private shouldClearThumbnailPlotCache(
    previous: ExplorerViewerProps,
    next: ExplorerViewerProps,
  ): boolean {
    return (
      previous.activePlotType !== next.activePlotType ||
      createRenderSettingsSignature(previous.originOpenPlotOptions) !==
        createRenderSettingsSignature(next.originOpenPlotOptions) ||
      createRenderSettingsSignature(previous.plotAxisSettings) !==
        createRenderSettingsSignature(next.plotAxisSettings)
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

    if (!this.hoverHost.contains(anchor)) {
      this.hideFileItemHover();
      return;
    }

    const content = this.resolveHoverContent(anchor);
    if (!content) {
      this.hideFileItemHover();
      return;
    }

    if (this.shouldDismissVisibleHoverForContent(content)) {
      this.hideFileItemHover();
      return;
    }

    this.showFileItemHover(anchor, true);
  }

  private layoutVisibleHover(): void {
    const anchor = this.hoverAnchor;
    if (!anchor || !this.hoverView) {
      return;
    }

    if (!this.hoverHost.contains(anchor)) {
      this.hideFileItemHover();
      return;
    }

    const content = this.resolveHoverContent(anchor);
    if (!content || this.shouldDismissVisibleHoverForContent(content)) {
      this.hideFileItemHover();
      return;
    }

    this.props.contextViewService.layout();
  }

  private hideFileItemHover(item?: HTMLElement): void {
    if (item && this.hoverAnchor !== item) {
      return;
    }

    const content = this.hoverContent;
    if (content?.kind === "thumbnail") {
      if (this.hoverView) {
        logPerf("thumbnailHover.hide", {
          cacheSize: this.hoverThumbnailCache.size,
          fileId: content.fileId,
        });
      }
      this.props.onHoverFileChange?.(null);
    }
    this.cancelFileItemHoverHide();
    this.cancelFileItemHoverLayout();
    this.hoverContainer = null;
    this.closeFileItemHoverView(content);
    this.hoverAnchor = null;
    this.hoverContent = null;
  }

  private closeFileItemHoverView(closedContent: HoverContent | null = this.hoverContent): void {
    if (!this.hoverView) {
      return;
    }

    this.hoverViewToken += 1;
    const view = this.hoverView;
    this.hoverView = null;
    view.close();
    if (closedContent?.kind === "thumbnail") {
      this.warmCachedDetachedHoverThumbnail(closedContent.fileId);
    }
  }

  private warmCachedDetachedHoverThumbnail(fileId: string): void {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const cached = this.hoverThumbnailCache.get(normalizedFileId);
    if (!cached) {
      return;
    }

    this.warmDetachedHoverThumbnail(
      cached,
      cached.plotModel,
      cached.plotModelSignature,
      normalizedFileId,
    );
  }
}

function getEffectiveViewLayout(
  props: Pick<ExplorerViewerProps, "mode" | "viewLayout">,
): FilesViewLayout {
  return props.mode === "chart" ? props.viewLayout ?? "tree" : "tree";
}

function getPreviewPlotModel(
  state: ThumbnailPreviewState,
): ExplorerThumbnailPlotModel | null {
  return state.kind === "ready" || state.kind === "rawReady" || state.kind === "fastReady"
    ? state.model
    : null;
}

function getThumbnailFileLikeFromProps(
  fileId: string | null | undefined,
  props: ExplorerViewerProps,
): ThumbnailFileLike | null {
  const normalizedFileId = String(fileId ?? "").trim();
  if (!normalizedFileId) {
    return null;
  }

  const thumbnailFile = (Array.isArray(props.thumbnailFiles) ? props.thumbnailFiles : [])
    .find((entry) => String(entry?.fileId ?? "").trim() === normalizedFileId);
  if (thumbnailFile) {
    return thumbnailFile;
  }

  const file = props.files.find((entry) =>
    String(entry.fileId ?? "").trim() === normalizedFileId);
  if (!file) {
    return null;
  }

  return {
    curveFilterField: null,
    curveFilterKey: null,
    curveType: file.curveType ?? undefined,
    fileId: file.fileId,
    fileName: file.fileName,
  };
}

function createRenderSettingsSignature(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value ?? "");
  }

  return JSON.stringify(sortRecordKeys(value));
}

function sortRecordKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecordKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortRecordKeys(entry)]),
  );
}

function getThumbnailHoverPlotModelSource(
  previewPlotModel: ExplorerThumbnailPlotModel | null,
  fallbackPlotModel: ExplorerThumbnailPlotModel | null,
): "explorer" | "none" | "preview" {
  if (previewPlotModel) {
    return "preview";
  }

  return fallbackPlotModel ? "explorer" : "none";
}

function createThumbnailGridItemKey(
  file: ThumbnailFileLike,
  index: number,
): string {
  const fileId = String(file.fileId ?? "").trim();
  if (fileId) {
    return fileId;
  }

  return [
    "__thumbnail",
    index,
    String(file.fileName ?? "").trim(),
  ].join("\u001f");
}

function areSameChildNodes(
  container: HTMLElement,
  nodes: readonly HTMLElement[],
): boolean {
  if (container.childElementCount !== nodes.length) {
    return false;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    if (container.children[index] !== nodes[index]) {
      return false;
    }
  }

  return true;
}

function createHoverThumbnailFileSignature(file: ThumbnailFileLike): string {
  return [
    file.fileId ?? "",
    file.fileName ?? "",
  ].join("\u001f");
}

type FileItemChartPreviewState = Pick<ExplorerFileEntry, "chartState" | "hasChartData">;

function getFileItemChartPreviewState(
  item: HTMLElement,
  file: ExplorerFileEntry | null,
): FileItemChartPreviewState | null {
  const chartState = file?.chartState ?? parseChartState(item.dataset.chartState);
  const hasChartData = typeof file?.hasChartData === "boolean"
    ? file.hasChartData
    : parseBooleanDataset(item.dataset.hasChartData);

  if (!chartState && typeof hasChartData !== "boolean") {
    return null;
  }

  return { chartState, hasChartData };
}

function parseChartState(
  value: string | undefined,
): ExplorerFileEntry["chartState"] | undefined {
  switch (value) {
    case "failed":
    case "none":
    case "processing":
    case "queued":
    case "ready":
    case "skipped":
      return value;
    default:
      return undefined;
  }
}

function parseBooleanDataset(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function canRequestThumbnailPreview(state: FileItemChartPreviewState | null): boolean {
  if (!state) {
    return true;
  }

  if (state.hasChartData === true) {
    return true;
  }

  if (state.hasChartData === false && state.chartState === "ready") {
    return false;
  }

  switch (state.chartState) {
    case "queued":
    case "processing":
    case "ready":
      return true;
    case "failed":
    case "none":
    case "skipped":
      return false;
    default:
      break;
  }

  if (state.hasChartData === false) {
    return false;
  }

  return true;
}

function canRequestThumbnailPreviewForProps(
  state: FileItemChartPreviewState | null,
  props: Pick<ExplorerViewerProps, "files" | "mode">,
): boolean {
  if (canRequestThumbnailPreview(state)) {
    return true;
  }

  return props.mode === "chart" &&
    hasPendingChartPreviewWork(props.files) &&
    state?.chartState !== "failed" &&
    state?.chartState !== "skipped";
}

function hasPendingChartPreviewWork(files: readonly ExplorerFileEntry[]): boolean {
  return files.some(file =>
    file.chartState === "queued" ||
    file.chartState === "processing");
}

function isSameHoverContent(
  left: HoverContent | null,
  right: HoverContent,
): boolean {
  if (!left || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "thumbnail" && right.kind === "thumbnail") {
    return (
      left.fileId === right.fileId &&
      left.isSelected === right.isSelected
    );
  }

  if (left.kind === "file" && right.kind === "file") {
    return areFileHoverContextsEqual(left.fileContext, right.fileContext);
  }

  if (left.kind !== "tableModel" || right.kind !== "tableModel") {
    return false;
  }

  return (
    left.type === right.type &&
    left.confidence === right.confidence &&
    left.template === right.template &&
    left.isWarning === right.isWarning &&
    areFileHoverContextsEqual(left.fileContext, right.fileContext) &&
    areStringArraysEqual(left.reasons, right.reasons)
  );
}

function areFileHoverContextsEqual(
  first: FileHoverContext | null,
  second: FileHoverContext | null,
): boolean {
  if (!first || !second) {
    return first === second;
  }

  return first.fileName === second.fileName &&
    first.path === second.path &&
    first.typeLabel === second.typeLabel;
}

function getRevealInOSLabel(): string {
  if (isWindows) {
    return localize("files.revealInWindows", "Reveal in File Explorer");
  }

  if (isMacintosh) {
    return localize("files.revealInMac", "Reveal in Finder");
  }

  return localize("files.openContainingFolder", "Open Containing Folder");
}

function isUserTemplateId(value: unknown): value is string {
  const templateId = String(value ?? "").trim();
  return Boolean(templateId) && !isAutoTemplateId(templateId);
}

function areStringArraysEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
}
