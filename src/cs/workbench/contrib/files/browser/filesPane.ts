/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import type { IFileService } from "src/cs/platform/files/common/files";
import type {
  ExplorerSelectionKind,
  IExplorerService,
} from "src/cs/workbench/services/explorer/common/explorer";
import type {
  FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import type {
  FilesViewLayout,
} from "src/cs/workbench/contrib/files/common/files";
import type { ExplorerFileEntry } from "src/cs/workbench/services/explorer/common/explorerModel";
import type { ExplorerThumbnailPlotModel } from "src/cs/workbench/services/explorer/common/explorerPaneViewInput";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type { ITemplateService } from "src/cs/workbench/services/template/common/template";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";
import {
  FilesController,
  type ImportSessionFileInfo,
} from "src/cs/workbench/contrib/files/browser/filesController";

import "src/cs/workbench/contrib/files/browser/views/media/filesPane.css";

export type FilesPaneProps = {
  readonly fileConverterBackendService: FileConverterBackend;
  readonly commandService: ICommandService;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly contextViewService: IContextViewService;
  readonly explorerService: IExplorerService;
  readonly selectionKind: ExplorerSelectionKind;
  readonly filesService: IFileService;
  readonly templateService: ITemplateService;
  readonly activePlotType?: PlotType;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly thumbnailService: IThumbnailService;
  readonly currentTemplateLabel?: string;
  readonly currentTemplateSelection?: TemplateSelection;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly files?: ExplorerFileEntry[];
  readonly mode?: WorkbenchMainPart;
  readonly viewLayout?: FilesViewLayout;
  readonly thumbnailFiles?: ProcessedEntry[];
  readonly thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFileSelected: (fileId: string | null) => void;
  readonly onFilesAdded?: (files: ImportSessionFileInfo[]) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFilesRemoved?: (fileIds: string[]) => void;
  readonly selectedFileId: string | null;
};

export class FilesPane implements IDisposable {
  private readonly host: HTMLElement;
  private readonly body: HTMLDivElement;
  private readonly sessionHost: HTMLDivElement;
  private readonly controller: FilesController;
  private props: FilesPaneProps;
  private disposed = false;

  constructor(host: HTMLElement, props: FilesPaneProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("files-pane");

    const { body, sessionHost } = this.createDom();
    this.body = body;
    this.sessionHost = sessionHost;
    this.host.appendChild(this.body);

    this.controller = new FilesController(this.sessionHost, {
      fileConverterBackendService: props.fileConverterBackendService,
      commandService: props.commandService,
      contextMenuService: props.contextMenuService,
      contextViewService: props.contextViewService,
      explorerService: props.explorerService,
      selectionKind: props.selectionKind,
      files: props.files,
      filesService: props.filesService,
      activePlotType: props.activePlotType,
      originOpenPlotOptions: props.originOpenPlotOptions,
      plotAxisSettings: props.plotAxisSettings,
      thumbnailService: props.thumbnailService,
      templateService: props.templateService,
      currentTemplateLabel: props.currentTemplateLabel,
      currentTemplateSelection: props.currentTemplateSelection,
      fileTemplateSelectionsByFileId: props.fileTemplateSelectionsByFileId,
      mode: props.mode,
      viewLayout: props.viewLayout,
      thumbnailFiles: props.thumbnailFiles,
      thumbnailPlotModelsByFileId: props.thumbnailPlotModelsByFileId,
      onFileImported: props.onFileImported,
      onFileSelected: props.onFileSelected,
      onFilesAdded: props.onFilesAdded,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFilesRemoved: props.onFilesRemoved,
      selectedFileId: props.selectedFileId,
    });
  }

  setProps(nextProps: FilesPaneProps): void {
    this.props = nextProps;
    this.controller.setProps({
      fileConverterBackendService: nextProps.fileConverterBackendService,
      commandService: nextProps.commandService,
      contextMenuService: nextProps.contextMenuService,
      contextViewService: nextProps.contextViewService,
      explorerService: nextProps.explorerService,
      selectionKind: nextProps.selectionKind,
      files: nextProps.files,
      filesService: nextProps.filesService,
      activePlotType: nextProps.activePlotType,
      originOpenPlotOptions: nextProps.originOpenPlotOptions,
      plotAxisSettings: nextProps.plotAxisSettings,
      thumbnailService: nextProps.thumbnailService,
      templateService: nextProps.templateService,
      currentTemplateLabel: nextProps.currentTemplateLabel,
      currentTemplateSelection: nextProps.currentTemplateSelection,
      fileTemplateSelectionsByFileId: nextProps.fileTemplateSelectionsByFileId,
      mode: nextProps.mode,
      viewLayout: nextProps.viewLayout,
      thumbnailFiles: nextProps.thumbnailFiles,
      thumbnailPlotModelsByFileId: nextProps.thumbnailPlotModelsByFileId,
      onFileImported: nextProps.onFileImported,
      onFileSelected: nextProps.onFileSelected,
      onFilesAdded: nextProps.onFilesAdded,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFilesRemoved: nextProps.onFilesRemoved,
      selectedFileId: nextProps.selectedFileId,
    });
  }

  layout(height: number, width: number): void {
    const nextHeight = Math.max(0, height);
    const nextWidth = Math.max(0, width);
    this.body.style.height = `${nextHeight}px`;
    this.body.style.width = `${nextWidth}px`;
    this.sessionHost.style.height = `${nextHeight}px`;
    this.sessionHost.style.width = `${nextWidth}px`;
    this.controller.layout(nextHeight, nextWidth);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.controller.dispose();
    this.host.classList.remove("files-pane");
    this.body.remove();
  }

  private createDom(): {
    readonly body: HTMLDivElement;
    readonly sessionHost: HTMLDivElement;
  } {
    const body = document.createElement("div");
    body.className = "files-pane-body";

    const sessionHost = document.createElement("div");
    sessionHost.className = "files-pane-session-host";

    body.append(sessionHost);

    return { body, sessionHost };
  }
}

