/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

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
import type { ExplorerThumbnailPlotModel } from "src/cs/workbench/contrib/files/browser/files";
import { FileKind, ResourceLabels, type IResourceLabel } from "src/cs/workbench/browser/labels";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { FolderImportSupport } from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  buildExplorerTree,
  collectExplorerFolderKeys,
  getExplorerTreeFileName,
  type ExplorerFileEntry,
  type ExplorerTreeNode,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { createEmptyView } from "src/cs/workbench/contrib/files/browser/views/emptyView";
import {
  createThumbnailView,
  type ThumbnailFileLike,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailView";
import type { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
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
  readonly activePlotType?: PlotType;
  readonly commandService: Pick<ICommandService, "executeCommand">;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly contextViewService: IContextViewService;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly thumbnailService: IThumbnailService;
  readonly currentTemplateLabel?: string;
  readonly currentTemplateSelection?: TemplateSelection;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly isTemplateListLoading?: boolean;
  readonly templateRecords?: readonly TemplateRecord[];
  readonly files: ExplorerFileEntry[];
  readonly mode?: WorkbenchMainPart;
  readonly viewLayout?: FilesViewLayout;
  readonly folderImportSupport?: FolderImportSupport;
  readonly onListScroll: (event: Event) => void;
  readonly onFolderExpansionChange?: (expandedFolderKeys: readonly string[]) => void;
  readonly onFolderKeysChange?: (folderKeys: readonly string[]) => readonly string[] | void;
  readonly onOpenFileDialog: () => void;
  readonly onRemoveFolder: (folderKey: string) => void;
  readonly onRequestTemplates?: () => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly thumbnailFiles?: ProcessedEntry[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
};

type FileTreeNode = ExplorerTreeNode<ExplorerFileEntry>;

const getFileName = getExplorerTreeFileName;
const FILE_ROW_HEIGHT = 28;
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
  readonly type: string;
  readonly confidence: string;
  readonly reasons: readonly string[];
  readonly template: string;
};

type FileItemTemplate = {
  readonly actions: HTMLDivElement;
  readonly assessment: HTMLSpanElement;
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
    readonly isSelected: boolean;
    readonly processedFile: ProcessedEntry;
  };

type HoverThumbnailCacheEntry = {
  readonly file: ProcessedEntry;
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
  const label = String(fileEntry.curveTypeBadgeLabel ?? "").trim() || curveType;

  return {
    label,
    isWarning:
      fileEntry?.curveTypeNeedsTemplate === true ||
      fileEntry?.curveTypeConfidence === "low",
    type: curveType,
    confidence,
    reasons: reasons.length ? reasons : [localize("files.autoNoReason", "Not available")],
    template: templateLabel,
  };
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
  if (Array.isArray(value)) {
    const list = document.createElement("div");
    list.className = "file-list-hover-assessment-list";
    for (const item of value) {
      const entry = document.createElement("div");
      entry.className = "file-list-hover-assessment-list-item";
      entry.textContent = item;
      list.appendChild(entry);
    }
    description.appendChild(list);
  } else {
    description.textContent = value;
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
  private hoverContextViewElement: HTMLElement | null = null;
  private hoverAnchor: HTMLElement | null = null;
  private hoverContent: HoverContent | null = null;
  private hoverHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private hoverLayoutFrame: number | null = null;
  private hoverViewToken = 0;
  private hoverCacheUse = 0;
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
    private readonly host: HTMLElement,
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
      addDisposableListener(this.host, "focusin", this.handleListFocusIn),
    );
    this.disposables.add(
      addDisposableListener(this.host, "focusout", this.handleListFocusOut),
    );
    this.disposables.add(
      addDisposableListener(this.host, "contextmenu", this.handleListContextMenu),
    );
  }

  getListHandle(): ListHandle {
    return this.treeView;
  }

  setProps(nextProps: ExplorerViewerProps): void {
    const previousSelectedFileId = this.props.selectedFileId ?? null;
    const nextSelectedFileId = nextProps.selectedFileId ?? null;
    const previousExpandedFolderKeys = this.props.expandedFolderKeys ?? [];
    const nextExpandedFolderKeys = nextProps.expandedFolderKeys ?? [];
    const nextTreeSignature = this.createTreeSignature(nextProps.files, nextProps);
    const shouldUpdateTree = nextTreeSignature !== this.treeModel.signature;
    const shouldUpdateOptions = previousSelectedFileId !== nextSelectedFileId;
    const shouldUpdateFolderExpansion = !areStringArraysEqual(
      previousExpandedFolderKeys,
      nextExpandedFolderKeys,
    );
    const nextViewLayout = getEffectiveViewLayout(nextProps);
    const shouldClearPlotCache = this.shouldClearThumbnailPlotCache(this.props, nextProps);

    this.props = nextProps;
    if (shouldClearPlotCache) {
      this.clearHoverThumbnailCache();
    }
    this.host.dataset.viewLayout = nextViewLayout;

    if (shouldUpdateTree) {
      this.updateTreeModel(nextTreeSignature);
      const reconciledExpandedFolderKeys =
        this.props.onFolderKeysChange?.(this.treeModel.folderKeys) ??
        nextExpandedFolderKeys;
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(
          this.treeModel.folderKeys,
          reconciledExpandedFolderKeys,
        ),
        selectedKey: nextSelectedFileId,
      });
      this.treeView.setChildren(this.treeModel.items);
    } else if (shouldUpdateOptions && shouldUpdateFolderExpansion) {
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(
          this.treeModel.folderKeys,
          nextExpandedFolderKeys,
        ),
        selectedKey: nextSelectedFileId,
      });
    } else if (shouldUpdateOptions) {
      this.treeView.updateOptions({
        selectedKey: nextSelectedFileId,
      });
    } else if (shouldUpdateFolderExpansion) {
      this.treeView.updateOptions({
        collapsedKeys: this.getCollapsedFolderKeys(
          this.treeModel.folderKeys,
          nextExpandedFolderKeys,
        ),
      });
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

  private createTreeOptions(
    signature = this.createTreeSignature(this.props.files, this.props),
  ): IObjectTreeOptions<FileTreeNode, TreeItemTemplate> {
    this.updateTreeModel(signature);
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

  private createTreeSignature(
    files: readonly ExplorerFileEntry[],
    props: ExplorerViewerProps,
  ): string {
    const currentTemplateSelectionId = getTemplateSelectionId(
      props.currentTemplateSelection ?? { kind: "auto" },
    );
    const templateRecordsSignature = (props.templateRecords ?? [])
      .map(template => `${String(template.id ?? "")}:${String(template.name ?? "")}`)
      .join("\u001d");
    return [
      currentTemplateSelectionId,
      props.currentTemplateLabel ?? "",
      templateRecordsSignature,
      files.map((entry) => [
        entry.fileId ?? "",
        entry.itemKey ?? "",
        entry.relativePath ?? "",
        getFileName(entry),
        entry.curveType ?? "",
        entry.curveTypeBadgeLabel ?? "",
        entry.curveTypeConfidence ?? "",
        entry.curveTypeNeedsTemplate === true ? "1" : "0",
        (entry.curveTypeReasons ?? []).join("\u001d"),
        getTemplateSelectionId(
          props.fileTemplateSelectionsByFileId?.[entry.fileId ?? ""] ??
            props.currentTemplateSelection ??
            { kind: "auto" },
        ),
      ].join("\u001f")).join("\u001e"),
    ].join("\u001c");
  }

  private updateTreeModel(signature: string): void {
    if (signature === this.treeModel.signature) {
      return;
    }

    const items = buildExplorerTree(this.props.files);
    this.treeModel = {
      folderKeys: collectExplorerFolderKeys(items),
      items,
      signature,
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
    this.props.onListScroll(event);
    this.scheduleFileItemHoverLayout();
  };

  private readonly handleTreeSelect = ({ element }: ITreeSelectionEvent<FileTreeNode>): void => {
    if (element.kind === "folder") {
      return;
    }

    this.props.onSelectFile(element.entry?.fileId ?? null);
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
        enabled: false,
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

    if (element.entry) {
      this.renderFileItem(
        element.entry,
        this.props.selectedFileId === element.entry.fileId,
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

  private resolveFileTemplateLabel(fileEntry: ExplorerFileEntry): string {
    const selection = this.resolveFileTemplateSelection(fileEntry.fileId);
    const currentSelection = this.props.currentTemplateSelection ?? {
      kind: "auto",
    };

    if (selection.kind === "auto") {
      return localize("template.autoExtraction", "Auto extraction");
    }

    if (
      currentSelection.kind === "template" &&
      selection.templateId === currentSelection.templateId
    ) {
      return this.props.currentTemplateLabel || selection.templateId;
    }

    return this.props.templateRecords?.find(template => template.id === selection.templateId)?.name ||
      selection.templateId;
  }

  private resolveFileTemplateSelection(fileId: string | null | undefined): TemplateSelection {
    const currentSelection: TemplateSelection = this.props.currentTemplateSelection ?? {
      kind: "auto",
    };
    return resolveTemplateSelectionForFile(
      fileId,
      this.props.fileTemplateSelectionsByFileId ?? {},
      currentSelection,
    );
  }

  private renderFileItem(
    fileEntry: ExplorerFileEntry,
    isSelected: boolean,
    template: FileItemTemplate,
  ): void {
    const fileName = getFileName(fileEntry);
    const assessment = createFileItemAssessment(
      fileEntry,
      this.resolveFileTemplateLabel(fileEntry),
    );
    const { host } = template;

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
    if (fileEntry?.fileId) {
      host.dataset.fileId = fileEntry.fileId;
    } else {
      delete host.dataset.fileId;
    }
    if (assessment) {
      host.dataset.autoType = assessment.type;
      host.dataset.autoConfidence = assessment.confidence;
      host.dataset.autoReasons = assessment.reasons.join(FILE_ASSESSMENT_REASON_SEPARATOR);
      host.dataset.autoTemplate = assessment.template;
      host.dataset.autoWarning = assessment.isWarning ? "true" : "false";
    } else {
      delete host.dataset.autoType;
      delete host.dataset.autoConfidence;
      delete host.dataset.autoReasons;
      delete host.dataset.autoTemplate;
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
      },
    );
    if (assessment) {
      template.assessment.textContent = assessment.label;
      template.assessment.removeAttribute("title");
      template.assessment.dataset.warning = assessment.isWarning ? "true" : "false";
      template.assessment.hidden = false;
    } else {
      template.assessment.textContent = "";
      template.assessment.removeAttribute("title");
      delete template.assessment.dataset.warning;
      template.assessment.hidden = true;
    }
    template.removeButton.setAttribute(
      "aria-label",
      localize("files.import.removeFileButtonLabel", "Remove {fileName}", { fileName }),
    );
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
    const assessment = document.createElement("span");
    assessment.className = "file-list-item-assessment";
    assessment.hidden = true;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "file-list-item-remove";
    const template: FileItemTemplate = {
      actions,
      assessment,
      content,
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

    actions.append(assessment, removeButton);
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

  private getProcessedFile(fileId: string | null | undefined): ProcessedEntry | null {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return null;
    }

    return (Array.isArray(this.props.thumbnailFiles) ? this.props.thumbnailFiles : [])
      .find((entry) => String(entry?.fileId ?? "").trim() === normalizedFileId) ?? null;
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
          this.hoverContextViewElement = null;
        }
      },
    });
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
        container.classList.remove(
          "file-list-hover",
          "file-list-hover--assessment",
          "file-list-hover--thumbnail",
        );
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
    if (this.props.mode === "chart") {
      return this.resolveThumbnailHoverContent(item);
    }

    return this.resolveAssessmentHoverContent(item);
  }

  private resolveThumbnailHoverContent(item: HTMLElement): HoverContent | null {
    if (getEffectiveViewLayout(this.props) === "thumbnail") {
      return null;
    }

    const processedFile = this.getProcessedFile(item.dataset.fileId);
    if (!processedFile) {
      return null;
    }

    return {
      kind: "thumbnail",
      isSelected: item.dataset.selected === "true",
      processedFile,
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
        content.processedFile,
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

  private getHoverThumbnail(file: ProcessedEntry, isActive: boolean): HTMLElement {
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

  private getThumbnailPlotModel(fileId: string): ExplorerThumbnailPlotModel | null {
    const normalizedFileId = String(fileId ?? "").trim();
    return normalizedFileId
      ? this.props.thumbnailPlotModelsByFileId?.[normalizedFileId] ?? null
      : null;
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

function getEffectiveViewLayout(
  props: Pick<ExplorerViewerProps, "mode" | "viewLayout">,
): FilesViewLayout {
  return props.mode === "chart" ? props.viewLayout ?? "tree" : "tree";
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
