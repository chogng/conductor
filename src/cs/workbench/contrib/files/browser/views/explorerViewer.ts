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
import { SubmenuAction, type IAction } from "src/cs/base/common/actions";
import { CommandsRegistry, type ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  IContextMenuService,
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";
import { localize } from "src/cs/nls";
import {
  type FilesViewLayout,
  REVEAL_IN_OS_COMMAND_ID,
  REMOVE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
} from "src/cs/workbench/contrib/files/common/files";
import type { WorkbenchMainPart } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  ExplorerEditableData,
  ExplorerThumbnailPlotModel,
} from "src/cs/workbench/contrib/files/browser/files";
import { FileKind, ResourceLabels, type IResourceLabel } from "src/cs/workbench/browser/labels";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { FolderImportSupport } from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  areExplorerAppearancesEqual,
  DEFAULT_EXPLORER_APPEARANCE,
  type ExplorerAppearance,
} from "src/cs/workbench/services/appearance/common/appearance";
import {
  buildExplorerTree,
  collectExplorerFolderKeys,
  getExplorerTreeFileKey,
  getExplorerTreeFileName,
  type ExplorerFileEntry,
  type ExplorerSourceStatus,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { createEmptyView } from "src/cs/workbench/contrib/files/browser/views/emptyView";
import {
  createThumbnailView,
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
  resolveTemplateSelectionForFile,
  type TemplateSelection,
  type TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";
import type { TemplateRecord } from "src/cs/workbench/services/template/common/template";

export type ExplorerViewerProps = {
  readonly selectedFileId?: string | null;
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
  readonly currentTemplateLabel?: string;
  readonly currentTemplateSelection?: TemplateSelection;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly editable?: ExplorerEditableData | null;
  readonly isTemplateListLoading?: boolean;
  readonly templateRecords?: readonly TemplateRecord[];
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
  readonly onCancelRenameFile?: () => void;
  readonly onRenameFile?: (fileId: string, nextName: string) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly thumbnailFiles?: ProcessedEntry[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

type FileTreeNode = ExplorerTreeNode<ExplorerFileEntry>;

const getFileName = getExplorerTreeFileName;
const FILE_HOVER_HIDE_DELAY_MS = 120;
const FILE_HOVER_THUMBNAIL_WIDTH = 360;
const FILE_HOVER_THUMBNAIL_VIEWPORT_RATIO = 0.44;
const HOVER_THUMBNAIL_CACHE_LIMIT = 12;
const FILE_ASSESSMENT_REASON_SEPARATOR = "\u001d";

const getFileHoverThumbnailWidth = (): number =>
  Math.max(1, Math.min(
    FILE_HOVER_THUMBNAIL_WIDTH,
    Math.floor(window.innerWidth * FILE_HOVER_THUMBNAIL_VIEWPORT_RATIO),
  ));

type FileItemAssessment = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly source: "assessment";
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

type FilePendingAssessment = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly state: "pending";
  readonly title: string;
};

type FileFastAssessment = {
  readonly label: string;
  readonly isWarning: boolean;
  readonly confidence: string;
  readonly reasons: readonly string[];
  readonly source: "fast";
  readonly state: "fast" | "unknown";
  readonly template: string;
  readonly title: string;
  readonly type: string;
};

type FileItemTemplate = {
  readonly actions: HTMLDivElement;
  readonly assessment: ExplorerBadgeNode;
  readonly content: HTMLDivElement;
  readonly editorStore: DisposableStore;
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
  readonly structureSignature: string;
};

type HoverContent =
  | {
    readonly kind: "assessment";
    readonly isWarning: boolean;
    readonly type: string;
    readonly confidence: string;
    readonly reasons: readonly string[];
    readonly template: string;
  }
  | {
    readonly kind: "thumbnail";
    readonly file: ThumbnailFileLike;
    readonly fileId: string;
    readonly isSelected: boolean;
  };

type HoverThumbnailCacheEntry = {
  readonly file: ThumbnailFileLike;
  readonly isActive: boolean;
  readonly node: HTMLElement;
  readonly plotModel: ExplorerThumbnailPlotModel | null;
  lastUsed: number;
};

const hasFileItemAssessment = (
  fileEntry: ExplorerFileEntry,
  reasons: readonly string[],
): boolean =>
  Boolean(
    String(fileEntry.curveType ?? "").trim() ||
      fileEntry.curveTypeConfidence ||
      fileEntry.curveTypeNeedsTemplate === true ||
      reasons.length,
  );

const createFileItemAssessment = (
  fileEntry: ExplorerFileEntry,
  templateLabel: string,
): FileItemAssessment | null => {
  const badgeState = fileEntry.badgeState;
  if (
    (badgeState?.kind !== "ready" && badgeState?.kind !== "unknown") ||
    badgeState?.source !== "assessment"
  ) {
    return null;
  }

  const confidence = fileEntry?.curveTypeConfidence
    ? String(fileEntry.curveTypeConfidence).trim()
    : localize("files.autoUnknown", "Unknown");
  const reasons = (fileEntry.curveTypeReasons ?? [])
    .map(reason => String(reason).trim())
    .filter(Boolean);
  if (!hasFileItemAssessment(fileEntry, reasons)) {
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
      fileEntry?.curveTypeNeedsTemplate === true ||
      fileEntry?.curveTypeConfidence === "low",
    source: "assessment",
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

const createFilePendingAssessment = (
  fileEntry: ExplorerFileEntry,
): FilePendingAssessment | null => {
  if (fileEntry.badgeState?.kind !== "pending") {
    return null;
  }

  return {
    label: "...",
    isWarning: false,
    state: "pending",
    title: localize("files.autoAnalyzing", "Analyzing"),
  };
};

const createFileFastAssessment = (
  fileEntry: ExplorerFileEntry,
): FileFastAssessment | null => {
  if (
    fileEntry.badgeState?.kind === "unknown" &&
    fileEntry.badgeState.source === "fast"
  ) {
    const healthMessage = getLocalizedAssessmentHealthMessage(fileEntry);
    const suspectedType = String(fileEntry.badgeState.suspectedType ?? "").trim();
    const filenameReason = suspectedType
      ? localize(
          "files.autoFastUnknownFromName",
          "File name or path suggests {type}, but content was not parsed.",
          { type: suspectedType },
        )
      : String(fileEntry.badgeState.message ?? "").trim() ||
        localize("files.autoContentNotParsed", "Content was not parsed.");
    return {
      label: localize("files.autoUnknown", "Unknown"),
      confidence: "low",
      isWarning: true,
      reasons: [
        filenameReason ||
          localize("files.autoFastFileNameEvidence", "File name or path contains curve-type hints."),
        healthMessage ||
          localize("files.autoContentParseFailed", "Content parsing failed: text encoding is invalid or file content is unreadable."),
        localize("files.autoContentNotUsed", "Table content was not used as assessment evidence."),
      ],
      source: "fast",
      state: "unknown",
      template: localize(
        "files.autoTemplateUnavailableDecode",
        "Auto extraction unavailable.",
      ),
      title: filenameReason ||
        localize("files.autoContentParseFailed", "Content parsing failed: text encoding is invalid or file content is unreadable."),
      type: localize("files.autoUnknown", "Unknown"),
    };
  }

  if (
    fileEntry.badgeState?.kind !== "ready" ||
    fileEntry.badgeState.source !== "fast"
  ) {
    return null;
  }

  const label = String(fileEntry.badgeState.label ?? "").trim();
  if (!label) {
    return null;
  }

  const isUnhealthy = isUnhealthyAssessmentHealth(fileEntry.assessmentHealth);
  const type = isUnhealthy ? localize("files.autoUnknown", "Unknown") : label;
  const healthMessage = getLocalizedAssessmentHealthMessage(fileEntry);
  const reasons = isUnhealthy
    ? [
        fileEntry.badgeState.message ??
          localize("files.autoSuspectedType", "Suspected {type}", { type: label }),
        healthMessage ||
          localize("files.autoContentParseFailed", "Content parsing failed: text encoding is invalid or file content is unreadable."),
        localize("files.autoContentNotUsed", "Table content was not used as assessment evidence."),
      ]
    : [
        fileEntry.badgeState.message ??
          localize("files.autoFastBadge", "Fast estimate"),
      ];

  return {
    label: isUnhealthy ? localize("files.autoUnknown", "Unknown") : label,
    confidence: isUnhealthy ? "low" : "tentative",
    isWarning: isUnhealthy,
    reasons,
    source: "fast",
    state: isUnhealthy ? "unknown" : "fast",
    template: isUnhealthy
      ? localize(
          "files.autoTemplateUnavailableDecode",
          "Auto extraction unavailable.",
        )
      : localize("files.autoTemplatePending", "Waiting for assessment"),
    title: fileEntry.badgeState.message ??
      localize("files.autoFastBadge", "Fast estimate"),
    type,
  };
};

const isUnhealthyAssessmentHealth = (
  health: ExplorerFileEntry["assessmentHealth"],
): boolean =>
  health === "decodeFailed" ||
  health === "parseFailed" ||
  health === "unsupported";

const getLocalizedAssessmentHealthMessage = (
  fileEntry: ExplorerFileEntry,
): string => {
  const message = String(fileEntry.assessmentHealthMessage ?? "").trim();
  const lowerMessage = message.toLowerCase();
  if (fileEntry.assessmentHealth === "decodeFailed") {
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
  if (fileEntry.assessmentHealth === "parseFailed") {
    return localize(
      "files.autoContentParseFailed",
      "Content parsing failed: text encoding is invalid or file content is unreadable.",
    );
  }
  if (fileEntry.assessmentHealth === "unsupported") {
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
      fileEntry.sourceKey ??
      fileEntry.fileName ??
      "",
  );

const createBadgePresentation = (
  fileKey: string,
  badge: FileItemAssessment | FileSourceStatusBadge | FileFastAssessment | FilePendingAssessment | null,
): ExplorerBadgePresentation => {
  if (!badge) {
    return null;
  }

  return {
    fileKey,
    isWarning: badge.isWarning,
    label: badge.label,
    source: "source" in badge ? badge.source : null,
    state: badge.state,
    title: "title" in badge ? badge.title : null,
  };
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

const createAssessmentRow = (
  label: string,
  value: string | readonly string[],
): HTMLElement => {
  const row = document.createElement("div");
  row.className = "file-list-hover-assessment-row";

  const term = document.createElement("dt");
  term.className = "file-list-hover-assessment-label";
  term.textContent = label;

  const description = document.createElement("dd");
  description.className = "file-list-hover-assessment-value";
  if (typeof value === "string") {
    description.textContent = value;
  } else {
    const list = document.createElement("div");
    list.className = "file-list-hover-assessment-list";
    for (const item of value) {
      const entry = document.createElement("div");
      entry.className = "file-list-hover-assessment-list-item";
      entry.textContent = item;
      list.appendChild(entry);
    }
    description.appendChild(list);
  }

  row.append(term, description);
  return row;
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
  private hoverAnchor: HTMLElement | null = null;
  private hoverContent: HoverContent | null = null;
  private hoverHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private hoverLayoutFrame: number | null = null;
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
      }
    }));
  }

  getListHandle(): ListHandle {
    return this.treeView;
  }

  setProps(nextProps: ExplorerViewerProps): void {
    const previousSelectedFileId = this.props.selectedFileId ?? null;
    const nextSelectedFileId = nextProps.selectedFileId ?? null;
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
    const shouldUpdateOptions = previousSelectedFileId !== nextSelectedFileId;
    const shouldUpdateFolderExpansion = !areStringArraysEqual(
      previousExpandedFolderKeys,
      nextExpandedFolderKeys,
    );
    const nextViewLayout = getEffectiveViewLayout(nextProps);
    const shouldClearPlotCache = this.shouldClearThumbnailPlotCache(this.props, nextProps);
    const nextExplorerAppearance =
      nextProps.explorerAppearance ?? DEFAULT_EXPLORER_APPEARANCE;
    const shouldUpdateExplorerAppearance = !areExplorerAppearancesEqual(
      this.explorerAppearance,
      nextExplorerAppearance,
    );

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
      const reconciledExpandedFolderKeys =
        this.props.onFolderKeysChange?.(this.treeModel.folderKeys) ??
        nextExpandedFolderKeys;
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(
          this.treeModel.folderKeys,
          reconciledExpandedFolderKeys,
        ),
        delegate: this.treeDelegate,
        selectedKey: nextSelectedFileId,
      });
      this.treeView.setChildren(this.treeModel.items);
    } else {
      const treeOptionsUpdate: IObjectTreeOptionsUpdate<FileTreeNode, TreeItemTemplate> = {
        ...(shouldUpdateOptions ? { selectedKey: nextSelectedFileId } : {}),
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
        this.treeView.updateOptions(treeOptionsUpdate);
      }

      this.treeView.rerenderByKeys(changedPresentationKeys);
    }

    this.refreshVisibleHover();
    this.renderThumbnailGrid();
  }

  dispose(): void {
    this.cancelFileItemHoverHide();
    this.cancelFileItemHoverLayout();
    this.closeFileItemHoverView();
    this.clearHoverThumbnailCache();
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
      selectedKey: this.props.selectedFileId ?? null,
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
    return files
      .map((entry) => [
        entry.fileId ?? "",
        entry.itemKey ?? "",
        entry.relativePath ?? "",
        getFileName(entry),
      ].join("\u001f"))
      .join("\u001e");
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
    const badgeState = entry.badgeState;
    return [
      entry.chartMessage ?? "",
      entry.chartState ?? "",
      entry.fileId ?? "",
      entry.hasChartData === true ? "1" : "0",
      entry.sourceStatus ?? "",
      entry.sourceStatusMessage ?? "",
      entry.assessmentHealth ?? "",
      entry.assessmentHealthMessage ?? "",
      entry.templateEligibility ?? "",
      badgeState?.kind ?? "",
      badgeState?.kind === "error" ||
        badgeState?.kind === "ready"
        ? badgeState.message ?? ""
        : "",
      badgeState?.kind === "ready" ? badgeState.label : "",
      badgeState?.kind === "ready" ? badgeState.confidence : "",
      badgeState?.kind === "ready" ? badgeState.source : "",
      badgeState?.kind === "unknown" ? badgeState.source : "",
      badgeState?.kind === "unknown" ? badgeState.message ?? "" : "",
      badgeState?.kind === "unknown" ? badgeState.suspectedType ?? "" : "",
      entry.curveType ?? "",
      entry.curveTypeBadgeLabel ?? "",
      entry.curveTypeConfidence ?? "",
      entry.curveTypeNeedsTemplate === true ? "1" : "0",
      (entry.curveTypeReasons ?? []).join("\u001d"),
      this.resolveFileTemplateLabel(entry, props),
      getTemplateSelectionId(
        this.resolveFileTemplateSelection(entry.fileId, props),
      ),
      props.editable?.isEditing === true &&
        props.editable.resource.fileId === entry.fileId
        ? "editing"
        : "",
    ].join("\u001f");
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

    this.props.onSelectFile(fileEntry.fileId);
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
    const actions: IAction[] = [
      createMenuAction({
        id: REMOVE_FILE_ITEM_COMMAND_ID,
        label: localize("files.item.delete", "Delete"),
        run: () => {
          void this.props.commandService.executeCommand(
            REMOVE_FILE_ITEM_COMMAND_ID,
            fileId,
          );
        },
      }),
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
      new SubmenuAction(
        SET_FILE_TEMPLATE_COMMAND_ID,
        localize("files.item.setTemplate", "Set with Template"),
        this.createTemplateContextActions({
          actionPrefix: SET_FILE_TEMPLATE_COMMAND_ID,
          commandId: SET_FILE_TEMPLATE_COMMAND_ID,
          fileId,
        }),
      ),
      new SubmenuAction(
        SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
        localize("files.item.sliceWithTemplate", "Slice with Template"),
        this.createTemplateContextActions({
          actionPrefix: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
          commandId: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
          fileId,
        }),
      ),
    ];

    if (this.canRevealFileInOS(fileId)) {
      actions.push(createMenuAction({
        id: REVEAL_IN_OS_COMMAND_ID,
        label: getRevealInOSLabel(),
        run: () => {
          void this.props.commandService.executeCommand(
            REVEAL_IN_OS_COMMAND_ID,
            fileId,
          );
        },
      }));
    }

    return actions;
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
        label: localize("template.autoExtraction", "Auto extraction"),
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
      if (!templateId) {
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

    if (this.props.isTemplateListLoading) {
      actions.push(createMenuAction({
        enabled: false,
        id: `${actionPrefix}.loading`,
        label: localize("files.item.templatesLoading", "Loading templates..."),
        run: () => {},
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
        this.props.selectedFileId === fileEntry.fileId,
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
    const currentSelection = props.currentTemplateSelection ?? {
      kind: "auto",
    };

    if (selection.kind === "auto") {
      return localize("template.autoExtraction", "Auto extraction");
    }

    if (
      currentSelection.kind === "template" &&
      selection.templateId === currentSelection.templateId
    ) {
      return props.currentTemplateLabel || selection.templateId;
    }

    return props.templateRecords?.find(template => template.id === selection.templateId)?.name ||
      selection.templateId;
  }

  private resolveFileTemplateSelection(
    fileId: string | null | undefined,
    props: ExplorerViewerProps = this.props,
  ): TemplateSelection {
    const currentSelection: TemplateSelection = props.currentTemplateSelection ?? {
      kind: "auto",
    };
    return resolveTemplateSelectionForFile(
      fileId,
      props.fileTemplateSelectionsByFileId ?? {},
      currentSelection,
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
    const assessment = createFileItemAssessment(
      fileEntry,
      this.resolveFileTemplateLabel(fileEntry),
    );
    const fastAssessment = createFileFastAssessment(fileEntry);
    const pendingAssessment = createFilePendingAssessment(fileEntry);
    const { host } = template;
    const fileKey = getFileRenderKey(fileEntry);
    template.assessment.bind(fileKey);

    host.className = "file-list-item";
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
    if (isEditing) {
      host.dataset.editing = "true";
    } else {
      delete host.dataset.editing;
    }
    const hoverAssessment = assessment ?? (fastAssessment?.isWarning ? fastAssessment : null);
    if (hoverAssessment) {
      host.dataset.autoType = hoverAssessment.type;
      host.dataset.autoConfidence = hoverAssessment.confidence;
      host.dataset.autoReasons = hoverAssessment.reasons.join(FILE_ASSESSMENT_REASON_SEPARATOR);
      host.dataset.autoTemplate = hoverAssessment.template;
      host.dataset.autoWarning = hoverAssessment.isWarning ? "true" : "false";
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

    if (fileEntry?.itemKey) {
      host.dataset.itemKey = fileEntry.itemKey;
    } else {
      delete host.dataset.itemKey;
    }

    template.fileId = fileId;
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
      : assessment ?? fastAssessment ?? sourceStatus ?? pendingAssessment;
    template.assessment.setBadge(fileKey, createBadgePresentation(fileKey, badge));
    template.removeButton.setAttribute(
      "aria-label",
      localize("files.import.removeFileButtonLabel", "Remove {fileName}", { fileName }),
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
    if (getEffectiveViewLayout(this.props) !== "thumbnail") {
      this.thumbnailHost.replaceChildren();
      return;
    }

    const files = this.getThumbnailFiles();
    this.thumbnailHost.replaceChildren(
      ...files.map(file => this.createThumbnailItem(file)),
    );
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

  private createThumbnailItem(file: ThumbnailFileLike): HTMLButtonElement {
    const fileName = String(file.fileName ?? file.fileId ?? "");
    const fileId = String(file.fileId ?? "").trim();
    const item = document.createElement("button");
    item.type = "button";
    item.className = "file-list-thumbnail-item";
    item.setAttribute(
      "aria-label",
      localize("files.import.fileItemAriaLabel", "File {fileName}", { fileName }),
    );
    item.append(createThumbnailView({
      file,
      isActive: fileId === (this.props.selectedFileId ?? null),
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      plotModel: this.getThumbnailPreviewPlotModel(fileId, "visible"),
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
    const assessmentHost = document.createElement("span");
    assessmentHost.className = "file-list-item-assessment";
    assessmentHost.hidden = true;
    const assessment = new ExplorerBadgeNode(assessmentHost);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "file-list-item-remove";
    const template: FileItemTemplate = {
      actions,
      assessment,
      content,
      editorStore: new DisposableStore(),
      fileId: null,
      host,
      label,
      removeButton,
    };
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.props.commandService.executeCommand(
        REMOVE_FILE_ITEM_COMMAND_ID,
        template.fileId,
      );
    });
    appendIcon(removeButton, LxIcon.close);

    actions.append(assessmentHost, removeButton);
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
    template.currentNode = node;
    host.className = "file-list-folder-item";
    host.title = node.name;
    host.removeAttribute("aria-label");
    delete host.dataset.autoType;
    delete host.dataset.autoConfidence;
    delete host.dataset.autoReasons;
    delete host.dataset.autoTemplate;
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
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    const thumbnailFile = (Array.isArray(this.props.thumbnailFiles) ? this.props.thumbnailFiles : [])
      .find((entry) => String(entry?.fileId ?? "").trim() === normalizedFileId);
    if (thumbnailFile) {
      return thumbnailFile;
    }

    const file = this.props.files.find((entry) =>
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

  private hasFileItemHoverContent(item: HTMLElement): boolean {
    return this.resolveHoverContent(item) !== null;
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

  private showFileItemHover(item: HTMLElement): void {
    if (this.isFolderActionMenuActive()) {
      this.hideFileItemHover();
      return;
    }

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
    const classNames = isThumbnailHover
      ? ["file-list-hover", "file-list-hover--thumbnail"]
      : ["file-list-hover", "file-list-hover--assessment"];

    this.hoverView = this.props.contextViewService.showContextView({
      anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
      anchorPosition: AnchorPosition.RIGHT,
      canRelayout: true,
      getAnchor: () => item,
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
    disposables.add({
      dispose: () => {
        container.classList.remove(
          "file-list-hover",
          "file-list-hover--assessment",
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

    return this.resolveAssessmentHoverContent(item);
  }

  private resolveThumbnailHoverContent(item: HTMLElement): HoverContent | null {
    if (getEffectiveViewLayout(this.props) === "thumbnail") {
      return null;
    }

    const fileId = String(item.dataset.fileId ?? "").trim();
    if (!fileId) {
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

  private resolveAssessmentHoverContent(item: HTMLElement): HoverContent | null {
    const type = item.dataset.autoType ?? "";
    if (!type) {
      return null;
    }

    return {
      kind: "assessment",
      isWarning: item.dataset.autoWarning === "true",
      type,
      confidence: item.dataset.autoConfidence ?? "",
      reasons: (item.dataset.autoReasons ?? "")
        .split(FILE_ASSESSMENT_REASON_SEPARATOR)
        .map(reason => reason.trim())
        .filter(Boolean),
      template: item.dataset.autoTemplate ?? "",
    };
  }

  private renderHoverContent(container: HTMLElement): void {
    const content = this.hoverContent;
    if (!content) {
      return;
    }

    if (content.kind === "thumbnail") {
      container.appendChild(this.getHoverThumbnail(
        content.fileId,
        content.file,
        content.isSelected,
      ));
      return;
    }

    const details = document.createElement("dl");
    details.className = "file-list-hover-assessment";
    details.dataset.warning = content.isWarning ? "true" : "false";
    details.append(
      createAssessmentRow(localize("files.autoTypeLabel", "Type:"), content.type),
      createAssessmentRow(localize("files.autoConfidenceLabel", "Confidence:"), content.confidence),
      createAssessmentRow(localize("files.autoReasonLabel", "Basis:"), content.reasons),
      createAssessmentRow(localize("files.autoTemplateLabel", "Template:"), content.template),
    );
    container.appendChild(details);
  }

  private getHoverThumbnail(fileId: string, file: ThumbnailFileLike, isActive: boolean): HTMLElement {
    const normalizedFileId = String(fileId || file.fileId || file.fileName || "").trim();
    const cacheKey = normalizedFileId || "__unknown__";
    const previewState = normalizedFileId
      ? this.props.thumbnailPreviewService.request(normalizedFileId, "hover")
      : { kind: "idle" } satisfies ThumbnailPreviewState;
    const plotModel = getPreviewPlotModel(previewState) ?? this.getThumbnailPlotModel(fileId);
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

  private getThumbnailPlotModel(fileId: string): ExplorerThumbnailPlotModel | null {
    const normalizedFileId = String(fileId ?? "").trim();
    return normalizedFileId
      ? this.props.thumbnailPlotModelsByFileId?.[normalizedFileId] ?? null
      : null;
  }

  private getThumbnailPreviewPlotModel(
    fileId: string,
    priority: "hover" | "visible",
  ): ExplorerThumbnailPlotModel | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    return getPreviewPlotModel(this.props.thumbnailPreviewService.request(
      normalizedFileId,
      priority,
    )) ?? this.getThumbnailPlotModel(normalizedFileId);
  }

  private clearHoverThumbnailCache(): void {
    for (const entry of this.hoverThumbnailCache.values()) {
      entry.node.remove();
    }
    this.hoverThumbnailCache.clear();
  }

  private shouldClearThumbnailPlotCache(
    previous: ExplorerViewerProps,
    next: ExplorerViewerProps,
  ): boolean {
    return (
      previous.activePlotType !== next.activePlotType ||
      previous.thumbnailPlotModelsByFileId !== next.thumbnailPlotModelsByFileId ||
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
      return;
    }

    this.hoverViewToken += 1;
    const view = this.hoverView;
    this.hoverView = null;
    view.close();
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
  return state.kind === "ready" || state.kind === "rawReady"
    ? state.model
    : null;
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
