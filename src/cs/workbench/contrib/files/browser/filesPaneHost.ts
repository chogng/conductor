/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import { toAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import {
  IContextMenuService,
  IContextViewService,
  type IContextMenuService as IContextMenuServiceType,
  type IContextViewService as IContextViewServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import {
  IFileService,
  type IFileService as IFileServiceType,
} from "src/cs/platform/files/common/files";
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  FilesPane,
  type FilesPaneProps,
} from "src/cs/workbench/contrib/files/browser/filesPane";
import {
  ADD_FOLDER_ACTION_ID,
  MORE_ACTIONS_ACTION_ID,
  REMOVE_FOLDER_ACTION_ID,
  TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
} from "src/cs/workbench/contrib/files/common/files";
import {
  ExplorerViewId,
  IExplorerService,
  type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/services/explorer/common/explorer";
import type { ExplorerPaneInput } from "src/cs/workbench/services/explorer/common/explorerPaneViewInput";
import {
  IFileConverterBackendService,
  type FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  ITemplateService,
  type ITemplateService as ITemplateServiceType,
} from "src/cs/workbench/services/template/common/template";
import {
  IThumbnailService,
  type IThumbnailService as IThumbnailServiceType,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";

export class FilesPaneHost extends ViewPane {
  private readonly host: HTMLDivElement;
  private view: FilesPane | null = null;
  private input: ExplorerPaneInput | null = null;

  constructor(
    @ICommandService private readonly commandService: ICommandServiceType,
    @IContextMenuService private readonly contextMenuService: IContextMenuServiceType,
    @IContextViewService private readonly contextViewService: IContextViewServiceType,
    @IExplorerService private readonly explorerService: IExplorerServiceType,
    @IFileConverterBackendService private readonly fileConverterBackendService: FileConverterBackend,
    @IFileService private readonly filesService: IFileServiceType,
    @IThumbnailService private readonly thumbnailService: IThumbnailServiceType,
    @ITemplateService private readonly templateService: ITemplateServiceType,
  ) {
    super({
      id: ExplorerViewId,
      title: localize("files.explorerSection", "Explorer"),
      className: "files-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.host = document.createElement("div");
    this.host.className = "files-pane-root";
    this.body.append(this.host);
    this._register(this.explorerService.onDidChangePaneInput(input => {
      this.update(input);
    }));
    this._register(this.explorerService.onDidChangeViewLayout(() => {
      this.update(this.input);
    }));
    this.update(this.explorerService.getPaneInput());
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;
    if (!input) {
      return;
    }

    const props = this.createViewProps(input);
    if (!this.view) {
      this.view = new FilesPane(this.host, props);
    } else {
      this.view.setProps(props);
    }
    if (
      this.element.isConnected &&
      this.element.clientHeight > 0 &&
      this.element.clientWidth > 0
    ) {
      this.layout(this.element.clientHeight, this.element.clientWidth);
    }
  }

  public dispose(): void {
    this.view?.dispose();
    this.view = null;
    super.dispose();
  }

  protected override layoutBody(height: number, width: number): void {
    this.body.style.height = `${height}px`;
    this.body.style.width = `${width}px`;
    this.host.style.height = `${height}px`;
    this.host.style.width = `${width}px`;
    this.view?.layout(height, width);
  }

  public getActions(): readonly WorkbenchSidebarAction[] {
    return [
      {
        ...toAction({
          id: MORE_ACTIONS_ACTION_ID,
          label: localize("files.moreActions", "More Actions"),
          tooltip: localize("files.moreActions", "More Actions"),
          class: "sidebar_header_action",
          run: (event) => this.showMoreActions(getActionAnchor(event), this.createViewProps(this.input)),
        }),
        icon: LxIcon.moreHorizontal,
      } satisfies WorkbenchSidebarAction,
    ];
  }

  private showMoreActions(anchor: HTMLElement, props: FilesPaneProps): void {
    const canRemoveFolder = hasFolder(props.files);
    const isChartMode = props.mode === "chart";
    const isThumbnailView = isChartMode && props.explorerService.viewLayout === "thumbnail";
    props.contextMenuService.showContextMenu({
      autoSelectFirstItem: true,
      getAnchor: () => anchor,
      getActions: () => [
        createMenuAction({
          checked: isThumbnailView,
          enabled: isChartMode,
          id: TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
          label: localize("files.thumbnailView", "Thumbnail"),
          run: () => {
            void props.commandService.executeCommand(TOGGLE_THUMBNAIL_VIEW_ACTION_ID);
          },
        }),
        createMenuAction({
          icon: LxIcon.add,
          id: ADD_FOLDER_ACTION_ID,
          label: localize("files.addFolder", "Add Folder"),
          run: () => {
            void props.commandService.executeCommand(ADD_FOLDER_ACTION_ID);
          },
        }),
        createMenuAction({
          enabled: canRemoveFolder,
          icon: LxIcon.remove,
          id: REMOVE_FOLDER_ACTION_ID,
          label: localize("files.removeFolder", "Remove Folder"),
          run: () => {
            void props.commandService.executeCommand(REMOVE_FOLDER_ACTION_ID);
          },
        }),
      ],
    });
  }

  private createViewProps(input: ExplorerPaneInput | null): FilesPaneProps {
    const props = input ?? EMPTY_EXPLORER_PANE_INPUT;
    return {
      ...props,
      commandService: this.commandService,
      contextMenuService: this.contextMenuService,
      contextViewService: this.contextViewService,
      explorerService: this.explorerService,
      fileConverterBackendService: this.fileConverterBackendService,
      filesService: this.filesService,
      thumbnailService: this.thumbnailService,
      templateService: this.templateService,
      viewLayout: this.explorerService.viewLayout,
    };
  }
}

const EMPTY_EXPLORER_PANE_INPUT: ExplorerPaneInput = {
  files: [],
  mode: "table",
  onFileImported: () => undefined,
  onFileRemoved: () => undefined,
  onFileSelected: () => undefined,
  onFilesAdded: () => undefined,
  onFilesRemoved: () => undefined,
  onFilesReplaced: () => undefined,
  selectedFileId: null,
  selectionKind: "raw",
  thumbnailFiles: [],
};

function getActionAnchor(event: unknown): HTMLElement {
  if (
    event instanceof MouseEvent &&
    event.currentTarget instanceof HTMLElement
  ) {
    return event.currentTarget;
  }
  return document.body;
}

function hasFolder(files: FilesPaneProps["files"]): boolean {
  return Array.isArray(files) && files.some(file => {
    const relativePath = String(file.relativePath ?? "");
    return relativePath.includes("/");
  });
}
