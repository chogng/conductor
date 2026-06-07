import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type {
  FileEntry,
  FilesPaneRef,
  FilesViewMode,
} from "src/cs/workbench/contrib/files/common/files";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { CalculatedDataByKey } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import type { IThumbnailService } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailService";
import {
  FilesController,
  type ImportSessionFileInfo,
} from "src/cs/workbench/contrib/files/browser/filesController";

import "src/cs/workbench/contrib/files/browser/views/media/filesPane.css";

export type FilesPaneProps = {
  readonly analysisFileService: IAnalysisFileService;
  readonly commandService: ICommandService;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly contextViewService: IContextViewService;
  readonly filesService: IFileService;
  readonly filesPaneRef: { current: FilesPaneRef | null };
  readonly activePlotType?: PlotType;
  readonly calculatedDataByKey?: CalculatedDataByKey;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly thumbnailService: IThumbnailService;
  readonly files?: FileEntry[];
  readonly mode?: WorkbenchMainPart;
  readonly viewMode?: FilesViewMode;
  readonly cleanedData?: CleanedEntry[];
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFilesAdded?: (files: ImportSessionFileInfo[]) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFilesRemoved?: (fileIds: string[]) => void;
  readonly onFileSelected?: (fileId: string | null) => void;
  readonly selectedFileId?: string | null;
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
      analysisFileService: props.analysisFileService,
      commandService: props.commandService,
      contextViewService: props.contextViewService,
      files: props.files,
      filesService: props.filesService,
      activePlotType: props.activePlotType,
      calculatedDataByKey: props.calculatedDataByKey,
      originOpenPlotOptions: props.originOpenPlotOptions,
      plotAxisSettings: props.plotAxisSettings,
      thumbnailService: props.thumbnailService,
      mode: props.mode,
      viewMode: props.viewMode,
      cleanedData: props.cleanedData,
      onFileImported: props.onFileImported,
      onFilesAdded: props.onFilesAdded,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFilesRemoved: props.onFilesRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedFileId,
    });

    props.filesPaneRef.current = this.controller;
  }

  setProps(nextProps: FilesPaneProps): void {
    this.props = nextProps;
    nextProps.filesPaneRef.current = this.controller;
    this.controller.setProps({
      analysisFileService: nextProps.analysisFileService,
      commandService: nextProps.commandService,
      contextViewService: nextProps.contextViewService,
      files: nextProps.files,
      filesService: nextProps.filesService,
      activePlotType: nextProps.activePlotType,
      calculatedDataByKey: nextProps.calculatedDataByKey,
      originOpenPlotOptions: nextProps.originOpenPlotOptions,
      plotAxisSettings: nextProps.plotAxisSettings,
      thumbnailService: nextProps.thumbnailService,
      mode: nextProps.mode,
      viewMode: nextProps.viewMode,
      cleanedData: nextProps.cleanedData,
      onFileImported: nextProps.onFileImported,
      onFilesAdded: nextProps.onFilesAdded,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFilesRemoved: nextProps.onFilesRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedFileId,
    });
  }

  openFileDialog(): void {
    this.controller.openFileDialog();
  }

  removeSelectedFolder(): void {
    this.controller.removeSelectedFolder();
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
    if (this.props.filesPaneRef.current === this.controller) {
      this.props.filesPaneRef.current = null;
    }
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
